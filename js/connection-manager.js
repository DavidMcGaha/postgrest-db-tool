/**
 * Connection Manager
 * Handles connection form UI, localStorage persistence, and events.
 */
const ConnectionManager = (() => {
  const STORAGE_KEY = 'postgrest-explorer-connections';
  let _connected = false;
  let _listeners = { connect: [], disconnect: [], error: [] };

  function init() {
    _bindUI();
    _loadSavedConnections();
  }

  function on(event, fn) {
    if (_listeners[event]) _listeners[event].push(fn);
  }

  function _emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  }

  function _bindUI() {
    const btnConnect = document.getElementById('btn-connect');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const btnSave = document.getElementById('btn-save-conn');
    const savedSelect = document.getElementById('saved-connections');
    const urlInput = document.getElementById('conn-url');

    btnConnect.addEventListener('click', () => _connect());
    btnDisconnect.addEventListener('click', () => _disconnect());
    btnSave.addEventListener('click', () => _saveConnection());

    savedSelect.addEventListener('change', (e) => {
      if (!e.target.value) return;
      const conns = _getSavedConnections();
      const conn = conns.find(c => c.name === e.target.value);
      if (conn) {
        document.getElementById('conn-url').value = conn.url;
        document.getElementById('conn-jwt').value = conn.jwt || '';
      }
    });

    // Connect on Enter in the URL field
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _connect();
    });
  }

  async function _connect() {
    const url = document.getElementById('conn-url').value.trim();
    const jwt = document.getElementById('conn-jwt').value.trim();

    if (!url) {
      _setStatus('disconnected');
      return;
    }

    _setStatus('connecting');
    _setUIConnecting(true);

    try {
      PostgRESTClient.configure(url, jwt);
      const { spec, elapsed } = await PostgRESTClient.fetchSchema();
      _connected = true;
      _setStatus('connected');
      _setUIConnected(true);
      _emit('connect', { spec, elapsed, url });
    } catch (err) {
      _connected = false;
      _setStatus('disconnected');
      _setUIConnecting(false);
      _emit('error', { error: err });
    }
  }

  function _disconnect() {
    _connected = false;
    _setStatus('disconnected');
    _setUIConnected(false);
    _emit('disconnect');
  }

  function isConnected() { return _connected; }

  function _setStatus(state) {
    const dot = document.getElementById('conn-status');
    dot.className = 'status-dot ' + state;
    dot.title = state.charAt(0).toUpperCase() + state.slice(1);
  }

  function _setUIConnecting(loading) {
    const btn = document.getElementById('btn-connect');
    btn.disabled = loading;
    btn.textContent = loading ? 'Connecting…' : 'Connect';
  }

  function _setUIConnected(connected) {
    document.getElementById('btn-connect').classList.toggle('hidden', connected);
    document.getElementById('btn-demo').classList.toggle('hidden', connected);
    document.getElementById('btn-disconnect').classList.toggle('hidden', !connected);
    document.getElementById('btn-connect').disabled = false;
    document.getElementById('btn-connect').textContent = 'Connect';
    document.getElementById('conn-url').disabled = connected;
    document.getElementById('conn-jwt').disabled = connected;
  }

  // ── Saved Connections ──

  function _getSavedConnections() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function _saveToDisk(conns) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
  }

  function _saveConnection() {
    const url = document.getElementById('conn-url').value.trim();
    if (!url) return;
    const name = prompt('Connection name:', new URL(url).hostname || 'My Connection');
    if (!name) return;

    const jwt = document.getElementById('conn-jwt').value.trim();
    const conns = _getSavedConnections();
    const existing = conns.findIndex(c => c.name === name);
    const entry = { name, url, jwt };
    if (existing >= 0) conns[existing] = entry;
    else conns.push(entry);
    _saveToDisk(conns);
    _loadSavedConnections();
  }

  function _loadSavedConnections() {
    const select = document.getElementById('saved-connections');
    const conns = _getSavedConnections();
    select.innerHTML = '<option value="">— Saved —</option>';
    conns.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
  }

  return { init, on, isConnected };
})();
