/**
 * Detail Panel
 * Shows column definitions for tables/views and parameters for functions.
 */
const DetailPanel = (() => {
  let _currentItem = null;

  function show(item) {
    _currentItem = item;
    const container = document.getElementById('detail-content');

    if (!item) {
      container.innerHTML = '<p class="placeholder-text">Select a table, view, or function to see details.</p>';
      return;
    }

    if (item.type === 'function') {
      _renderFunctionDetails(container, item);
    } else {
      _renderTableDetails(container, item);
    }
  }

  function clear() {
    _currentItem = null;
    document.getElementById('detail-content').innerHTML =
      '<p class="placeholder-text">Select a table, view, or function to see details.</p>';
  }

  function _renderTableDetails(container, item) {
    const columns = item.columns || [];
    if (!columns.length) {
      container.innerHTML = `<p class="placeholder-text">No column info available for "${item.name}".</p>`;
      return;
    }

    let html = `<table class="detail-table">
      <thead>
        <tr>
          <th></th>
          <th>Column</th>
          <th>Type</th>
          <th>Null</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>`;

    for (const col of columns) {
      // Icons: PK, FK, or blank
      let icons = '';
      if (col.isPK) icons += '🔑';
      if (col.isFK) icons += '🔗';

      // Row CSS class for indexed columns (PK/FK)
      const rowClass = col.isPK ? 'row-pk' : col.isFK ? 'row-fk' : '';
      const nameClass = (col.isPK || col.isFK) ? 'col-indexed' : '';

      const nullable = col.nullable ? '✓' : '';
      const typeStr = col.format ? `${col.type} (${col.format})` : col.type;

      // Description: append FK reference info
      let descText = col.description || '';
      if (col.isFK && col.fkTable) {
        const fkRef = `→ ${col.fkTable}.${col.fkColumn}`;
        descText = descText ? `${descText} ${fkRef}` : fkRef;
      }

      html += `
        <tr class="${rowClass}">
          <td class="col-pk">${icons}</td>
          <td class="clickable ${nameClass}" data-column="${col.name}" title="Click to add to select">${col.name}</td>
          <td class="col-type" title="${typeStr}">${typeStr}</td>
          <td class="col-nullable">${nullable}</td>
          <td title="${_esc(descText)}">${_esc(descText)}</td>
        </tr>`;
    }

    html += '</tbody></table>';
    container.innerHTML = html;

    // Click column name to add to query select
    container.querySelectorAll('.clickable').forEach(td => {
      td.addEventListener('click', () => {
        QueryEditor.addColumnToSelect(td.dataset.column);
      });
    });
  }

  function _renderFunctionDetails(container, item) {
    const params = item.parameters || [];
    let html = `<div style="padding:4px 8px">
      <div style="font-weight:600;margin-bottom:4px">⚙️ ${item.name}</div>`;

    if (item.description) {
      html += `<div style="color:var(--text-secondary);font-size:11px;margin-bottom:6px">${_esc(item.description)}</div>`;
    }

    if (!params.length) {
      html += '<p class="placeholder-text">No parameters.</p>';
    } else {
      html += `<table class="detail-table">
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>`;
      for (const p of params) {
        html += `
          <tr>
            <td>${p.name}</td>
            <td class="col-type">${p.type}${p.format ? ` (${p.format})` : ''}</td>
            <td>${p.required ? '✓' : ''}</td>
            <td title="${_esc(p.description)}">${_esc(p.description)}</td>
          </tr>`;
      }
      html += '</tbody></table>';
    }

    html += `<div style="margin-top:6px;font-size:10px;color:var(--text-muted)">
      Methods: ${(item.httpMethods || []).join(', ')}
    </div></div>`;

    container.innerHTML = html;
  }

  function _esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { show, clear };
})();
