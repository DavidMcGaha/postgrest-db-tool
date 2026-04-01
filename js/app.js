/**
 * App — Main application orchestration
 * Initializes all modules, wires events, handles global keyboard shortcuts.
 */
const App = (() => {
  let _timerInterval = null;
  let _queryStartTime = null;

  function init() {
    // Initialize all modules
    ConnectionManager.init();
    QueryEditor.init();
    ResultsGrid.init();

    // Load theme
    _loadTheme();

    // ── Wire connection events ──
    ConnectionManager.on('connect', async ({ spec, elapsed, url }) => {
      const schema = SchemaBrowser.loadSpec(spec);
      QueryEditor.populateResources();
      DetailPanel.clear();
      ResultsGrid.clear();
      document.getElementById('status-text').textContent =
        `Connected • ${schema.tables.length} tables, ${schema.views.length} views, ${schema.functions.length} functions • ${elapsed}ms`;

      // Detect available schemas
      const schemas = await PostgRESTClient.detectSchemas();
      _populateSchemaSelector(schemas);
    });

    ConnectionManager.on('disconnect', () => {
      SchemaBrowser.clear();
      QueryEditor.clear();
      DetailPanel.clear();
      ResultsGrid.clear();
      document.getElementById('status-text').textContent = 'Disconnected';
      document.getElementById('schema-select').classList.add('hidden');
    });

    ConnectionManager.on('error', ({ error }) => {
      ResultsGrid.showError(error);
      document.getElementById('status-text').textContent = 'Connection failed';
    });

    // ── Wire schema browser events ──
    SchemaBrowser.on('select', (item) => {
      DetailPanel.show(item);
      QueryEditor.setResource(item);
    });

    SchemaBrowser.on('dblclick', (item) => {
      DetailPanel.show(item);
      QueryEditor.setResource(item);
      executeQuery();
    });

    // ── Wire execute button ──
    document.getElementById('btn-execute').addEventListener('click', () => executeQuery());

    // ── Wire cancel button ──
    document.getElementById('btn-cancel').addEventListener('click', () => cancelQuery());

    // ── Wire theme toggle ──
    document.getElementById('btn-theme').addEventListener('click', _toggleTheme);

    // ── Wire demo button ──
    document.getElementById('btn-demo').addEventListener('click', () => {
      document.getElementById('conn-url').value = DEMO_BASE_URL;
      document.getElementById('conn-jwt').value = '';
      document.getElementById('btn-connect').click();
    });

    // ── Global keyboard shortcuts ──
    document.addEventListener('keydown', (e) => {
      // Ctrl+Enter or Cmd+Enter → Execute
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQuery();
      }
      // Ctrl+Shift+C → Focus connection URL
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        document.getElementById('conn-url').focus();
      }
      // Escape → Clear results
      if (e.key === 'Escape') {
        ResultsGrid.clear();
      }
    });

    // ── Resizable panels ──
    _initResizeHandles();

    // ── Schema selector ──
    document.getElementById('schema-select').addEventListener('change', (e) => {
      _switchSchema(e.target.value);
    });
  }

  async function executeQuery() {
    if (!ConnectionManager.isConnected()) {
      ResultsGrid.showError(new Error('Not connected. Enter a PostgREST URL and click Connect.'));
      return;
    }

    const request = QueryEditor.buildRequest();
    if (!request) {
      ResultsGrid.showError(new Error('No query to execute. Select a resource or enter a request.'));
      return;
    }

    ResultsGrid.showLoading();
    _startTimer();
    _setQueryRunning(true);

    // Update limit/offset from pagination state
    if (!request.isRaw) {
      if (!request.queryParams) request.queryParams = {};
      request.queryParams.limit = String(ResultsGrid.getPageSize());
      const offset = ResultsGrid.getOffset();
      if (offset > 0) request.queryParams.offset = String(offset);
      else delete request.queryParams.offset;
    }

    try {
      let result;
      if (request.isRaw) {
        result = await PostgRESTClient.executeRaw(
          request.method,
          request.path,
          request.body
        );
      } else if (request.path.startsWith('/rpc/')) {
        const fnName = request.path.replace('/rpc/', '');
        result = await PostgRESTClient.callFunction(
          fnName,
          request.body,
          request.method
        );
        // Apply limit/offset via query params for function result sets
        if (request.queryParams) {
          const qs = Object.entries(request.queryParams)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}=${v}`)
            .join('&');
          if (qs) {
            result = await PostgRESTClient.executeRaw(
              request.method,
              request.path + '?' + qs,
              request.body ? JSON.stringify(request.body) : null
            );
          }
        }
      } else {
        result = await PostgRESTClient.executeQuery(
          request.path,
          request.queryParams
        );
      }

      _stopTimer(true);
      _setQueryRunning(false);
      ResultsGrid.showResults(result);
      QueryEditor.saveToHistory(request);
    } catch (err) {
      _stopTimer(false);
      _setQueryRunning(false);
      if (err.name === 'AbortError') {
        ResultsGrid.showError(Object.assign(new Error('Query cancelled by user.'), {
          elapsed: _getElapsed()
        }));
      } else {
        ResultsGrid.showError(err);
      }
    }
  }

  function cancelQuery() {
    PostgRESTClient.cancel();
  }

  // ── Schema Selector ──

  function _populateSchemaSelector(schemas) {
    const select = document.getElementById('schema-select');
    if (!schemas || schemas.length === 0) {
      select.classList.add('hidden');
      return;
    }

    select.innerHTML = '';
    for (const s of schemas) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      select.appendChild(opt);
    }
    // Select current schema if set, otherwise first
    const current = PostgRESTClient.getSchema();
    if (current && schemas.includes(current)) {
      select.value = current;
    }
    select.classList.remove('hidden');
  }

  async function _switchSchema(schemaName) {
    PostgRESTClient.setSchema(schemaName);
    document.getElementById('status-text').textContent = `Switching to schema "${schemaName}"…`;

    try {
      const { spec, elapsed } = await PostgRESTClient.fetchSchema();
      const schema = SchemaBrowser.loadSpec(spec);
      QueryEditor.populateResources();
      QueryEditor.clear();
      DetailPanel.clear();
      ResultsGrid.clear();
      document.getElementById('status-text').textContent =
        `Schema: ${schemaName} • ${schema.tables.length} tables, ${schema.views.length} views, ${schema.functions.length} functions • ${elapsed}ms`;
    } catch (err) {
      ResultsGrid.showError(err);
      document.getElementById('status-text').textContent = `Failed to switch schema: ${err.message}`;
    }
  }

  // ── Timer ──

  function _startTimer() {
    _stopTimer(false);
    _queryStartTime = performance.now();
    const timerEl = document.getElementById('elapsed-timer');
    timerEl.classList.remove('hidden', 'done');
    timerEl.textContent = '0.0s';

    _timerInterval = setInterval(() => {
      timerEl.textContent = _formatElapsed(performance.now() - _queryStartTime);
    }, 100);
  }

  function _stopTimer(success) {
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
    const timerEl = document.getElementById('elapsed-timer');
    if (_queryStartTime) {
      const elapsed = performance.now() - _queryStartTime;
      timerEl.textContent = _formatElapsed(elapsed);
      timerEl.classList.toggle('done', success);
      timerEl.classList.remove('hidden');
    }
  }

  function _getElapsed() {
    return _queryStartTime ? Math.round(performance.now() - _queryStartTime) : 0;
  }

  function _formatElapsed(ms) {
    if (ms < 1000) return Math.round(ms) + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(1);
    return `${mins}m ${secs}s`;
  }

  function _setQueryRunning(running) {
    document.getElementById('btn-execute').classList.toggle('hidden', running);
    document.getElementById('btn-cancel').classList.toggle('hidden', !running);
  }

  // ── Theme ──

  function _loadTheme() {
    const saved = localStorage.getItem('postgrest-explorer-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    _updateThemeButton(saved);
  }

  function _toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('postgrest-explorer-theme', next);
    _updateThemeButton(next);
  }

  function _updateThemeButton(theme) {
    document.getElementById('btn-theme').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ── Resizable Panels ──

  function _initResizeHandles() {
    // Vertical handle between sidebar and main
    _makeDraggable('resize-handle-main', 'vertical', (delta) => {
      const sidebar = document.getElementById('sidebar');
      const newWidth = sidebar.offsetWidth + delta;
      if (newWidth >= 180 && newWidth <= 500) {
        sidebar.style.width = newWidth + 'px';
      }
    });

    // Horizontal handle in sidebar between schema browser and detail panel
    _makeDraggable('resize-handle-sidebar', 'horizontal', (delta) => {
      const detail = document.getElementById('detail-panel');
      const newHeight = detail.offsetHeight - delta;
      if (newHeight >= 80 && newHeight <= window.innerHeight * 0.5) {
        detail.style.flex = `0 0 ${newHeight}px`;
      }
    });

    // Horizontal handle between query editor and results
    _makeDraggable('resize-handle-query', 'horizontal', (delta) => {
      const editor = document.getElementById('query-editor');
      const newHeight = editor.offsetHeight + delta;
      if (newHeight >= 120 && newHeight <= window.innerHeight * 0.6) {
        editor.style.flex = `0 0 ${newHeight}px`;
      }
    });
  }

  function _makeDraggable(handleId, direction, onDrag) {
    const handle = document.getElementById(handleId);
    if (!handle) return;

    let startPos = 0;

    function onMouseDown(e) {
      e.preventDefault();
      startPos = direction === 'vertical' ? e.clientX : e.clientY;
      handle.classList.add('active');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    }

    function onMouseMove(e) {
      const current = direction === 'vertical' ? e.clientX : e.clientY;
      const delta = current - startPos;
      startPos = current;
      onDrag(delta);
    }

    function onMouseUp() {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    handle.addEventListener('mousedown', onMouseDown);
  }

  return { init, executeQuery };
})();

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => App.init());
