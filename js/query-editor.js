/**
 * Query Editor
 * Dual-mode query builder: URL Builder (visual) and Raw Request.
 */
const QueryEditor = (() => {
  const HISTORY_KEY = 'postgrest-explorer-history';
  const MAX_HISTORY = 50;

  let _currentResource = null;
  let _activeTab = 'builder';

  const OPERATORS = [
    { value: 'eq', label: 'eq (=)' },
    { value: 'neq', label: 'neq (≠)' },
    { value: 'gt', label: 'gt (>)' },
    { value: 'gte', label: 'gte (≥)' },
    { value: 'lt', label: 'lt (<)' },
    { value: 'lte', label: 'lte (≤)' },
    { value: 'like', label: 'like' },
    { value: 'ilike', label: 'ilike' },
    { value: 'is', label: 'is' },
    { value: 'in', label: 'in' },
    { value: 'fts', label: 'fts' },
    { value: 'cs', label: 'cs (contains)' },
    { value: 'cd', label: 'cd (contained)' },
    { value: 'ov', label: 'ov (overlap)' },
    { value: 'not.eq', label: 'not.eq' },
    { value: 'not.is', label: 'not.is' },
    { value: 'not.like', label: 'not.like' },
    { value: 'not.in', label: 'not.in' }
  ];

  function init() {
    _bindTabs();
    _bindButtons();
    _bindResourceSelector();
    _bindBuilderInputs();
    _loadHistory();
  }

  // ── Public API ──

  function setResource(item) {
    _currentResource = item;
    const select = document.getElementById('qb-resource');

    // Ensure the resource is in the dropdown
    let found = false;
    for (const opt of select.options) {
      if (opt.value === item.name) { found = true; break; }
    }
    if (!found) {
      // Probably need to repopulate
      populateResources();
    }
    select.value = item.name;
    _onResourceChange();
  }

  function populateResources() {
    const select = document.getElementById('qb-resource');
    const resources = SchemaBrowser.getAllResources();
    select.innerHTML = '<option value="">Select table/view/function…</option>';
    for (const r of resources) {
      const opt = document.createElement('option');
      opt.value = r.name;
      const icon = r.type === 'table' ? '🗃️' : r.type === 'view' ? '👁️' : '⚙️';
      opt.textContent = `${icon} ${r.name}`;
      select.appendChild(opt);
    }
  }

  function addColumnToSelect(colName) {
    const input = document.getElementById('qb-select');
    const current = input.value.trim();
    if (!current || current === '*') {
      input.value = colName;
    } else {
      const cols = current.split(',').map(c => c.trim());
      if (!cols.includes(colName)) {
        cols.push(colName);
        input.value = cols.join(',');
      }
    }
    _updateUrlPreview();
  }

  function clear() {
    document.getElementById('qb-resource').value = '';
    document.getElementById('qb-select').value = '';
    document.getElementById('qb-limit').value = '25';
    document.getElementById('qb-offset').value = '0';
    document.getElementById('qb-filters').innerHTML = '';
    document.getElementById('qb-orders').innerHTML = '';
    document.getElementById('qb-fn-params').innerHTML = '';
    document.getElementById('qb-url-preview').textContent = '';
    document.getElementById('qb-resource-type').textContent = '';
    document.getElementById('qb-resource-type').className = 'badge';
    document.getElementById('raw-path').value = '';
    document.getElementById('raw-body').value = '';
    document.getElementById('raw-method').value = 'GET';
    _currentResource = null;
    _showTableControls();
  }

  /**
   * Build the request from the current editor state.
   * Returns { method, path, queryParams, body } or null if invalid.
   */
  function buildRequest() {
    if (_activeTab === 'raw') {
      return _buildRawRequest();
    }
    return _buildFromBuilder();
  }

  function getActiveTab() { return _activeTab; }

  // ── Tab Switching ──

  function _bindTabs() {
    document.querySelectorAll('.tab-bar .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-bar .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const tabId = tab.dataset.tab;
        document.getElementById('tab-' + tabId).classList.add('active');
        _activeTab = tabId;

        // Sync raw request from builder when switching
        if (tabId === 'raw') {
          _syncBuilderToRaw();
        }
      });
    });
  }

  // ── Buttons ──

  function _bindButtons() {
    document.getElementById('btn-add-filter').addEventListener('click', () => _addFilterRow());
    document.getElementById('btn-add-order').addEventListener('click', () => _addOrderRow());
    document.getElementById('btn-clear').addEventListener('click', () => {
      clear();
      ResultsGrid.clear();
    });

    document.getElementById('query-history').addEventListener('change', (e) => {
      if (e.target.value) {
        _loadFromHistory(parseInt(e.target.value, 10));
      }
    });
  }

  // ── Resource Selector ──

  function _bindResourceSelector() {
    document.getElementById('qb-resource').addEventListener('change', () => _onResourceChange());
  }

  function _onResourceChange() {
    const name = document.getElementById('qb-resource').value;
    const resource = SchemaBrowser.getResource(name);
    _currentResource = resource;

    // Reset filters, orders, select, and pagination when switching resources
    document.getElementById('qb-select').value = '';
    document.getElementById('qb-limit').value = '25';
    document.getElementById('qb-offset').value = '0';
    document.getElementById('qb-filters').innerHTML = '';
    document.getElementById('qb-orders').innerHTML = '';
    document.getElementById('qb-fn-params').innerHTML = '';
    ResultsGrid.clear();

    const badge = document.getElementById('qb-resource-type');
    if (resource) {
      badge.textContent = resource.type;
      badge.className = 'badge badge-' + resource.type;

      if (resource.type === 'function') {
        _showFunctionControls(resource);
      } else {
        _showTableControls();
      }
    } else {
      badge.textContent = '';
      badge.className = 'badge';
      _showTableControls();
    }

    _updateUrlPreview();
  }

  function _showTableControls() {
    document.getElementById('qb-filters-section').style.display = '';
    document.getElementById('qb-order-section').style.display = '';
    document.getElementById('qb-fn-params-section').style.display = 'none';
  }

  function _showFunctionControls(fn) {
    document.getElementById('qb-filters-section').style.display = 'none';
    document.getElementById('qb-order-section').style.display = 'none';
    document.getElementById('qb-fn-params-section').style.display = '';

    const container = document.getElementById('qb-fn-params');
    container.innerHTML = '';

    for (const p of fn.parameters) {
      const row = document.createElement('div');
      row.className = 'fn-param-row';
      row.innerHTML = `
        <label>${p.name} ${p.required ? '<span style="color:var(--danger)">*</span>' : ''}</label>
        <input type="text" data-param="${p.name}" placeholder="${p.type}${p.format ? ' (' + p.format + ')' : ''}">
        <span class="fn-param-type">${p.type}</span>
      `;
      container.appendChild(row);
    }
  }

  // ── Filter / Order Rows ──

  function _addFilterRow(col, op, val) {
    const container = document.getElementById('qb-filters');
    const row = document.createElement('div');
    row.className = 'filter-row';

    // Build column options from current resource
    let colOptions = '<option value="">column</option>';
    if (_currentResource && _currentResource.columns) {
      for (const c of _currentResource.columns) {
        const selected = c.name === col ? ' selected' : '';
        colOptions += `<option value="${c.name}"${selected}>${c.name}</option>`;
      }
    }

    let opOptions = '';
    for (const o of OPERATORS) {
      const selected = o.value === op ? ' selected' : '';
      opOptions += `<option value="${o.value}"${selected}>${o.label}</option>`;
    }

    row.innerHTML = `
      <select class="filter-col">${colOptions}</select>
      <select class="filter-op">${opOptions}</select>
      <input class="filter-val" type="text" placeholder="value" value="${val || ''}">
      <button class="btn-remove-row" title="Remove">×</button>
    `;

    row.querySelector('.btn-remove-row').addEventListener('click', () => {
      row.remove();
      _updateUrlPreview();
    });

    // Update preview on changes
    row.querySelectorAll('select, input').forEach(el => {
      el.addEventListener('change', () => _updateUrlPreview());
      el.addEventListener('input', () => _updateUrlPreview());
    });

    container.appendChild(row);
    _updateUrlPreview();
  }

  function _addOrderRow(col, dir) {
    const container = document.getElementById('qb-orders');
    const row = document.createElement('div');
    row.className = 'order-row';

    let colOptions = '<option value="">column</option>';
    if (_currentResource && _currentResource.columns) {
      for (const c of _currentResource.columns) {
        const selected = c.name === col ? ' selected' : '';
        colOptions += `<option value="${c.name}"${selected}>${c.name}</option>`;
      }
    }

    row.innerHTML = `
      <select class="order-col">${colOptions}</select>
      <select class="order-dir">
        <option value="asc"${dir === 'asc' ? ' selected' : ''}>ASC</option>
        <option value="desc"${dir === 'desc' ? ' selected' : ''}>DESC</option>
      </select>
      <button class="btn-remove-row" title="Remove">×</button>
    `;

    row.querySelector('.btn-remove-row').addEventListener('click', () => {
      row.remove();
      _updateUrlPreview();
    });

    row.querySelectorAll('select').forEach(el => {
      el.addEventListener('change', () => _updateUrlPreview());
    });

    container.appendChild(row);
    _updateUrlPreview();
  }

  // ── Builder Input Binding ──

  function _bindBuilderInputs() {
    ['qb-select', 'qb-limit', 'qb-offset'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => _updateUrlPreview());
    });
  }

  // ── URL Preview ──

  function _updateUrlPreview() {
    const req = _buildFromBuilder();
    const preview = document.getElementById('qb-url-preview');
    if (!req) {
      preview.textContent = '';
      return;
    }

    let url = req.path;
    const params = new URLSearchParams();
    if (req.queryParams) {
      for (const [k, v] of Object.entries(req.queryParams)) {
        if (v !== '' && v !== undefined && v !== null) params.set(k, v);
      }
    }
    const qs = params.toString();
    if (qs) url += '?' + decodeURIComponent(qs);

    preview.textContent = `${req.method} ${url}`;
  }

  // ── Build Requests ──

  function _buildFromBuilder() {
    const resourceName = document.getElementById('qb-resource').value;
    if (!resourceName) return null;

    const resource = SchemaBrowser.getResource(resourceName);

    if (resource && resource.type === 'function') {
      return _buildFunctionRequest(resource);
    }

    const select = document.getElementById('qb-select').value.trim();
    const limit = document.getElementById('qb-limit').value.trim();
    const offset = document.getElementById('qb-offset').value.trim();

    const queryParams = {};
    if (select && select !== '*') queryParams.select = select;
    if (limit) queryParams.limit = limit;
    if (offset && offset !== '0') queryParams.offset = offset;

    // Filters
    document.querySelectorAll('#qb-filters .filter-row').forEach(row => {
      const col = row.querySelector('.filter-col').value;
      const op = row.querySelector('.filter-op').value;
      const val = row.querySelector('.filter-val').value;
      if (col && op && val !== '') {
        queryParams[col] = `${op}.${val}`;
      }
    });

    // Order
    const orders = [];
    document.querySelectorAll('#qb-orders .order-row').forEach(row => {
      const col = row.querySelector('.order-col').value;
      const dir = row.querySelector('.order-dir').value;
      if (col) orders.push(`${col}.${dir}`);
    });
    if (orders.length) queryParams.order = orders.join(',');

    return {
      method: 'GET',
      path: '/' + resourceName,
      queryParams,
      body: null
    };
  }

  function _buildFunctionRequest(fn) {
    const args = {};
    document.querySelectorAll('#qb-fn-params .fn-param-row input').forEach(input => {
      const val = input.value.trim();
      if (val !== '') {
        // Try to parse as number/bool/null
        const paramName = input.dataset.param;
        if (val === 'true') args[paramName] = true;
        else if (val === 'false') args[paramName] = false;
        else if (val === 'null') args[paramName] = null;
        else if (!isNaN(val) && val !== '') args[paramName] = Number(val);
        else args[paramName] = val;
      }
    });

    const select = document.getElementById('qb-select').value.trim();
    const limit = document.getElementById('qb-limit').value.trim();
    const offset = document.getElementById('qb-offset').value.trim();

    // For functions, prefer POST with JSON body
    const queryParams = {};
    if (select && select !== '*') queryParams.select = select;
    if (limit) queryParams.limit = limit;
    if (offset && offset !== '0') queryParams.offset = offset;

    return {
      method: 'POST',
      path: '/rpc/' + fn.name,
      queryParams,
      body: args
    };
  }

  function _buildRawRequest() {
    const method = document.getElementById('raw-method').value;
    const pathAndQuery = document.getElementById('raw-path').value.trim();
    const body = document.getElementById('raw-body').value.trim();

    if (!pathAndQuery) return null;

    return {
      method,
      path: pathAndQuery,
      queryParams: null, // already in the path
      body: body || null,
      isRaw: true
    };
  }

  function _syncBuilderToRaw() {
    const req = _buildFromBuilder();
    if (!req) return;

    let url = req.path;
    if (req.queryParams) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(req.queryParams)) {
        if (v !== '' && v !== undefined && v !== null) params.set(k, v);
      }
      const qs = params.toString();
      if (qs) url += '?' + decodeURIComponent(qs);
    }

    document.getElementById('raw-method').value = req.method;
    document.getElementById('raw-path').value = url;
    document.getElementById('raw-body').value = req.body ? JSON.stringify(req.body, null, 2) : '';
  }

  // ── History ──

  function saveToHistory(request) {
    const history = _getHistory();
    history.unshift({
      timestamp: Date.now(),
      method: request.method,
      path: request.path,
      queryParams: request.queryParams,
      body: request.body
    });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    _loadHistory();
  }

  function _getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  }

  function _loadHistory() {
    const select = document.getElementById('query-history');
    const history = _getHistory();
    select.innerHTML = '<option value="">— History —</option>';
    history.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      const time = new Date(h.timestamp).toLocaleTimeString();
      let url = h.path;
      if (h.queryParams) {
        const qs = Object.entries(h.queryParams)
          .filter(([, v]) => v !== '' && v !== undefined)
          .map(([k, v]) => `${k}=${v}`)
          .join('&');
        if (qs) url += '?' + qs;
      }
      opt.textContent = `${time} ${h.method} ${url}`.substring(0, 80);
      select.appendChild(opt);
    });
  }

  function _loadFromHistory(index) {
    const history = _getHistory();
    const h = history[index];
    if (!h) return;

    // Load into raw tab
    document.getElementById('raw-method').value = h.method;
    document.getElementById('raw-path').value = h.path + (h.queryParams ?
      '?' + Object.entries(h.queryParams).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&') : '');
    document.getElementById('raw-body').value = h.body ? JSON.stringify(h.body, null, 2) : '';

    // Switch to raw tab
    document.querySelectorAll('.tab-bar .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="raw"]').classList.add('active');
    document.getElementById('tab-raw').classList.add('active');
    _activeTab = 'raw';
  }

  return { init, setResource, populateResources, addColumnToSelect, clear, buildRequest, getActiveTab, saveToHistory };
})();
