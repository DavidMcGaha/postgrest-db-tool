/**
 * Mock Server
 * Intercepts fetch() calls to DEMO_BASE_URL (http://demo) and returns
 * responses synthesised from DEMO_ROWS and DEMO_OPENAPI_SPEC.
 *
 * Supported PostgREST features:
 *   • Schema discovery  GET /
 *   • Table queries     GET /{table}  with select, order, limit, offset, filters
 *   • RPC functions     POST /rpc/search_posts  |  GET /rpc/get_dashboard_stats
 *   • Filters           eq, neq, gt, gte, lt, lte, like, ilike, is, in, not.*
 *   • Column select     comma-separated list; * for all; embedded resource skipped
 *   • Ordering          col.asc / col.desc, nullslast/nullsfirst, multi-column
 *   • Content-Range     returned for correct pagination display
 */
const MockServer = (() => {
  // ── Helpers ─────────────────────────────────────────────────────────────────

  function makeResponse(body, status, extraHeaders) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
    return new Response(JSON.stringify(body), { status, headers });
  }

  function notFound(table) {
    return makeResponse(
      { code: 'PGRST116', message: `Relation "${table}" does not exist`, details: '', hint: '' },
      404
    );
  }

  // ── Filtering ────────────────────────────────────────────────────────────────

  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);

  function coerce(raw, cell) {
    if (raw === 'null')  return null;
    if (raw === 'true')  return true;
    if (raw === 'false') return false;
    if (typeof cell === 'number' && raw !== '' && !isNaN(Number(raw))) return Number(raw);
    return raw;
  }

  function matchFilter(cellValue, op, filterValue) {
    const val = coerce(filterValue, cellValue);
    switch (op) {
      case 'eq':    return cellValue === val;
      case 'neq':   return cellValue !== val;
      case 'gt':    return cellValue >   val;
      case 'gte':   return cellValue >=  val;
      case 'lt':    return cellValue <   val;
      case 'lte':   return cellValue <=  val;
      case 'is':    return val === null ? cellValue === null : cellValue === val;
      case 'like': {
        const pattern = filterValue.replace(/%/g, '.*').replace(/\*/g, '.*').replace(/_/g, '.');
        return new RegExp('^' + pattern + '$').test(String(cellValue ?? ''));
      }
      case 'ilike': {
        const pattern = filterValue.replace(/%/g, '.*').replace(/\*/g, '.*').replace(/_/g, '.');
        return new RegExp('^' + pattern + '$', 'i').test(String(cellValue ?? ''));
      }
      case 'in': {
        const list = filterValue.replace(/^\(|\)$/g, '').split(',').map(s => s.trim());
        return list.some(v => String(cellValue) === v);
      }
      default:
        return true;
    }
  }

  function applyFilters(rows, params) {
    for (const [key, value] of params.entries()) {
      if (RESERVED.has(key)) continue;

      let negate = false;
      let rest   = value;

      if (rest.startsWith('not.')) {
        negate = true;
        rest   = rest.slice(4);
      }

      const dot = rest.indexOf('.');
      if (dot < 0) continue;
      const op  = rest.slice(0, dot);
      const val = rest.slice(dot + 1);

      rows = rows.filter(row => {
        const result = matchFilter(row[key], op, val);
        return negate ? !result : result;
      });
    }
    return rows;
  }

  // ── Column Selection ─────────────────────────────────────────────────────────

  function applySelect(rows, selectParam) {
    if (!selectParam || selectParam === '*') return rows;

    // Strip any embedded resource references (e.g. users(id,name) → skip)
    const cols = selectParam
      .split(',')
      .map(s => s.trim())
      .filter(s => !s.includes('('));  // skip embedded

    if (!cols.length) return rows;

    return rows.map(row => {
      const out = {};
      for (const c of cols) {
        const [alias, col] = c.includes(':') ? c.split(':').reverse() : [c, c];
        if (col in row) out[alias] = row[col];
      }
      return out;
    });
  }

  // ── Ordering ─────────────────────────────────────────────────────────────────

  function applyOrder(rows, orderParam) {
    if (!orderParam) return rows;

    const parts = orderParam.split(',').map(p => {
      const segs = p.trim().split('.');
      const col  = segs[0];
      const dir  = segs.includes('desc') ? 'desc' : 'asc';
      const nulls = segs.includes('nullsfirst') ? 'first' : 'last';
      return { col, dir, nulls };
    });

    return [...rows].sort((a, b) => {
      for (const { col, dir, nulls } of parts) {
        const av = a[col], bv = b[col];
        if (av === bv) continue;
        if (av === null || av === undefined) return nulls === 'first' ? -1 :  1;
        if (bv === null || bv === undefined) return nulls === 'first' ?  1 : -1;
        let cmp;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else if (typeof av === 'boolean') cmp = (av ? 1 : 0) - (bv ? 1 : 0);
        else cmp = String(av).localeCompare(String(bv));
        if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  // ── Table Request Handler ─────────────────────────────────────────────────────

  function handleTable(tableName, params) {
    const tableData = DEMO_ROWS[tableName];
    if (!tableData) return notFound(tableName);

    let rows = applyFilters([...tableData], params);
    rows     = applyOrder(rows, params.get('order'));

    const total  = rows.length;
    const limit  = Math.max(1, parseInt(params.get('limit')  || '25', 10));
    const offset = Math.max(0, parseInt(params.get('offset') || '0',  10));
    const page   = rows.slice(offset, offset + limit);
    const result = applySelect(page, params.get('select'));

    const end   = offset + page.length - 1;
    const range = page.length > 0 ? `${offset}-${end}/${total}` : `*/${total}`;
    return makeResponse(result, 200, { 'Content-Range': range });
  }

  // ── RPC Handlers ─────────────────────────────────────────────────────────────

  function handleRpc(fnName, params, bodyText) {
    let args = {};
    try { args = bodyText ? JSON.parse(bodyText) : {}; } catch { /* ignore */ }

    // Also accept GET query-param style args
    for (const [k, v] of params.entries()) {
      if (!RESERVED.has(k)) args[k] = v;
    }

    if (fnName === 'search_posts') {
      const q           = String(args.query || '').toLowerCase();
      const maxResults  = Math.min(parseInt(args.max_results || 10, 10), 100);
      if (!q) return makeResponse([], 200, { 'Content-Range': '*/0' });
      const results = DEMO_ROWS.posts
        .filter(p => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q))
        .slice(0, maxResults)
        .map(({ id, title, slug, user_id, published, view_count, created_at }) =>
          ({ id, title, slug, user_id, published, view_count, created_at }));
      return makeResponse(results, 200, { 'Content-Range': `0-${results.length - 1}/${results.length}` });
    }

    if (fnName === 'get_dashboard_stats') {
      const stats = [{
        total_users:     DEMO_ROWS.users.length,
        active_users:    DEMO_ROWS.users.filter(u => u.active).length,
        total_posts:     DEMO_ROWS.posts.length,
        published_posts: DEMO_ROWS.posts.filter(p => p.published).length,
        total_comments:  DEMO_ROWS.comments.length,
        total_products:  DEMO_ROWS.products.length,
        total_orders:    DEMO_ROWS.orders.length,
        revenue:         +DEMO_ROWS.orders
          .filter(o => o.status !== 'cancelled' && o.status !== 'pending')
          .reduce((s, o) => s + o.total, 0).toFixed(2)
      }];
      return makeResponse(stats, 200, { 'Content-Range': '0-0/1' });
    }

    return makeResponse(
      { code: 'PGRST202', message: `Function "${fnName}" could not be found`, details: '', hint: '' },
      404
    );
  }

  // ── Main Request Dispatcher ───────────────────────────────────────────────────

  function dispatch(url, init) {
    const urlObj  = new URL(url);
    const path    = urlObj.pathname;
    const params  = urlObj.searchParams;
    const method  = (init && init.method ? init.method : 'GET').toUpperCase();
    const headers = init && init.headers ? new Headers(init.headers) : new Headers();
    const body    = init && init.body ? init.body : '';

    // Schema discovery (ignore Accept-Profile probe — return spec for any request to /)
    if (path === '/') {
      return makeResponse(DEMO_OPENAPI_SPEC, 200);
    }

    // RPC function call
    if (path.startsWith('/rpc/')) {
      const fnName = path.replace('/rpc/', '');
      return handleRpc(fnName, params, body);
    }

    // Table / view query
    const tableName = path.replace(/^\//, '');
    return handleTable(tableName, params);
  }

  // ── Fetch Interceptor ─────────────────────────────────────────────────────────

  function install() {
    const _realFetch = window.fetch.bind(window);

    window.fetch = function mockFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.startsWith(DEMO_BASE_URL)) {
        // Simulate a tiny async delay so the UI shows "loading" state
        return new Promise(resolve => setTimeout(() => resolve(dispatch(url, init)), 40));
      }
      return _realFetch(input, init);
    };
  }

  return { install };
})();

// Activate immediately so it intercepts any fetch before the app runs
MockServer.install();
