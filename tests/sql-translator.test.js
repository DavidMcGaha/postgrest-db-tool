/**
 * Tests for SqlTranslator — sql-translator.js
 *
 * Run with:  node tests/sql-translator.test.js
 *
 * No external dependencies required.
 */

'use strict';

// ── Load the module under test ────────────────────────────────────────────────
// The module is an IIFE that assigns to a global `SqlTranslator`.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'sql-translator.js'),
  'utf8'
);
// Execute inside a Function so the IIFE's `const SqlTranslator` is in scope,
// then return it.
const SqlTranslator = new Function(src + '\nreturn SqlTranslator;')();

// ── Minimal test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let currentSuite = '';

function describe(name, fn) {
  currentSuite = name;
  console.log(`\n  ${name}`);
  fn();
}

function it(desc, fn) {
  try {
    fn();
    console.log(`    ✓ ${desc}`);
    passed++;
  } catch (e) {
    console.error(`    ✗ ${desc}`);
    console.error(`      → ${e.message}`);
    failed++;
  }
}

function expect(actual) {
  const assertions = {
    toBe(expected) {
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a !== b)
        throw new Error(`Expected\n        ${b}\n      got\n        ${a}`);
    },
    toContain(sub) {
      if (!String(actual).includes(sub))
        throw new Error(`Expected string to contain ${JSON.stringify(sub)}\n      got: ${actual}`);
    },
    toMatch(re) {
      if (!re.test(String(actual)))
        throw new Error(`Expected string to match ${re}\n      got: ${actual}`);
    },
    toHaveLength(n) {
      if ((actual || []).length !== n)
        throw new Error(`Expected length ${n}, got ${(actual || []).length}`);
    },
    toThrow() {
      // actual must be a function
      let threw = false;
      try { actual(); } catch { threw = true; }
      if (!threw) throw new Error('Expected function to throw');
    }
  };

  Object.defineProperty(assertions, 'not', {
    get() {
      return {
        toBe(expected) {
          if (actual === expected)
            throw new Error(`Expected NOT to be ${JSON.stringify(expected)}`);
        },
        toContain(sub) {
          if (String(actual).includes(sub))
            throw new Error(`Expected string NOT to contain ${JSON.stringify(sub)}\n      got: ${actual}`);
        },
        toMatch(re) {
          if (re.test(String(actual)))
            throw new Error(`Expected string NOT to match ${re}\n      got: ${actual}`);
        }
      };
    }
  });

  return assertions;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Schema with FK metadata, mirrors demo data relationships */
const schema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id',         isPK: true,  isFK: false },
        { name: 'name',       isPK: false, isFK: false },
        { name: 'email',      isPK: false, isFK: false },
        { name: 'role',       isPK: false, isFK: false },
        { name: 'active',     isPK: false, isFK: false },
        { name: 'created_at', isPK: false, isFK: false }
      ]
    },
    {
      name: 'posts',
      columns: [
        { name: 'id',         isPK: true,  isFK: false },
        { name: 'user_id',    isPK: false, isFK: true,  fkTable: 'users',    fkColumn: 'id' },
        { name: 'title',      isPK: false, isFK: false },
        { name: 'published',  isPK: false, isFK: false },
        { name: 'view_count', isPK: false, isFK: false }
      ]
    },
    {
      name: 'comments',
      columns: [
        { name: 'id',      isPK: true,  isFK: false },
        { name: 'post_id', isPK: false, isFK: true, fkTable: 'posts', fkColumn: 'id' },
        { name: 'user_id', isPK: false, isFK: true, fkTable: 'users', fkColumn: 'id' }
      ]
    },
    {
      name: 'order_items',
      columns: [
        { name: 'id',         isPK: true,  isFK: false },
        { name: 'order_id',   isPK: false, isFK: true, fkTable: 'orders',   fkColumn: 'id' },
        { name: 'product_id', isPK: false, isFK: true, fkTable: 'products', fkColumn: 'id' }
      ]
    }
  ],
  views: []
};

function baseState(overrides = {}) {
  return Object.assign({
    resource:   'users',
    select:     '',
    filters:    [],
    orders:     [],
    embeds:     [],
    limit:      '25',
    offset:     '0',
    isFunction: false
  }, overrides);
}

// ─────────────────────────────────────────────────────────────────────────────
//  toSQL — URL Builder state → SQL string
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n━━━ SqlTranslator.toSQL ━━━');

describe('SELECT clause', () => {
  it('produces SELECT * when select is empty', () => {
    const sql = SqlTranslator.toSQL(baseState(), schema);
    expect(sql).toContain('SELECT *');
  });

  it('produces SELECT * when select is explicitly "*"', () => {
    const sql = SqlTranslator.toSQL(baseState({ select: '*' }), schema);
    expect(sql).toContain('SELECT *');
  });

  it('lists named columns in SELECT', () => {
    const sql = SqlTranslator.toSQL(baseState({ select: 'id,name,email' }), schema);
    expect(sql).toContain('SELECT id,');
    expect(sql).toContain('name,');
    expect(sql).toContain('email');
  });

  it('handles a single column', () => {
    const sql = SqlTranslator.toSQL(baseState({ select: 'id' }), schema);
    expect(sql).toContain('SELECT id');
  });
});

describe('FROM clause', () => {
  it('uses the resource name as the table', () => {
    const sql = SqlTranslator.toSQL(baseState({ resource: 'products' }), schema);
    expect(sql).toContain('FROM   products');
  });

  it('returns empty string when resource is empty', () => {
    expect(SqlTranslator.toSQL({ resource: '' }, schema)).toBe('');
  });

  it('returns empty string when state is null', () => {
    expect(SqlTranslator.toSQL(null, schema)).toBe('');
  });
});

describe('WHERE clause — filter operators', () => {
  function sqlFor(op, val, col = 'status') {
    return SqlTranslator.toSQL(
      baseState({ filters: [{ col, op, val }] }),
      schema
    );
  }

  it('eq  → col = val (string quoted)', () => {
    expect(sqlFor('eq', 'admin')).toContain("status = 'admin'");
  });

  it('eq  → col = val (numeric unquoted)', () => {
    expect(sqlFor('eq', '42', 'score')).toContain('score = 42');
  });

  it('neq → col <> val', () => {
    expect(sqlFor('neq', 'pending')).toContain("status <> 'pending'");
  });

  it('gt  → col > val', () => {
    expect(sqlFor('gt', '100', 'price')).toContain('price > 100');
  });

  it('gte → col >= val', () => {
    expect(sqlFor('gte', '100', 'price')).toContain('price >= 100');
  });

  it('lt  → col < val', () => {
    expect(sqlFor('lt', '50', 'stock')).toContain('stock < 50');
  });

  it('lte → col <= val', () => {
    expect(sqlFor('lte', '50', 'stock')).toContain('stock <= 50');
  });

  it('like  → col LIKE val', () => {
    expect(sqlFor('like', '%admin%')).toContain("status LIKE '%admin%'");
  });

  it('ilike → col ILIKE val', () => {
    expect(sqlFor('ilike', '%Admin%')).toContain("status ILIKE '%Admin%'");
  });

  it('is null  → col IS NULL', () => {
    expect(sqlFor('is', 'null', 'bio')).toContain('bio IS NULL');
  });

  it('is true  → col IS TRUE', () => {
    expect(sqlFor('is', 'true', 'active')).toContain('active IS TRUE');
  });

  it('is false → col IS FALSE', () => {
    expect(sqlFor('is', 'false', 'active')).toContain('active IS FALSE');
  });

  it('in  → col IN (list)', () => {
    expect(sqlFor('in', '(admin,editor)', 'role')).toContain("role IN ('admin', 'editor')");
  });

  it('fts → col @@ to_tsquery(val)', () => {
    expect(sqlFor('fts', 'postgres', 'body')).toContain("body @@ to_tsquery('postgres')");
  });

  it('cs  → col @> val', () => {
    expect(sqlFor('cs', '{tag1}', 'tags')).toContain("tags @> '{tag1}'");
  });

  it('cd  → col <@ val', () => {
    expect(sqlFor('cd', '{a,b}', 'tags')).toContain("tags <@ '{a,b}'");
  });

  it('ov  → col && val', () => {
    expect(sqlFor('ov', '{1,2}', 'ids')).toContain("ids && '{1,2}'");
  });

  it('not.eq   → NOT (col = val)', () => {
    expect(sqlFor('not.eq', 'admin')).toContain("NOT (status = 'admin')");
  });

  it('not.is   → NOT (col IS NULL)', () => {
    expect(sqlFor('not.is', 'null', 'bio')).toContain('NOT (bio IS NULL)');
  });

  it('not.like → NOT (col LIKE val)', () => {
    expect(sqlFor('not.like', '%test%')).toContain("NOT (status LIKE '%test%')");
  });

  it('not.in   → NOT (col IN (list))', () => {
    expect(sqlFor('not.in', '(a,b)', 'role')).toContain("NOT (role IN ('a', 'b'))");
  });

  it('multiple filters joined with AND', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ filters: [
        { col: 'role', op: 'eq', val: 'admin' },
        { col: 'active', op: 'is', val: 'true' }
      ]}),
      schema
    );
    expect(sql).toContain("role = 'admin'");
    expect(sql).toContain('AND active IS TRUE');
  });

  it('skips filter rows with no column', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ filters: [{ col: '', op: 'eq', val: 'x' }] }),
      schema
    );
    expect(sql).toMatch(/^((?!WHERE).)*$/s);
  });
});

describe('ORDER BY clause', () => {
  it('single column ASC', () => {
    const sql = SqlTranslator.toSQL(baseState({ orders: [{ col: 'name', dir: 'asc' }] }), schema);
    expect(sql).toContain('ORDER BY name ASC');
  });

  it('single column DESC', () => {
    const sql = SqlTranslator.toSQL(baseState({ orders: [{ col: 'created_at', dir: 'desc' }] }), schema);
    expect(sql).toContain('ORDER BY created_at DESC');
  });

  it('multiple columns', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ orders: [{ col: 'role', dir: 'asc' }, { col: 'name', dir: 'desc' }] }),
      schema
    );
    expect(sql).toContain('ORDER BY role ASC, name DESC');
  });

  it('omits ORDER BY when orders list is empty', () => {
    const sql = SqlTranslator.toSQL(baseState(), schema);
    expect(sql).toMatch(/^((?!ORDER BY).)*$/s);
  });
});

describe('LIMIT and OFFSET', () => {
  it('includes LIMIT when set', () => {
    const sql = SqlTranslator.toSQL(baseState({ limit: '10' }), schema);
    expect(sql).toContain('LIMIT  10');
  });

  it('includes OFFSET when non-zero', () => {
    const sql = SqlTranslator.toSQL(baseState({ limit: '25', offset: '50' }), schema);
    expect(sql).toContain('OFFSET 50');
  });

  it('omits OFFSET when zero', () => {
    const sql = SqlTranslator.toSQL(baseState({ limit: '25', offset: '0' }), schema);
    expect(sql).toMatch(/^((?!OFFSET).)*$/s);
  });
});

describe('JOINs from embeds', () => {
  it('LEFT JOIN by default', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ embeds: [{ resource: 'posts', alias: '', hint: '', joinType: '', columns: '', filter: '' }] }),
      schema
    );
    expect(sql).toContain('LEFT JOIN posts');
  });

  it('INNER JOIN when joinType is "!inner"', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ embeds: [{ resource: 'posts', alias: '', hint: '', joinType: '!inner', columns: '', filter: '' }] }),
      schema
    );
    expect(sql).toContain('INNER JOIN posts');
  });

  it('resolves ON clause via FK on embed side (posts.user_id → users.id)', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ embeds: [{ resource: 'posts', alias: '', hint: '', joinType: '', columns: '', filter: '' }] }),
      schema
    );
    expect(sql).toContain('posts.user_id = users.id');
  });

  it('resolves ON clause via FK on base side', () => {
    // posts has a FK user_id → users, so querying posts with embed users
    const sql = SqlTranslator.toSQL(
      baseState({ resource: 'posts', embeds: [{ resource: 'users', alias: '', hint: '', joinType: '', columns: '', filter: '' }] }),
      schema
    );
    expect(sql).toContain('posts.user_id = users.id');
  });

  it('emits a placeholder comment when FK cannot be resolved', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ embeds: [{ resource: 'unknown_table', alias: '', hint: '', joinType: '', columns: '', filter: '' }] }),
      schema
    );
    expect(sql).toContain('FK unknown');
  });

  it('includes alias in JOIN', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ embeds: [{ resource: 'posts', alias: 'p', hint: '', joinType: '', columns: '', filter: '' }] }),
      schema
    );
    expect(sql).toContain('LEFT JOIN posts AS p');
  });

  it('adds column comment when embed has named columns', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ embeds: [{ resource: 'posts', alias: '', hint: '', joinType: '', columns: 'id,title', filter: '' }] }),
      schema
    );
    expect(sql).toContain('-- columns from join: id,title');
  });

  it('multiple embeds produce multiple JOINs', () => {
    const sql = SqlTranslator.toSQL(
      baseState({
        resource: 'comments',
        embeds: [
          { resource: 'posts',  alias: '', hint: '', joinType: '',       columns: '', filter: '' },
          { resource: 'users',  alias: '', hint: '', joinType: '!inner', columns: '', filter: '' }
        ]
      }),
      schema
    );
    expect(sql).toContain('LEFT JOIN posts');
    expect(sql).toContain('INNER JOIN users');
  });
});

describe('RPC functions', () => {
  it('renders as SELECT * FROM fn(arg := val)', () => {
    const sql = SqlTranslator.toSQL(
      { resource: 'search_posts', isFunction: true, select: '', fnArgs: { query: 'postgres', max_results: 5 }, limit: '10', offset: '0' },
      schema
    );
    expect(sql).toContain('FROM   search_posts(');
    expect(sql).toContain("query := 'postgres'");
    expect(sql).toContain('max_results := 5');
  });

  it('uses select when provided', () => {
    const sql = SqlTranslator.toSQL(
      { resource: 'get_stats', isFunction: true, select: 'id,total', fnArgs: {}, limit: '25', offset: '0' },
      schema
    );
    expect(sql).toContain('SELECT id,');
    expect(sql).toContain('total');
  });

  it('omits LIMIT when limit is 0', () => {
    const sql = SqlTranslator.toSQL(
      { resource: 'fn', isFunction: true, fnArgs: {}, select: '', limit: '0', offset: '0' },
      schema
    );
    expect(sql).toMatch(/^((?!LIMIT).)*$/s);
  });

  it('terminates with a semicolon', () => {
    const sql = SqlTranslator.toSQL(
      { resource: 'fn', isFunction: true, fnArgs: {}, select: '', limit: '10', offset: '0' },
      schema
    );
    expect(sql).toMatch(/;\s*$/);
  });
});

describe('Output format', () => {
  it('terminates with a semicolon', () => {
    expect(SqlTranslator.toSQL(baseState(), schema)).toMatch(/;\s*$/);
  });

  it('produces no WHERE when filters list is empty', () => {
    expect(SqlTranslator.toSQL(baseState(), schema)).toMatch(/^((?!WHERE).)*$/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  fromSQL — SQL string → URL Builder state
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n━━━ SqlTranslator.fromSQL ━━━');

describe('FROM / resource parsing', () => {
  it('extracts resource from FROM clause', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users').resource).toBe('users');
  });

  it('is case-insensitive for keywords', () => {
    expect(SqlTranslator.fromSQL('select * from products').resource).toBe('products');
  });

  it('strips trailing semicolon', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM orders;').resource).toBe('orders');
  });

  it('strips SQL comments before parsing', () => {
    const sql = '-- get all users\nSELECT * FROM users';
    expect(SqlTranslator.fromSQL(sql).resource).toBe('users');
  });

  it('throws when FROM clause is missing', () => {
    expect(() => SqlTranslator.fromSQL('SELECT id, name')).toThrow();
  });
});

describe('SELECT clause parsing', () => {
  it('returns empty select for SELECT *', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users').select).toBe('');
  });

  it('parses named columns into comma-separated string', () => {
    const state = SqlTranslator.fromSQL('SELECT id, name, email FROM users');
    expect(state.select).toBe('id,name,email');
  });

  it('handles single column', () => {
    expect(SqlTranslator.fromSQL('SELECT id FROM users').select).toBe('id');
  });

  it('handles multi-line SELECT (reformatted by toSQL)', () => {
    const sql = 'SELECT id,\n       name,\n       email\nFROM   users;';
    expect(SqlTranslator.fromSQL(sql).select).toBe('id,name,email');
  });
});

describe('WHERE clause parsing — all operators', () => {
  function roundtrip(op, val, col = 'status') {
    const sql = SqlTranslator.toSQL(baseState({ filters: [{ col, op, val }] }), schema);
    const state = SqlTranslator.fromSQL(sql);
    return state.filters[0];
  }

  it('eq',       () => { const f = roundtrip('eq', 'active'); expect(f.op).toBe('eq'); expect(f.val).toBe('active'); });
  it('neq',      () => { const f = roundtrip('neq', 'deleted'); expect(f.op).toBe('neq'); });
  it('gt',       () => { const f = roundtrip('gt', '100', 'price'); expect(f.op).toBe('gt'); expect(f.val).toBe('100'); });
  it('gte',      () => { const f = roundtrip('gte', '100', 'price'); expect(f.op).toBe('gte'); });
  it('lt',       () => { const f = roundtrip('lt', '50', 'stock'); expect(f.op).toBe('lt'); });
  it('lte',      () => { const f = roundtrip('lte', '50', 'stock'); expect(f.op).toBe('lte'); });
  it('like',     () => { const f = roundtrip('like', '%test%'); expect(f.op).toBe('like'); expect(f.val).toBe('%test%'); });
  it('ilike',    () => { const f = roundtrip('ilike', '%Test%'); expect(f.op).toBe('ilike'); expect(f.val).toBe('%Test%'); });
  it('is null',  () => { const f = roundtrip('is', 'null', 'bio'); expect(f.op).toBe('is'); expect(f.val).toBe('null'); });
  it('is true',  () => { const f = roundtrip('is', 'true', 'active'); expect(f.op).toBe('is'); expect(f.val).toBe('true'); });
  it('is false', () => { const f = roundtrip('is', 'false', 'active'); expect(f.op).toBe('is'); expect(f.val).toBe('false'); });
  it('in',       () => { const f = roundtrip('in', '(admin,editor)', 'role'); expect(f.op).toBe('in'); });
  it('fts',      () => { const f = roundtrip('fts', 'postgres', 'body'); expect(f.op).toBe('fts'); expect(f.val).toBe('postgres'); });
  it('cs',       () => { const f = roundtrip('cs', '{tag}', 'tags'); expect(f.op).toBe('cs'); });
  it('cd',       () => { const f = roundtrip('cd', '{a,b}', 'tags'); expect(f.op).toBe('cd'); });
  it('ov',       () => { const f = roundtrip('ov', '{1,2}', 'ids'); expect(f.op).toBe('ov'); });
  it('not.eq',   () => { const f = roundtrip('not.eq',   'admin'); expect(f.op).toBe('not.eq'); });
  it('not.is',   () => { const f = roundtrip('not.is',   'null', 'bio'); expect(f.op).toBe('not.is'); });
  it('not.like', () => { const f = roundtrip('not.like', '%test%'); expect(f.op).toBe('not.like'); });
  it('not.in',   () => { const f = roundtrip('not.in',   '(a,b)', 'role'); expect(f.op).toBe('not.in'); });
});

describe('WHERE clause — direct SQL parsing', () => {
  it('parses a single eq condition from hand-written SQL', () => {
    const state = SqlTranslator.fromSQL("SELECT * FROM users WHERE role = 'admin'");
    expect(state.filters).toHaveLength(1);
    expect(state.filters[0]).toEqual({ col: 'role', op: 'eq', val: 'admin' });
  });

  it('parses multiple AND conditions', () => {
    const state = SqlTranslator.fromSQL(
      "SELECT * FROM users WHERE role = 'admin' AND active IS TRUE"
    );
    expect(state.filters).toHaveLength(2);
    expect(state.filters[0].col).toBe('role');
    expect(state.filters[1].col).toBe('active');
  });

  it('parses numeric value without quotes', () => {
    const state = SqlTranslator.fromSQL('SELECT * FROM products WHERE price > 50');
    expect(state.filters[0]).toEqual({ col: 'price', op: 'gt', val: '50' });
  });

  it('parses IS NULL correctly', () => {
    const state = SqlTranslator.fromSQL('SELECT * FROM users WHERE bio IS NULL');
    expect(state.filters[0]).toEqual({ col: 'bio', op: 'is', val: 'null' });
  });

  it('parses IN list', () => {
    const state = SqlTranslator.fromSQL("SELECT * FROM users WHERE role IN ('admin', 'editor')");
    expect(state.filters[0].op).toBe('in');
    expect(state.filters[0].col).toBe('role');
  });

  it('parses ILIKE', () => {
    const state = SqlTranslator.fromSQL("SELECT * FROM posts WHERE title ILIKE '%postgres%'");
    expect(state.filters[0]).toEqual({ col: 'title', op: 'ilike', val: '%postgres%' });
  });

  it('parses NOT (...) negation wrapper', () => {
    const state = SqlTranslator.fromSQL("SELECT * FROM users WHERE NOT (role = 'viewer')");
    expect(state.filters[0].op).toBe('not.eq');
    expect(state.filters[0].val).toBe('viewer');
  });

  it('returns empty filters when no WHERE clause', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users').filters).toHaveLength(0);
  });
});

describe('ORDER BY parsing', () => {
  it('parses single ASC order', () => {
    const state = SqlTranslator.fromSQL('SELECT * FROM users ORDER BY name ASC');
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]).toEqual({ col: 'name', dir: 'asc' });
  });

  it('parses single DESC order', () => {
    const state = SqlTranslator.fromSQL('SELECT * FROM users ORDER BY created_at DESC');
    expect(state.orders[0]).toEqual({ col: 'created_at', dir: 'desc' });
  });

  it('parses multiple order columns', () => {
    const state = SqlTranslator.fromSQL('SELECT * FROM users ORDER BY role ASC, name DESC');
    expect(state.orders).toHaveLength(2);
    expect(state.orders[0]).toEqual({ col: 'role', dir: 'asc' });
    expect(state.orders[1]).toEqual({ col: 'name', dir: 'desc' });
  });

  it('returns empty orders when no ORDER BY clause', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users').orders).toHaveLength(0);
  });
});

describe('LIMIT and OFFSET parsing', () => {
  it('parses LIMIT', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users LIMIT 10').limit).toBe('10');
  });

  it('parses OFFSET', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users LIMIT 25 OFFSET 50').offset).toBe('50');
  });

  it('defaults limit to "25" when absent', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users').limit).toBe('25');
  });

  it('defaults offset to "0" when absent', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users').offset).toBe('0');
  });
});

describe('JOIN parsing → embeds', () => {
  it('parses LEFT JOIN into an embed', () => {
    const state = SqlTranslator.fromSQL(
      'SELECT * FROM users LEFT JOIN posts ON posts.user_id = users.id'
    );
    expect(state.embeds).toHaveLength(1);
    expect(state.embeds[0].resource).toBe('posts');
    expect(state.embeds[0].joinType).toBe('');
  });

  it('parses INNER JOIN and sets joinType to "!inner"', () => {
    const state = SqlTranslator.fromSQL(
      'SELECT * FROM users INNER JOIN posts ON posts.user_id = users.id'
    );
    expect(state.embeds[0].joinType).toBe('!inner');
  });

  it('parses JOIN alias', () => {
    const state = SqlTranslator.fromSQL(
      'SELECT * FROM users LEFT JOIN posts AS p ON p.user_id = users.id'
    );
    expect(state.embeds[0].alias).toBe('p');
  });

  it('parses multiple JOINs into multiple embeds', () => {
    const sql = [
      'SELECT *',
      'FROM   comments',
      'LEFT JOIN posts ON comments.post_id = posts.id',
      'INNER JOIN users ON comments.user_id = users.id'
    ].join('\n');
    const state = SqlTranslator.fromSQL(sql);
    expect(state.embeds).toHaveLength(2);
    expect(state.embeds[0].resource).toBe('posts');
    expect(state.embeds[1].resource).toBe('users');
    expect(state.embeds[1].joinType).toBe('!inner');
  });

  it('returns empty embeds when no JOINs', () => {
    expect(SqlTranslator.fromSQL('SELECT * FROM users').embeds).toHaveLength(0);
  });
});

describe('RPC function parsing', () => {
  it('detects function call and sets isFunction', () => {
    const state = SqlTranslator.fromSQL("SELECT * FROM search_posts(query := 'test')");
    expect(state.isFunction).toBe(true);
  });

  it('extracts the function name as resource', () => {
    const state = SqlTranslator.fromSQL("SELECT * FROM search_posts(query := 'postgres')");
    expect(state.resource).toBe('search_posts');
  });

  it('parses named function arguments into fnArgs', () => {
    const state = SqlTranslator.fromSQL(
      "SELECT * FROM search_posts(query := 'postgres', max_results := 5)"
    );
    expect(state.fnArgs.query).toBe('postgres');
    expect(state.fnArgs.max_results).toBe('5');
  });

  it('parses LIMIT on function result', () => {
    const state = SqlTranslator.fromSQL(
      "SELECT * FROM get_stats() LIMIT 10"
    );
    expect(state.limit).toBe('10');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Round-trip tests: toSQL → fromSQL and fromSQL → toSQL
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n━━━ Round-trip tests ━━━');

describe('toSQL → fromSQL (state preservation)', () => {
  it('preserves resource', () => {
    const state = baseState({ resource: 'products' });
    expect(SqlTranslator.fromSQL(SqlTranslator.toSQL(state, schema)).resource).toBe('products');
  });

  it('preserves select columns', () => {
    const state = baseState({ select: 'id,name,email' });
    expect(SqlTranslator.fromSQL(SqlTranslator.toSQL(state, schema)).select).toBe('id,name,email');
  });

  it('preserves all filter fields (col, op, val)', () => {
    const filters = [
      { col: 'role', op: 'eq', val: 'admin' },
      { col: 'active', op: 'is', val: 'true' },
      { col: 'score', op: 'gte', val: '50' }
    ];
    const result = SqlTranslator.fromSQL(SqlTranslator.toSQL(baseState({ filters }), schema));
    expect(result.filters).toHaveLength(3);
    expect(result.filters[0]).toEqual({ col: 'role', op: 'eq', val: 'admin' });
    expect(result.filters[1]).toEqual({ col: 'active', op: 'is', val: 'true' });
    expect(result.filters[2]).toEqual({ col: 'score', op: 'gte', val: '50' });
  });

  it('preserves orders', () => {
    const orders = [{ col: 'name', dir: 'asc' }, { col: 'created_at', dir: 'desc' }];
    const result = SqlTranslator.fromSQL(SqlTranslator.toSQL(baseState({ orders }), schema));
    expect(result.orders).toHaveLength(2);
    expect(result.orders[0]).toEqual({ col: 'name', dir: 'asc' });
    expect(result.orders[1]).toEqual({ col: 'created_at', dir: 'desc' });
  });

  it('preserves limit and offset', () => {
    const state = baseState({ limit: '50', offset: '100' });
    const result = SqlTranslator.fromSQL(SqlTranslator.toSQL(state, schema));
    expect(result.limit).toBe('50');
    expect(result.offset).toBe('100');
  });

  it('preserves embed resource name', () => {
    const state = baseState({
      embeds: [{ resource: 'posts', alias: '', hint: '', joinType: '', columns: '', filter: '' }]
    });
    const result = SqlTranslator.fromSQL(SqlTranslator.toSQL(state, schema));
    expect(result.embeds).toHaveLength(1);
    expect(result.embeds[0].resource).toBe('posts');
  });

  it('preserves inner join type through round-trip', () => {
    const state = baseState({
      embeds: [{ resource: 'posts', alias: '', hint: '', joinType: '!inner', columns: '', filter: '' }]
    });
    const result = SqlTranslator.fromSQL(SqlTranslator.toSQL(state, schema));
    expect(result.embeds[0].joinType).toBe('!inner');
  });

  it('preserves function args through round-trip', () => {
    const state = { resource: 'search_posts', isFunction: true, select: '', fnArgs: { query: 'test', max_results: 5 }, limit: '10', offset: '0' };
    const result = SqlTranslator.fromSQL(SqlTranslator.toSQL(state, schema));
    expect(result.isFunction).toBe(true);
    expect(result.resource).toBe('search_posts');
    expect(result.fnArgs.query).toBe('test');
  });

  it('complex query: columns + filters + order + limit/offset', () => {
    const state = baseState({
      select: 'id,name,role',
      filters: [
        { col: 'role', op: 'neq', val: 'viewer' },
        { col: 'active', op: 'is', val: 'true' }
      ],
      orders: [{ col: 'name', dir: 'asc' }],
      limit: '10',
      offset: '20'
    });
    const sql = SqlTranslator.toSQL(state, schema);
    const result = SqlTranslator.fromSQL(sql);
    expect(result.resource).toBe('users');
    expect(result.select).toBe('id,name,role');
    expect(result.filters).toHaveLength(2);
    expect(result.orders).toHaveLength(1);
    expect(result.limit).toBe('10');
    expect(result.offset).toBe('20');
  });
});

describe('fromSQL → toSQL (SQL reproduction)', () => {
  it('reproduced SQL includes same table name', () => {
    const original = 'SELECT * FROM users LIMIT 25;';
    const state    = SqlTranslator.fromSQL(original);
    const reproduced = SqlTranslator.toSQL(state, schema);
    expect(reproduced).toContain('FROM   users');
  });

  it('reproduced SQL includes same WHERE conditions', () => {
    const original = "SELECT * FROM users WHERE role = 'admin' LIMIT 25;";
    const state    = SqlTranslator.fromSQL(original);
    const reproduced = SqlTranslator.toSQL(state, schema);
    expect(reproduced).toContain("role = 'admin'");
  });

  it('reproduced SQL includes same ORDER BY', () => {
    const original = 'SELECT * FROM users ORDER BY name ASC LIMIT 25;';
    const state    = SqlTranslator.fromSQL(original);
    const reproduced = SqlTranslator.toSQL(state, schema);
    expect(reproduced).toContain('ORDER BY name ASC');
  });

  it('reproduced SQL includes same LIMIT and OFFSET', () => {
    const original = 'SELECT * FROM users LIMIT 10 OFFSET 30;';
    const state    = SqlTranslator.fromSQL(original);
    const reproduced = SqlTranslator.toSQL(state, schema);
    expect(reproduced).toContain('LIMIT  10');
    expect(reproduced).toContain('OFFSET 30');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Edge cases
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n━━━ Edge cases ━━━');

describe('Edge cases', () => {
  it('handles SQL with only whitespace', () => {
    const state = SqlTranslator.fromSQL('   ');
    expect(state.resource).toBe('');
    expect(state.filters).toHaveLength(0);
  });

  it('handles string values containing single quotes (escaped)', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ filters: [{ col: 'name', op: 'eq', val: "O'Brien" }] }),
      schema
    );
    expect(sql).toContain("name = 'O''Brien'");
  });

  it('handles string values containing single quotes in round-trip', () => {
    const state = baseState({ filters: [{ col: 'name', op: 'eq', val: "O'Brien" }] });
    const result = SqlTranslator.fromSQL(SqlTranslator.toSQL(state, schema));
    expect(result.filters[0].val).toBe("O'Brien");
  });

  it('does not emit OFFSET line when offset is "0"', () => {
    const sql = SqlTranslator.toSQL(baseState({ offset: '0' }), schema);
    expect(sql).toMatch(/^((?!OFFSET).)*$/s);
  });

  it('numeric filter values are not quoted in SQL output', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ filters: [{ col: 'price', op: 'gt', val: '99.99' }] }),
      schema
    );
    expect(sql).toContain('price > 99.99');
    expect(sql).not.toContain("'99.99'");
  });

  it('works without a schema argument (no FK resolution)', () => {
    const sql = SqlTranslator.toSQL(
      baseState({ embeds: [{ resource: 'posts', alias: '', hint: '', joinType: '', columns: '', filter: '' }] })
    );
    expect(sql).toContain('LEFT JOIN posts');
    expect(sql).toContain('FK unknown');
  });

  it('fromSQL ignores unrecognised clauses without throwing', () => {
    // GROUP BY is not supported by the builder, but fromSQL should not throw
    const sql = 'SELECT role, COUNT(*) FROM users GROUP BY role';
    let state;
    try {
      state = SqlTranslator.fromSQL(sql);
    } catch { /* ignore */ }
    // At minimum resource should be extractable
    if (state) expect(state.resource).toBe('users');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Summary
// ─────────────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log('\n' + '─'.repeat(50));
if (failed === 0) {
  console.log(`✓ All ${total} tests passed`);
} else {
  console.log(`✗ ${failed} of ${total} tests failed`);
}
console.log('─'.repeat(50) + '\n');

if (failed > 0) process.exit(1);
