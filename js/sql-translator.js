/**
 * SQL Translator
 * Converts between URL Builder state and SQL SELECT statements.
 *
 * Public API:
 *   SqlTranslator.toSQL(state, schema)   → SQL string
 *   SqlTranslator.fromSQL(sqlString)     → builderState object
 *
 * builderState shape:
 * {
 *   resource: string,
 *   select:   string,           // comma-separated columns, '' = *
 *   filters:  [{ col, op, val, negate }],
 *   orders:   [{ col, dir }],
 *   embeds:   [{ resource, alias, hint, joinType, columns, filter }],
 *   limit:    string,
 *   offset:   string
 * }
 */
const SqlTranslator = (() => {

  // ── Operator Maps ────────────────────────────────────────────────────────────

  const OP_TO_SQL = {
    eq:    (col, val) => `${col} = ${_sqlVal(val)}`,
    neq:   (col, val) => `${col} <> ${_sqlVal(val)}`,
    gt:    (col, val) => `${col} > ${_sqlVal(val)}`,
    gte:   (col, val) => `${col} >= ${_sqlVal(val)}`,
    lt:    (col, val) => `${col} < ${_sqlVal(val)}`,
    lte:   (col, val) => `${col} <= ${_sqlVal(val)}`,
    like:  (col, val) => `${col} LIKE ${_sqlVal(val)}`,
    ilike: (col, val) => `${col} ILIKE ${_sqlVal(val)}`,
    is:    (col, val) => {
      const v = val.toLowerCase();
      if (v === 'null')  return `${col} IS NULL`;
      if (v === 'true')  return `${col} IS TRUE`;
      if (v === 'false') return `${col} IS FALSE`;
      return `${col} IS ${_sqlVal(val)}`;
    },
    in:    (col, val) => {
      const items = val.replace(/^\(|\)$/g, '').split(',').map(s => _sqlVal(s.trim()));
      return `${col} IN (${items.join(', ')})`;
    },
    fts:   (col, val) => `${col} @@ to_tsquery(${_sqlVal(val)})`,
    cs:    (col, val) => `${col} @> ${_sqlVal(val)}`,
    cd:    (col, val) => `${col} <@ ${_sqlVal(val)}`,
    ov:    (col, val) => `${col} && ${_sqlVal(val)}`
  };

  // Reverse map: SQL tokens → PostgREST operator
  const SQL_TO_OP = [
    { re: /^IS\s+NULL$/i,                  op: 'is',    val: () => 'null' },
    { re: /^IS\s+NOT\s+NULL$/i,            op: 'not.is', val: () => 'null' },
    { re: /^IS\s+TRUE$/i,                  op: 'is',    val: () => 'true' },
    { re: /^IS\s+NOT\s+TRUE$/i,            op: 'not.is', val: () => 'true' },
    { re: /^IS\s+FALSE$/i,                 op: 'is',    val: () => 'false' },
    { re: /^IS\s+NOT\s+FALSE$/i,           op: 'not.is', val: () => 'false' },
    { re: /^@@\s+to_tsquery\((.+)\)$/i,   op: 'fts',   val: m => _unquoteSql(m[1]) },
    { re: /^@>\s*(.+)$/,                   op: 'cs',    val: m => _unquoteSql(m[1]) },
    { re: /^<@\s*(.+)$/,                   op: 'cd',    val: m => _unquoteSql(m[1]) },
    { re: /^&&\s*(.+)$/,                   op: 'ov',    val: m => _unquoteSql(m[1]) },
    { re: /^NOT\s+IN\s*\((.+)\)$/i,        op: 'not.in', val: m => '(' + m[1] + ')' },
    { re: /^IN\s*\((.+)\)$/i,              op: 'in',    val: m => '(' + m[1] + ')' },
    { re: /^NOT\s+ILIKE\s+(.+)$/i,         op: 'not.ilike', val: m => _unquoteSql(m[1]) },
    { re: /^ILIKE\s+(.+)$/i,               op: 'ilike', val: m => _unquoteSql(m[1]) },
    { re: /^NOT\s+LIKE\s+(.+)$/i,          op: 'not.like', val: m => _unquoteSql(m[1]) },
    { re: /^LIKE\s+(.+)$/i,                op: 'like',  val: m => _unquoteSql(m[1]) },
    { re: /^<>\s*(.+)$/,                   op: 'neq',   val: m => _unquoteSql(m[1]) },
    { re: /^!=\s*(.+)$/,                   op: 'neq',   val: m => _unquoteSql(m[1]) },
    { re: /^>=\s*(.+)$/,                   op: 'gte',   val: m => _unquoteSql(m[1]) },
    { re: /^<=\s*(.+)$/,                   op: 'lte',   val: m => _unquoteSql(m[1]) },
    { re: /^>\s*(.+)$/,                    op: 'gt',    val: m => _unquoteSql(m[1]) },
    { re: /^<\s*(.+)$/,                    op: 'lt',    val: m => _unquoteSql(m[1]) },
    { re: /^=\s*(.+)$/,                    op: 'eq',    val: m => _unquoteSql(m[1]) }
  ];

  // ── Value Formatting ─────────────────────────────────────────────────────────

  function _sqlVal(v) {
    if (v === null || v === undefined || v.toString().toLowerCase() === 'null') return 'NULL';
    if (v === true  || v.toString().toLowerCase() === 'true')  return 'TRUE';
    if (v === false || v.toString().toLowerCase() === 'false') return 'FALSE';
    if (!isNaN(v) && v !== '') return v;
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  function _unquoteSql(s) {
    s = s.trim();
    if ((s.startsWith("'") && s.endsWith("'")) ||
        (s.startsWith('"') && s.endsWith('"'))) {
      return s.slice(1, -1).replace(/''/g, "'");
    }
    return s;
  }

  // ── toSQL ────────────────────────────────────────────────────────────────────

  /**
   * @param {object} state - builderState
   * @param {object} [schema] - parsed schema from SchemaBrowser.getSchema() for FK resolution
   * @returns {string} formatted SQL
   */
  function toSQL(state, schema) {
    if (!state || !state.resource) return '';

    // RPC functions
    if (state.isFunction) {
      return _functionToSQL(state);
    }

    const lines = [];

    // SELECT
    const selectCols = state.select && state.select.trim() && state.select.trim() !== '*'
      ? state.select.split(',').map(c => c.trim()).join(',\n       ')
      : '*';
    lines.push(`SELECT ${selectCols}`);

    // FROM
    lines.push(`FROM   ${state.resource}`);

    // JOINs from embeds
    if (state.embeds && state.embeds.length) {
      for (const embed of state.embeds) {
        if (!embed.resource) continue;
        const joinType = embed.joinType === '!inner' ? 'INNER JOIN' : 'LEFT JOIN';
        const alias    = embed.alias ? ` AS ${embed.alias}` : '';
        const onClause = _resolveJoinOn(state.resource, embed, schema);
        const cols     = embed.columns && embed.columns !== '*' ? embed.columns : null;

        if (cols) {
          lines.push(`-- columns from join: ${cols}`);
        }
        lines.push(`${joinType} ${embed.resource}${alias}${onClause}`);
      }
    }

    // WHERE
    const whereClauses = [];
    if (state.filters && state.filters.length) {
      for (const f of state.filters) {
        if (!f.col || !f.op) continue;
        const opFn = OP_TO_SQL[f.op.replace('not.', '')];
        if (!opFn) continue;
        let clause = opFn(f.col, f.val);
        if (f.op.startsWith('not.')) clause = `NOT (${clause})`;
        whereClauses.push(clause);
      }
    }
    if (whereClauses.length) {
      lines.push(`WHERE  ${whereClauses.join('\n  AND ')}`);
    }

    // ORDER BY
    if (state.orders && state.orders.length) {
      const orderParts = state.orders
        .filter(o => o.col)
        .map(o => `${o.col} ${(o.dir || 'asc').toUpperCase()}`);
      if (orderParts.length) {
        lines.push(`ORDER BY ${orderParts.join(', ')}`);
      }
    }

    // LIMIT / OFFSET
    if (state.limit && state.limit !== '0') {
      lines.push(`LIMIT  ${state.limit}`);
    }
    if (state.offset && state.offset !== '0') {
      lines.push(`OFFSET ${state.offset}`);
    }

    return lines.join('\n') + ';';
  }

  function _functionToSQL(state) {
    const args = state.fnArgs || {};
    const argList = Object.entries(args)
      .map(([k, v]) => `${k} := ${_sqlVal(v)}`)
      .join(', ');
    const selectCols = state.select && state.select !== '*' ? state.select : '*';
    let sql = `SELECT ${selectCols}\nFROM   ${state.resource}(${argList})`;
    if (state.limit && state.limit !== '0') sql += `\nLIMIT  ${state.limit}`;
    if (state.offset && state.offset !== '0') sql += `\nOFFSET ${state.offset}`;
    return sql + ';';
  }

  /**
   * Resolve the ON clause for a JOIN by inspecting FK metadata in the schema.
   * Falls back to a comment placeholder if FK cannot be determined.
   */
  function _resolveJoinOn(baseTable, embed, schema) {
    if (!schema) return ` ON ${embed.resource}.??? = ${baseTable}.???  -- FK unknown`;

    const allResources = [...(schema.tables || []), ...(schema.views || [])];

    // Case 1: embed table has a FK pointing to base table
    const embedRes = allResources.find(r => r.name === embed.resource);
    if (embedRes && embedRes.columns) {
      const fkCol = embedRes.columns.find(c => c.isFK && c.fkTable === baseTable);
      if (fkCol) {
        return ` ON ${embed.resource}.${fkCol.name} = ${baseTable}.${fkCol.fkColumn}`;
      }
    }

    // Case 2: base table has a FK pointing to embed table
    const baseRes = allResources.find(r => r.name === baseTable);
    if (baseRes && baseRes.columns) {
      const fkCol = baseRes.columns.find(c => c.isFK && c.fkTable === embed.resource);
      if (fkCol) {
        return ` ON ${baseTable}.${fkCol.name} = ${embed.resource}.${fkCol.fkColumn}`;
      }
    }

    return ` ON ${embed.resource}.??? = ${baseTable}.???  -- FK unknown, edit manually`;
  }

  // ── fromSQL ──────────────────────────────────────────────────────────────────

  /**
   * Parse SQL (the specific dialect toSQL produces) back into builderState.
   * Returns a builderState object. Throws on fatal parse errors.
   * @param {string} sql
   * @returns {object} builderState
   */
  function fromSQL(sql) {
    const state = {
      resource: '',
      select:   '',
      filters:  [],
      orders:   [],
      embeds:   [],
      limit:    '25',
      offset:   '0',
      isFunction: false
    };

    // Strip comments and trailing semicolons; normalise whitespace
    const clean = sql
      .replace(/--[^\n]*/g, ' ')
      .replace(/;+\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) return state;

    // ── Detect function call: SELECT ... FROM fn(...) ──
    const fnMatch = clean.match(/^\s*SELECT\s+(.*?)\s+FROM\s+(\w+)\s*\(([^)]*)\)\s*(LIMIT\s+(\d+))?\s*(OFFSET\s+(\d+))?/i);
    if (fnMatch) {
      state.isFunction = true;
      state.resource   = fnMatch[2];
      state.select     = _normaliseSelect(fnMatch[1]);
      state.fnArgs     = _parseFnArgs(fnMatch[3]);
      if (fnMatch[5]) state.limit  = fnMatch[5];
      if (fnMatch[7]) state.offset = fnMatch[7];
      return state;
    }

    // ── FROM ──
    const fromMatch = clean.match(/\bFROM\s+(\w+)/i);
    if (!fromMatch) throw new Error('Could not find FROM clause.');
    state.resource = fromMatch[1];

    // ── SELECT ──
    const selectMatch = clean.match(/^\s*SELECT\s+(.*?)\s+FROM\b/i);
    if (selectMatch) {
      state.select = _normaliseSelect(selectMatch[1]);
    }

    // ── JOINs → embeds ──
    const joinRe = /\b(LEFT\s+JOIN|INNER\s+JOIN|JOIN)\s+(\w+)(?:\s+AS\s+(\w+))?\s+ON\s+(.+?)(?=\s+(?:LEFT\s+JOIN|INNER\s+JOIN|JOIN|WHERE|ORDER\s+BY|LIMIT|OFFSET)|$)/gi;
    let jm;
    while ((jm = joinRe.exec(clean)) !== null) {
      state.embeds.push({
        resource: jm[2],
        alias:    jm[3] || '',
        hint:     '',
        joinType: /INNER/i.test(jm[1]) ? '!inner' : '',
        columns:  '',
        filter:   ''
      });
    }

    // ── WHERE ──
    const whereMatch = clean.match(/\bWHERE\s+(.*?)(?=\s+(?:ORDER\s+BY|LIMIT|OFFSET)|$)/i);
    if (whereMatch) {
      state.filters = _parseWhere(whereMatch[1]);
    }

    // ── ORDER BY ──
    const orderMatch = clean.match(/\bORDER\s+BY\s+(.*?)(?=\s+(?:LIMIT|OFFSET)|$)/i);
    if (orderMatch) {
      state.orders = _parseOrderBy(orderMatch[1]);
    }

    // ── LIMIT ──
    const limitMatch = clean.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) state.limit = limitMatch[1];

    // ── OFFSET ──
    const offsetMatch = clean.match(/\bOFFSET\s+(\d+)/i);
    if (offsetMatch) state.offset = offsetMatch[1];

    return state;
  }

  function _normaliseSelect(s) {
    s = s.trim();
    if (!s || s === '*') return '';
    // Collapse star with qualifiers
    if (s.trim() === '*') return '';
    return s.split(',').map(c => c.trim()).join(',');
  }

  function _parseFnArgs(s) {
    const args = {};
    if (!s || !s.trim()) return args;
    for (const part of s.split(',')) {
      const m = part.match(/(\w+)\s*:=\s*(.+)/);
      if (m) args[m[1].trim()] = _unquoteSql(m[2].trim());
    }
    return args;
  }

  /**
   * Parse a WHERE clause into an array of { col, op, val } objects.
   * Handles AND-separated conditions (no OR, no nested parens).
   */
  function _parseWhere(whereStr) {
    const filters = [];

    // Split on AND (not inside quotes)
    const conditions = _splitAnd(whereStr);

    for (let cond of conditions) {
      cond = cond.trim();
      if (!cond) continue;

      // Strip outer NOT ( ... ) wrapper
      let negate = false;
      const notWrap = cond.match(/^NOT\s*\((.+)\)$/i);
      if (notWrap) {
        negate = true;
        cond = notWrap[1].trim();
      }

      // col <rest>  — col is first identifier
      const colMatch = cond.match(/^(\w+)\s+(.*)/);
      if (!colMatch) continue;
      const col  = colMatch[1];
      const rest = colMatch[2].trim();

      for (const entry of SQL_TO_OP) {
        const m = rest.match(entry.re);
        if (m) {
          let op  = entry.op;
          const val = entry.val(m);
          if (negate && !op.startsWith('not.')) {
            op = 'not.' + op;
          }
          filters.push({ col, op, val });
          break;
        }
      }
    }

    return filters;
  }

  /** Split by AND but skip content inside single-quotes and parentheses. */
  function _splitAnd(str) {
    const parts = [];
    let depth = 0, inQuote = false, cur = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === "'" && !inQuote) { inQuote = true;  cur += ch; continue; }
      if (ch === "'" &&  inQuote) { inQuote = false; cur += ch; continue; }
      if (inQuote) { cur += ch; continue; }
      if (ch === '(') { depth++; cur += ch; continue; }
      if (ch === ')') { depth--; cur += ch; continue; }
      if (depth === 0 && str.slice(i).match(/^AND\s/i)) {
        parts.push(cur.trim());
        cur = '';
        i += 3;
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function _parseOrderBy(orderStr) {
    return orderStr.split(',').map(part => {
      const segs = part.trim().split(/\s+/);
      return { col: segs[0], dir: (segs[1] || 'ASC').toLowerCase() };
    }).filter(o => o.col);
  }

  // ── Public ───────────────────────────────────────────────────────────────────

  return { toSQL, fromSQL };
})();
