/**
 * Schema Browser
 * Parses the OpenAPI spec and renders a tree of tables, views, and functions.
 */
const SchemaBrowser = (() => {
  let _schema = { tables: [], views: [], functions: [] };
  let _selectedItem = null;
  let _listeners = { select: [], dblclick: [] };

  function on(event, fn) {
    if (_listeners[event]) _listeners[event].push(fn);
  }

  function _emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  }

  /**
   * Parse an OpenAPI 2.0 spec into categorized schema objects.
   */
  function loadSpec(spec) {
    _schema = { tables: [], views: [], functions: [] };
    const definitions = spec.definitions || {};
    const paths = spec.paths || {};

    for (const [path, methods] of Object.entries(paths)) {
      const name = path.replace(/^\//, '');

      if (name.startsWith('rpc/')) {
        // Function
        const fnName = name.replace('rpc/', '');
        const postDef = methods.post || methods.get || {};
        const params = (postDef.parameters || [])
          .filter(p => p.in === 'body' || p.in === 'query')
          .map(p => {
            if (p.in === 'body' && p.schema && p.schema.properties) {
              // Extract individual properties from the body schema
              return Object.entries(p.schema.properties).map(([pName, pDef]) => ({
                name: pName,
                type: pDef.type || pDef.format || 'unknown',
                format: pDef.format || '',
                description: pDef.description || '',
                required: (p.schema.required || []).includes(pName),
                default: pDef.default !== undefined ? pDef.default : null,
                enum: pDef.enum || null
              }));
            }
            return [{
              name: p.name,
              type: p.type || 'json',
              format: p.format || '',
              description: p.description || '',
              required: p.required || false,
              default: p.default !== undefined ? p.default : null,
              enum: p.enum || null
            }];
          })
          .flat();

        _schema.functions.push({
          name: fnName,
          type: 'function',
          description: (postDef.summary || postDef.description || '').trim(),
          parameters: params,
          httpMethods: Object.keys(methods).map(m => m.toUpperCase())
        });
      } else {
        // Table or View — heuristic: if it supports POST/PATCH/DELETE, it's a table
        const httpMethods = Object.keys(methods).map(m => m.toUpperCase());
        const isWritable = httpMethods.includes('POST') || httpMethods.includes('PATCH') || httpMethods.includes('DELETE');

        // Get column definitions
        const def = definitions[name] || {};
        const properties = def.properties || {};
        const required = def.required || [];
        const description = def.description || '';

        const columns = Object.entries(properties).map(([colName, colDef]) => {
          const desc = colDef.description || '';

          // PostgREST embeds <pk/> and <fk table='x' column='y'/> in descriptions
          const isPK = /<pk\s*\/?>/.test(desc);
          const fkMatch = desc.match(/<fk\s+table='([^']+)'\s+column='([^']+)'\s*\/?>/);
          const isFK = !!fkMatch;
          const fkTable = fkMatch ? fkMatch[1] : null;
          const fkColumn = fkMatch ? fkMatch[2] : null;

          // Clean description: strip PostgREST metadata tags
          const cleanDesc = desc
            .replace(/\s*Note:\s*/gi, '')
            .replace(/This is a Primary Key\.\s*/gi, '')
            .replace(/This is a Foreign Key to\s+`[^`]+`\.\s*/gi, '')
            .replace(/<pk\s*\/?>/g, '')
            .replace(/<fk\s+[^>]*\/?>/g, '')
            .trim();

          return {
            name: colName,
            type: colDef.type || colDef.format || 'unknown',
            format: colDef.format || '',
            description: cleanDesc,
            nullable: !required.includes(colName),
            isPK,
            isFK,
            fkTable,
            fkColumn,
            maxLength: colDef.maxLength || null,
            enum: colDef.enum || null,
            default: colDef.default !== undefined ? colDef.default : null
          };
        });

        const item = {
          name,
          type: isWritable ? 'table' : 'view',
          description,
          columns,
          httpMethods
        };

        if (isWritable) {
          _schema.tables.push(item);
        } else {
          _schema.views.push(item);
        }
      }
    }

    // Sort all categories alphabetically
    _schema.tables.sort((a, b) => a.name.localeCompare(b.name));
    _schema.views.sort((a, b) => a.name.localeCompare(b.name));
    _schema.functions.sort((a, b) => a.name.localeCompare(b.name));

    _render();
    _bindSearch();
    return _schema;
  }

  function getSchema() { return _schema; }

  function getAllResources() {
    return [..._schema.tables, ..._schema.views, ..._schema.functions];
  }

  function getResource(name) {
    return getAllResources().find(r => r.name === name) || null;
  }

  function clear() {
    _schema = { tables: [], views: [], functions: [] };
    _selectedItem = null;
    const tree = document.getElementById('schema-tree');
    tree.innerHTML = '<p class="placeholder-text">Connect to a PostgREST server to browse schema.</p>';
  }

  // ── Rendering ──

  function _render(filter) {
    const tree = document.getElementById('schema-tree');
    tree.innerHTML = '';

    const categories = [
      { key: 'tables', label: 'Tables', icon: '🗃️', items: _schema.tables },
      { key: 'views', label: 'Views', icon: '👁️', items: _schema.views },
      { key: 'functions', label: 'Functions', icon: '⚙️', items: _schema.functions }
    ];

    for (const cat of categories) {
      let items = cat.items;
      if (filter) {
        const f = filter.toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(f));
      }

      const catEl = document.createElement('div');
      catEl.className = 'tree-category';

      const header = document.createElement('div');
      header.className = 'tree-category-header';
      header.innerHTML = `
        <span class="arrow">▾</span>
        <span>${cat.icon}</span>
        <span>${cat.label}</span>
        <span class="count">(${items.length})</span>
      `;

      const itemsEl = document.createElement('div');
      itemsEl.className = 'tree-items';

      header.addEventListener('click', () => {
        const arrow = header.querySelector('.arrow');
        arrow.classList.toggle('collapsed');
        itemsEl.classList.toggle('collapsed');
      });

      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'tree-item';
        if (_selectedItem && _selectedItem.name === item.name) {
          el.classList.add('selected');
        }
        el.dataset.name = item.name;
        el.dataset.type = item.type;

        const icon = item.type === 'table' ? '🗃️' : item.type === 'view' ? '👁️' : '⚙️';
        el.innerHTML = `<span class="tree-icon">${icon}</span><span class="tree-item-name" title="${item.name}">${item.name}</span>`;

        el.addEventListener('click', () => _selectItem(item, el));
        el.addEventListener('dblclick', () => _emit('dblclick', item));

        itemsEl.appendChild(el);
      }

      catEl.appendChild(header);
      catEl.appendChild(itemsEl);
      tree.appendChild(catEl);
    }

    if (!tree.children.length) {
      tree.innerHTML = '<p class="placeholder-text">No matching items.</p>';
    }
  }

  function _selectItem(item, el) {
    // Remove previous selection
    document.querySelectorAll('#schema-tree .tree-item.selected')
      .forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    _selectedItem = item;
    _emit('select', item);
  }

  function _bindSearch() {
    const input = document.getElementById('schema-search');
    // Remove old listener by replacing the element
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('input', (e) => {
      _render(e.target.value);
    });
  }

  return { on, loadSpec, getSchema, getAllResources, getResource, clear };
})();
