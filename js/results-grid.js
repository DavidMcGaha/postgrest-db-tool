/**
 * Results Grid
 * Renders query results in a dynamic table with sorting, pagination, and export.
 */
const ResultsGrid = (() => {
  let _data = [];
  let _columns = [];
  let _sortColumn = null;
  let _sortAsc = true;
  let _totalCount = null;
  let _currentOffset = 0;
  let _pageSize = 25;

  function init() {
    document.getElementById('page-size').addEventListener('change', (e) => {
      _pageSize = parseInt(e.target.value, 10);
      // Re-execute with new page size
      if (typeof App !== 'undefined') App.executeQuery();
    });

    document.getElementById('btn-prev-page').addEventListener('click', () => {
      _currentOffset = Math.max(0, _currentOffset - _pageSize);
      if (typeof App !== 'undefined') App.executeQuery();
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
      _currentOffset += _pageSize;
      if (typeof App !== 'undefined') App.executeQuery();
    });

    document.getElementById('btn-export-json').addEventListener('click', () => _exportJSON());
    document.getElementById('btn-export-csv').addEventListener('click', () => _exportCSV());
  }

  function getPageSize() { return _pageSize; }
  function getOffset() { return _currentOffset; }
  function setOffset(val) { _currentOffset = val; }

  /**
   * Display query results.
   * @param {{ data, status, statusText, count, elapsed, contentRange }} result
   */
  function showResults(result) {
    _data = Array.isArray(result.data) ? result.data : [result.data];
    _totalCount = result.count;
    _sortColumn = null;
    _sortAsc = true;

    if (_data.length === 0) {
      _showEmpty(result);
      return;
    }

    // Derive columns from first row
    _columns = Object.keys(_data[0]);

    _renderTable();
    _updatePagination(result);
    _updateStatus(result);
    _showExportButtons(true);
  }

  function showError(err) {
    const container = document.getElementById('results-content');
    let msg = err.message || String(err);
    if (err.detail) msg += '\n\nDetail: ' + err.detail;
    if (err.hint) msg += '\nHint: ' + err.hint;
    if (err.pgCode) msg += '\nCode: ' + err.pgCode;

    container.innerHTML = `<div class="error-message">${_esc(msg)}</div>`;

    document.getElementById('results-pagination').classList.add('hidden');
    _showExportButtons(false);

    const statusText = err.elapsed !== undefined
      ? `Error ${err.status || ''} • ${err.elapsed}ms`
      : 'Error';
    document.getElementById('status-text').textContent = statusText;
    document.getElementById('result-info').textContent = '';
  }

  function showLoading() {
    document.getElementById('results-content').innerHTML =
      '<div class="loading-overlay"><div class="spinner"></div> Executing query…</div>';
    document.getElementById('results-pagination').classList.add('hidden');
    document.getElementById('status-text').textContent = 'Executing…';
    document.getElementById('result-info').textContent = '';
  }

  function clear() {
    document.getElementById('results-content').innerHTML =
      '<p class="placeholder-text">Execute a query to see results.</p>';
    document.getElementById('results-pagination').classList.add('hidden');
    document.getElementById('status-text').textContent = 'Ready';
    document.getElementById('result-info').textContent = '';
    _showExportButtons(false);
    _data = [];
    _columns = [];
    _currentOffset = 0;
    _totalCount = null;
  }

  // ── Rendering ──

  function _renderTable() {
    const container = document.getElementById('results-content');

    let sortedData = [..._data];
    if (_sortColumn !== null) {
      sortedData.sort((a, b) => {
        const va = a[_sortColumn];
        const vb = b[_sortColumn];
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === 'number' && typeof vb === 'number') {
          return _sortAsc ? va - vb : vb - va;
        }
        const sa = String(va);
        const sb = String(vb);
        return _sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }

    let html = '<div class="results-table-wrapper"><table class="results-table"><thead><tr>';

    for (const col of _columns) {
      let indicator = '';
      if (_sortColumn === col) {
        indicator = `<span class="sort-indicator">${_sortAsc ? '▲' : '▼'}</span>`;
      }
      html += `<th data-col="${col}">${_esc(col)}${indicator}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const row of sortedData) {
      html += '<tr>';
      for (const col of _columns) {
        const val = row[col];
        const { display, className, title } = _formatCell(val);
        html += `<td class="${className}" title="${_esc(title)}">${display}</td>`;
      }
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Bind column header clicks for sorting
    container.querySelectorAll('.results-table th').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (_sortColumn === col) {
          _sortAsc = !_sortAsc;
        } else {
          _sortColumn = col;
          _sortAsc = true;
        }
        _renderTable();
      });
    });
  }

  function _formatCell(val) {
    if (val === null || val === undefined) {
      return { display: 'NULL', className: 'cell-null', title: 'NULL' };
    }
    if (typeof val === 'boolean') {
      return { display: String(val), className: 'cell-bool', title: String(val) };
    }
    if (typeof val === 'number') {
      return { display: String(val), className: 'cell-number', title: String(val) };
    }
    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        const count = val.length;
        const json = JSON.stringify(val);
        const summary = count === 0 ? '[]' : `[${count} row${count > 1 ? 's' : ''}]`;
        return { display: _esc(summary), className: 'cell-embed', title: JSON.stringify(val, null, 2) };
      }
      const json = JSON.stringify(val);
      const keys = Object.keys(val);
      const summary = keys.length <= 3
        ? keys.map(k => `${k}: ${val[k] === null ? 'NULL' : val[k]}`).join(', ')
        : json;
      return { display: _esc(summary), className: 'cell-embed', title: JSON.stringify(val, null, 2) };
    }
    return { display: _esc(String(val)), className: 'cell-string', title: String(val) };
  }

  function _showEmpty(result) {
    document.getElementById('results-content').innerHTML =
      '<p class="placeholder-text">Query returned no rows.</p>';
    _updateStatus(result);
    document.getElementById('results-pagination').classList.add('hidden');
    _showExportButtons(false);
  }

  // ── Pagination ──

  function _updatePagination(result) {
    const paginationEl = document.getElementById('results-pagination');
    const hasCount = _totalCount !== null;

    if (!hasCount && _data.length < _pageSize && _currentOffset === 0) {
      // Single page, no need for pagination
      paginationEl.classList.add('hidden');
      return;
    }

    paginationEl.classList.remove('hidden');

    const from = _currentOffset + 1;
    const to = _currentOffset + _data.length;
    const total = hasCount ? ` of ${_totalCount}` : '+';

    document.getElementById('page-info').textContent = `Rows ${from}–${to}${total}`;
    document.getElementById('btn-prev-page').disabled = _currentOffset === 0;
    document.getElementById('btn-next-page').disabled =
      hasCount ? (_currentOffset + _pageSize >= _totalCount) : (_data.length < _pageSize);
  }

  // ── Status ──

  function _updateStatus(result) {
    const parts = [];
    parts.push(`${result.status} ${result.statusText}`);
    parts.push(`${_data.length} row${_data.length !== 1 ? 's' : ''}`);
    if (result.elapsed !== undefined) parts.push(`${result.elapsed}ms`);

    document.getElementById('status-text').textContent = parts.join(' • ');

    const info = _totalCount !== null ? `Total: ${_totalCount} rows` : '';
    document.getElementById('result-info').textContent = info;
  }

  // ── Export ──

  function _showExportButtons(show) {
    document.getElementById('btn-export-json').classList.toggle('hidden', !show);
    document.getElementById('btn-export-csv').classList.toggle('hidden', !show);
  }

  function _exportJSON() {
    const json = JSON.stringify(_data, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      _flashStatus('JSON copied to clipboard');
    }).catch(() => {
      _downloadFile('results.json', json, 'application/json');
    });
  }

  function _exportCSV() {
    if (!_columns.length) return;
    const lines = [];
    lines.push(_columns.map(c => `"${c}"`).join(','));
    for (const row of _data) {
      const vals = _columns.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
        return `"${String(v).replace(/"/g, '""')}"`;
      });
      lines.push(vals.join(','));
    }
    _downloadFile('results.csv', lines.join('\n'), 'text/csv');
  }

  function _downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function _flashStatus(msg) {
    const el = document.getElementById('status-text');
    const prev = el.textContent;
    el.textContent = msg;
    setTimeout(() => { el.textContent = prev; }, 2000);
  }

  function _esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { init, showResults, showError, showLoading, clear, getPageSize, getOffset, setOffset };
})();
