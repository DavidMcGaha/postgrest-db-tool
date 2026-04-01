/**
 * Demo Data
 * OpenAPI spec and generated mock rows for demo mode.
 * Connect using URL: http://demo  (no server required)
 */

const DEMO_BASE_URL = 'http://demo';

// ── OpenAPI Specification ────────────────────────────────────────────────────

const DEMO_OPENAPI_SPEC = {
  swagger: '2.0',
  info: {
    title: 'Demo Blog & Shop API',
    description: 'Sample dataset for offline exploration — no server required.',
    version: '1.0.0'
  },
  host: 'demo',
  basePath: '/',
  schemes: ['http'],
  consumes: ['application/json'],
  produces: ['application/json', 'text/csv'],
  definitions: {
    users: {
      required: ['id'],
      type: 'object',
      properties: {
        id:         { description: 'Note: This is a Primary Key.<pk/>', format: 'integer', type: 'integer' },
        name:       { format: 'text', type: 'string', maxLength: 100 },
        email:      { format: 'text', type: 'string', maxLength: 255 },
        role:       { format: 'text', type: 'string', enum: ['admin', 'editor', 'viewer'] },
        bio:        { format: 'text', type: 'string' },
        active:     { format: 'boolean', type: 'boolean', default: true },
        created_at: { format: 'timestamp without time zone', type: 'string' },
        avatar_url: { format: 'text', type: 'string' }
      }
    },
    posts: {
      required: ['id'],
      type: 'object',
      properties: {
        id:         { description: 'Note: This is a Primary Key.<pk/>', format: 'integer', type: 'integer' },
        user_id:    { description: "Note: This is a Foreign Key to `users.id`.<fk table='users' column='id'/>", format: 'integer', type: 'integer' },
        title:      { format: 'text', type: 'string', maxLength: 200 },
        slug:       { format: 'text', type: 'string', maxLength: 200 },
        body:       { format: 'text', type: 'string' },
        published:  { format: 'boolean', type: 'boolean', default: false },
        view_count: { format: 'integer', type: 'integer', default: 0 },
        tags:       { format: 'json', type: 'object' },
        created_at: { format: 'timestamp without time zone', type: 'string' },
        updated_at: { format: 'timestamp without time zone', type: 'string' }
      }
    },
    comments: {
      required: ['id'],
      type: 'object',
      properties: {
        id:         { description: 'Note: This is a Primary Key.<pk/>', format: 'integer', type: 'integer' },
        post_id:    { description: "Note: This is a Foreign Key to `posts.id`.<fk table='posts' column='id'/>", format: 'integer', type: 'integer' },
        user_id:    { description: "Note: This is a Foreign Key to `users.id`.<fk table='users' column='id'/>", format: 'integer', type: 'integer' },
        content:    { format: 'text', type: 'string' },
        upvotes:    { format: 'integer', type: 'integer', default: 0 },
        created_at: { format: 'timestamp without time zone', type: 'string' }
      }
    },
    products: {
      required: ['id'],
      type: 'object',
      properties: {
        id:          { description: 'Note: This is a Primary Key.<pk/>', format: 'integer', type: 'integer' },
        name:        { format: 'text', type: 'string', maxLength: 150 },
        sku:         { format: 'text', type: 'string', maxLength: 50 },
        description: { format: 'text', type: 'string' },
        price:       { format: 'numeric', type: 'number' },
        category:    { format: 'text', type: 'string', enum: ['Electronics', 'Books', 'Clothing', 'Home', 'Sports'] },
        stock:       { format: 'integer', type: 'integer', default: 0 },
        active:      { format: 'boolean', type: 'boolean', default: true },
        metadata:    { format: 'json', type: 'object' },
        created_at:  { format: 'timestamp without time zone', type: 'string' }
      }
    },
    orders: {
      required: ['id'],
      type: 'object',
      properties: {
        id:               { description: 'Note: This is a Primary Key.<pk/>', format: 'integer', type: 'integer' },
        user_id:          { description: "Note: This is a Foreign Key to `users.id`.<fk table='users' column='id'/>", format: 'integer', type: 'integer' },
        status:           { format: 'text', type: 'string', enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] },
        total:            { format: 'numeric', type: 'number' },
        shipping_address: { format: 'json', type: 'object' },
        notes:            { format: 'text', type: 'string' },
        created_at:       { format: 'timestamp without time zone', type: 'string' },
        updated_at:       { format: 'timestamp without time zone', type: 'string' }
      }
    },
    order_items: {
      required: ['id'],
      type: 'object',
      properties: {
        id:         { description: 'Note: This is a Primary Key.<pk/>', format: 'integer', type: 'integer' },
        order_id:   { description: "Note: This is a Foreign Key to `orders.id`.<fk table='orders' column='id'/>", format: 'integer', type: 'integer' },
        product_id: { description: "Note: This is a Foreign Key to `products.id`.<fk table='products' column='id'/>", format: 'integer', type: 'integer' },
        quantity:   { format: 'integer', type: 'integer' },
        unit_price: { format: 'numeric', type: 'number' }
      }
    },
    user_stats: {
      type: 'object',
      properties: {
        user_id:       { description: "Note: This is a Foreign Key to `users.id`.<fk table='users' column='id'/>", format: 'integer', type: 'integer' },
        username:      { format: 'text', type: 'string' },
        email:         { format: 'text', type: 'string' },
        role:          { format: 'text', type: 'string' },
        post_count:    { format: 'bigint', type: 'integer' },
        comment_count: { format: 'bigint', type: 'integer' },
        order_count:   { format: 'bigint', type: 'integer' },
        total_spent:   { format: 'numeric', type: 'number' },
        last_active:   { format: 'timestamp without time zone', type: 'string' }
      }
    }
  },
  paths: {
    '/users': {
      get:    { tags: ['users'],    summary: 'Registered platform users', parameters: [], responses: { '200': {} } },
      post:   { tags: ['users'],    parameters: [], responses: { '201': {} } },
      patch:  { tags: ['users'],    parameters: [], responses: { '200': {} } },
      delete: { tags: ['users'],    parameters: [], responses: { '204': {} } }
    },
    '/posts': {
      get:    { tags: ['posts'],    summary: 'Blog posts', parameters: [], responses: { '200': {} } },
      post:   { tags: ['posts'],    parameters: [], responses: { '201': {} } },
      patch:  { tags: ['posts'],    parameters: [], responses: { '200': {} } },
      delete: { tags: ['posts'],    parameters: [], responses: { '204': {} } }
    },
    '/comments': {
      get:    { tags: ['comments'], summary: 'Post comments', parameters: [], responses: { '200': {} } },
      post:   { tags: ['comments'], parameters: [], responses: { '201': {} } },
      patch:  { tags: ['comments'], parameters: [], responses: { '200': {} } },
      delete: { tags: ['comments'], parameters: [], responses: { '204': {} } }
    },
    '/products': {
      get:    { tags: ['products'], summary: 'Shop products', parameters: [], responses: { '200': {} } },
      post:   { tags: ['products'], parameters: [], responses: { '201': {} } },
      patch:  { tags: ['products'], parameters: [], responses: { '200': {} } },
      delete: { tags: ['products'], parameters: [], responses: { '204': {} } }
    },
    '/orders': {
      get:    { tags: ['orders'],   summary: 'Customer orders', parameters: [], responses: { '200': {} } },
      post:   { tags: ['orders'],   parameters: [], responses: { '201': {} } },
      patch:  { tags: ['orders'],   parameters: [], responses: { '200': {} } },
      delete: { tags: ['orders'],   parameters: [], responses: { '204': {} } }
    },
    '/order_items': {
      get:    { tags: ['order_items'], summary: 'Line items within an order', parameters: [], responses: { '200': {} } },
      post:   { tags: ['order_items'], parameters: [], responses: { '201': {} } },
      patch:  { tags: ['order_items'], parameters: [], responses: { '200': {} } },
      delete: { tags: ['order_items'], parameters: [], responses: { '204': {} } }
    },
    '/user_stats': {
      get: { tags: ['user_stats'], summary: 'Aggregated stats per user (view)', parameters: [], responses: { '200': {} } }
    },
    '/rpc/search_posts': {
      post: {
        tags: ['search_posts'],
        summary: 'Full-text search across post titles and bodies',
        parameters: [{
          in: 'body', name: 'args',
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query:       { type: 'string',  description: 'Search term' },
              max_results: { type: 'integer', description: 'Max rows to return', default: 10 }
            }
          }
        }],
        responses: { '200': {} }
      },
      get: { tags: ['search_posts'], parameters: [], responses: { '200': {} } }
    },
    '/rpc/get_dashboard_stats': {
      post: {
        tags: ['get_dashboard_stats'],
        summary: 'Returns a single row of aggregate platform statistics',
        parameters: [],
        responses: { '200': {} }
      },
      get: { tags: ['get_dashboard_stats'], parameters: [], responses: { '200': {} } }
    }
  }
};

// ── Mock Row Data ────────────────────────────────────────────────────────────

const DEMO_ROWS = (() => {
  // Deterministic pseudo-random number seeded for reproducibility
  let _seed = 42;
  function rand(n) { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return Math.abs(_seed) % n; }
  function randFloat(min, max) { return +(min + (Math.abs(_seed = (_seed * 1664525 + 1013904223) & 0xffffffff) / 0xffffffff) * (max - min)).toFixed(2); }
  function pick(arr) { return arr[rand(arr.length)]; }
  function isoDate(daysAgo) {
    const d = new Date('2025-03-01T00:00:00Z');
    d.setDate(d.getDate() - daysAgo);
    d.setHours(rand(23), rand(59), rand(59));
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  }
  function slug(title) { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Hank', 'Iris', 'Jack',
                       'Karen', 'Leo', 'Maya', 'Nolan', 'Olivia', 'Pete', 'Quinn', 'Rosa', 'Sam', 'Tara',
                       'Uma', 'Victor', 'Wendy', 'Xander', 'Yuki'];
  const LAST_NAMES  = ['Adams', 'Baker', 'Chen', 'Davis', 'Evans', 'Foster', 'Garcia', 'Hill', 'Iyer',
                       'Jones', 'Kim', 'Lopez', 'Miller', 'Nguyen', 'Owens', 'Park', 'Quinn', 'Reed',
                       'Silva', 'Taylor', 'Ueda', 'Vance', 'Wang', 'Xu', 'Young'];
  const BIOS = [
    'Senior software engineer with a passion for open source.',
    'Full-stack developer and occasional blogger.',
    'Data enthusiast. Coffee addict. Postgres evangelist.',
    'Building cool things on the internet since 2005.',
    'Developer advocate and technical writer.',
    null, null, null
  ];
  const CITIES   = ['New York', 'London', 'Berlin', 'Tokyo', 'Sydney', 'Paris', 'Toronto', 'Singapore'];
  const STREETS  = ['123 Main St', '45 Oak Ave', '7 Elm Rd', '99 Pine Blvd', '200 Cedar Way'];
  const POSTCODES = ['10001', 'EC1A 1BB', '10115', '100-0001', '2000', '75001', 'M5H 2N2', '018960'];

  // ── users ──
  const users = [];
  for (let i = 1; i <= 25; i++) {
    const first = FIRST_NAMES[(i - 1) % FIRST_NAMES.length];
    const last  = LAST_NAMES[(i - 1) % LAST_NAMES.length];
    const name  = `${first} ${last}`;
    users.push({
      id:         i,
      name,
      email:      `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      role:       i <= 2 ? 'admin' : i <= 7 ? 'editor' : 'viewer',
      bio:        pick(BIOS),
      active:     i !== 13 && i !== 19,
      created_at: isoDate(365 + rand(365)),
      avatar_url: `https://i.pravatar.cc/80?img=${i}`
    });
  }

  // ── posts ──
  const POST_TITLES = [
    'Getting Started with PostgREST',
    'Understanding PostgreSQL Indexes',
    'REST vs GraphQL: Which Should You Choose?',
    'Building a Full-Stack App with Supabase',
    'Advanced SQL Window Functions Explained',
    'How to Secure Your API with JWT',
    'PostgreSQL JSONB: A Deep Dive',
    'Optimising Slow Queries in Postgres',
    'Row-Level Security: A Practical Guide',
    'The Case for Convention Over Configuration',
    'Ten Tips for Better Database Design',
    'Intro to Database Migrations with Flyway',
    'EXPLAIN ANALYZE: Reading Query Plans',
    'Using CTEs to Simplify Complex Queries',
    'Connection Pooling with PgBouncer',
    'Automated Backups for PostgreSQL',
    'Full-Text Search in PostgreSQL',
    'Partitioning Large Tables',
    'Monitoring Your Database with Prometheus',
    'Zero-Downtime Schema Migrations',
    'Designing RESTful APIs That Scale',
    'Introduction to Event Sourcing',
    'CQRS Patterns in Practice',
    'Building a Search Engine from Scratch',
    'When NOT to Use an ORM',
    'Understanding MVCC in PostgreSQL',
    'Logical Replication Step by Step',
    'PostgreSQL and TimescaleDB for Time-Series',
    'GraphQL Federation with PostgREST',
    'Debugging Network Issues in Docker',
    'Intro to Database Sharding',
    'How Vacuum Works in PostgreSQL',
    'Scaling Reads with Read Replicas',
    'Using pg_stat_statements',
    'Writing Maintainable SQL',
    'Schema Versioning Best Practices',
    'Locking and Deadlocks in PostgreSQL',
    'Practical Guide to pg_cron',
    'Generating Test Data with pg_faker',
    'The Art of Database Normalization',
    'PostgREST Auth Deep Dive',
    'Horizontal Scaling Strategies',
    'Columnar Storage with pg_columnar',
    'From MySQL to PostgreSQL: A Migration Guide',
    'Building an Audit Log with Triggers'
  ];
  const TAGS_POOL = [
    ['postgres', 'api'],
    ['sql', 'performance'],
    ['security', 'jwt'],
    ['database', 'design'],
    ['devops', 'postgres'],
    ['nodejs', 'rest'],
    ['tutorial', 'beginner'],
    ['advanced', 'sql'],
    ['migration', 'schema'],
    ['monitoring', 'ops']
  ];
  const BODIES = [
    'In this post we explore the fundamentals and walk through a practical example step by step. By the end you should have a solid understanding of the core concepts and be ready to apply them in your own projects.',
    'This is a topic that often trips up developers. We break it down into digestible pieces, covering the theory before diving into real-world examples.',
    'After spending several years working with large production databases, I have collected a set of lessons that I wish I had known earlier. Here are the most important ones.',
    'The documentation covers the basics, but this guide goes further — exploring edge cases, performance implications, and patterns you can use immediately.',
    'A common misconception is that this is only for advanced users. In reality, even beginners can benefit from understanding these concepts from day one.'
  ];

  const posts = [];
  for (let i = 1; i <= 45; i++) {
    const title = POST_TITLES[i - 1];
    const created = isoDate(rand(400));
    const updated = isoDate(rand(30));
    posts.push({
      id:         i,
      user_id:    rand(7) + 1,
      title,
      slug:       slug(title),
      body:       pick(BODIES) + ' ' + pick(BODIES),
      published:  i > 5,
      view_count: rand(5000),
      tags:       pick(TAGS_POOL),
      created_at: created,
      updated_at: updated
    });
  }

  // ── comments ──
  const COMMENT_TEXTS = [
    'Great post! Really helped me understand the topic.',
    'I had the same issue and this solved it completely.',
    'Have you considered using X instead? I found it works better for this use case.',
    'Thanks for writing this up. Bookmarked for future reference.',
    'Minor correction: in step 3, the command should be slightly different on Windows.',
    'This is exactly what I was looking for. The explanation in section 2 is particularly clear.',
    'Interesting approach. I went a different route but yours looks cleaner.',
    'Do you have a follow-up post planned? Would love to see Part 2.',
    'Works perfectly. Tested on PostgreSQL 16 and it behaves as described.',
    'I ran into an error on the last step — turned out to be a permissions issue on my end.',
    'Super useful, especially the benchmarks at the end.',
    'The diagram really helped visualise the concept. More diagrams please!',
    'Disagree on the performance claims in section 4, but overall solid advice.',
    'Quick question: does this apply to partitioned tables as well?',
    'Followed along and it just worked first try. 10/10.',
    'Could you also cover the case where the foreign key is nullable?',
    'Saved me hours of debugging. Thank you!',
    'The section on indexes is gold. Most tutorials skip over that.',
    'Sharing this with my whole team immediately.',
    'Any reason you chose this approach over using a materialised view?'
  ];

  const comments = [];
  let cid = 1;
  for (const post of posts) {
    const count = rand(8) + 1;
    for (let j = 0; j < count; j++) {
      comments.push({
        id:         cid++,
        post_id:    post.id,
        user_id:    rand(25) + 1,
        content:    pick(COMMENT_TEXTS),
        upvotes:    rand(50),
        created_at: isoDate(rand(300))
      });
      if (cid > 150) break;
    }
    if (cid > 150) break;
  }

  // ── products ──
  const PRODUCTS = [
    { name: 'Mechanical Keyboard Pro',   sku: 'EL-001', category: 'Electronics', price: 129.99, stock: 42,  meta: { color: 'Space Grey', switches: 'Cherry MX Blue', warranty_years: 2 } },
    { name: 'Noise-Cancelling Headphones', sku: 'EL-002', category: 'Electronics', price: 249.00, stock: 17,  meta: { color: 'Matte Black', bluetooth: true, battery_hours: 30 } },
    { name: 'Ultra-Wide Monitor 34"',    sku: 'EL-003', category: 'Electronics', price: 699.00, stock: 8,   meta: { resolution: '3440x1440', refresh_hz: 144, panel: 'IPS' } },
    { name: 'USB-C Hub 7-in-1',         sku: 'EL-004', category: 'Electronics', price: 49.99,  stock: 120, meta: { ports: ['HDMI', 'USB-A', 'SD', 'MicroSD', 'PD'] } },
    { name: 'Ergonomic Desk Chair',     sku: 'HM-001', category: 'Home',        price: 395.00, stock: 5,   meta: { material: 'Mesh', adjustable_height: true, lumbar_support: true } },
    { name: 'Standing Desk 140cm',      sku: 'HM-002', category: 'Home',        price: 549.00, stock: 3,   meta: { width_cm: 140, depth_cm: 70, motor: 'dual', memory_presets: 4 } },
    { name: 'LED Desk Lamp',            sku: 'HM-003', category: 'Home',        price: 34.99,  stock: 85,  meta: { color_temp_k: [3000, 4000, 6500], usb_charging: true } },
    { name: 'The Pragmatic Programmer', sku: 'BK-001', category: 'Books',       price: 39.99,  stock: 200, meta: { author: 'Hunt & Thomas', edition: 20, pages: 352 } },
    { name: 'Designing Data-Intensive Applications', sku: 'BK-002', category: 'Books', price: 55.00, stock: 150, meta: { author: 'Martin Kleppmann', pages: 616 } },
    { name: 'Clean Code',               sku: 'BK-003', category: 'Books',       price: 35.00,  stock: 180, meta: { author: 'Robert C. Martin', pages: 431 } },
    { name: 'Running Shoes X200',       sku: 'SP-001', category: 'Sports',      price: 89.99,  stock: 60,  meta: { sizes: [7,8,9,10,11,12], drop_mm: 8, weight_g: 265 } },
    { name: 'Yoga Mat Premium',         sku: 'SP-002', category: 'Sports',      price: 45.00,  stock: 90,  meta: { thickness_mm: 6, material: 'TPE', non_slip: true } },
    { name: 'Resistance Bands Set',     sku: 'SP-003', category: 'Sports',      price: 24.99,  stock: 200, meta: { levels: ['Light', 'Medium', 'Heavy', 'X-Heavy'] } },
    { name: 'Developer T-Shirt — Dark', sku: 'CL-001', category: 'Clothing',    price: 29.99,  stock: 75,  meta: { sizes: ['S','M','L','XL','XXL'], print: 'SELECT * FROM happiness' } },
    { name: 'Hoodie — Postgres Blue',   sku: 'CL-002', category: 'Clothing',    price: 59.99,  stock: 40,  meta: { sizes: ['S','M','L','XL'], material: '80% cotton' } }
  ];
  const products = PRODUCTS.map((p, idx) => ({
    id:          idx + 1,
    name:        p.name,
    sku:         p.sku,
    description: `High-quality ${p.name.toLowerCase()}. ${pick(BODIES).split('.')[0]}.`,
    price:       p.price,
    category:    p.category,
    stock:       p.stock,
    active:      idx !== 12,
    metadata:    p.meta,
    created_at:  isoDate(rand(500) + 30)
  }));

  // ── orders ──
  const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
  const orders = [];
  for (let i = 1; i <= 40; i++) {
    const created = isoDate(rand(300));
    const status  = pick(STATUSES);
    orders.push({
      id:               i,
      user_id:          rand(20) + 1,
      status,
      total:            0,  // recalculated below
      shipping_address: {
        street:   pick(STREETS),
        city:     pick(CITIES),
        postcode: pick(POSTCODES)
      },
      notes:      rand(4) === 0 ? 'Please leave at the door.' : null,
      created_at: created,
      updated_at: created
    });
  }

  // ── order_items ──
  const order_items = [];
  let oiid = 1;
  for (const order of orders) {
    const itemCount = rand(4) + 1;
    let orderTotal = 0;
    const usedProducts = new Set();
    for (let k = 0; k < itemCount; k++) {
      let pid;
      do { pid = rand(products.length) + 1; } while (usedProducts.has(pid));
      usedProducts.add(pid);
      const product = products[pid - 1];
      const qty     = rand(3) + 1;
      const price   = product.price;
      orderTotal   += qty * price;
      order_items.push({ id: oiid++, order_id: order.id, product_id: pid, quantity: qty, unit_price: price });
    }
    order.total = +orderTotal.toFixed(2);
  }

  // ── user_stats (view) ──
  const user_stats = users.map(u => {
    const userPosts    = posts.filter(p => p.user_id === u.id);
    const userComments = comments.filter(c => c.user_id === u.id);
    const userOrders   = orders.filter(o => o.user_id === u.id && o.status !== 'cancelled');
    const totalSpent   = +userOrders.reduce((acc, o) => acc + o.total, 0).toFixed(2);
    return {
      user_id:       u.id,
      username:      u.name,
      email:         u.email,
      role:          u.role,
      post_count:    userPosts.length,
      comment_count: userComments.length,
      order_count:   userOrders.length,
      total_spent:   totalSpent,
      last_active:   isoDate(rand(60))
    };
  });

  return { users, posts, comments, products, orders, order_items, user_stats };
})();
