/**
 * PostgREST HTTP Client
 * Handles all communication with the PostgREST server.
 */
const PostgRESTClient = (() => {
  let _baseUrl = '';
  let _jwt = '';
  let _abortController = null;

  function configure(baseUrl, jwt) {
    _baseUrl = baseUrl.replace(/\/+$/, '');
    _jwt = jwt || '';
  }

  function _headers(extra) {
    const h = { 'Accept': 'application/json' };
    if (_jwt) h['Authorization'] = `Bearer ${_jwt}`;
    return Object.assign(h, extra || {});
  }

  /**
   * Fetch the OpenAPI spec from the PostgREST root.
   * Returns the parsed JSON spec.
   */
  async function fetchSchema() {
    const start = performance.now();
    const res = await fetch(_baseUrl + '/', { headers: _headers() });
    const elapsed = Math.round(performance.now() - start);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Schema fetch failed (${res.status}): ${body}`);
    }
    const spec = await res.json();
    return { spec, elapsed };
  }

  /**
   * Execute a query against a table/view.
   * @param {string} path - e.g. '/users'
   * @param {Object} queryParams - key/value pairs for the query string
   * @param {Object} extraHeaders - additional headers
   * @returns {{ data, status, statusText, count, elapsed, contentRange }}
   */
  async function executeQuery(path, queryParams, extraHeaders) {
    const url = new URL(_baseUrl + path);
    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        if (v !== '' && v !== undefined && v !== null) {
          url.searchParams.set(k, v);
        }
      }
    }
    const headers = _headers(Object.assign(
      { 'Prefer': 'count=exact' },
      extraHeaders || {}
    ));

    _abortController = new AbortController();
    const start = performance.now();
    const res = await fetch(url.toString(), { headers, signal: _abortController.signal });
    const elapsed = Math.round(performance.now() - start);

    const contentRange = res.headers.get('Content-Range');
    let count = null;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+|\*)/);
      if (match && match[1] !== '*') count = parseInt(match[1], 10);
    }

    if (!res.ok) {
      const body = await res.text();
      let errObj;
      try { errObj = JSON.parse(body); } catch { errObj = { message: body }; }
      throw Object.assign(new Error(errObj.message || `HTTP ${res.status}`), {
        status: res.status,
        statusText: res.statusText,
        detail: errObj.details || errObj.detail || '',
        hint: errObj.hint || '',
        pgCode: errObj.code || '',
        elapsed
      });
    }

    const data = await res.json();
    return {
      data,
      status: res.status,
      statusText: res.statusText,
      count,
      elapsed,
      contentRange
    };
  }

  /**
   * Call an RPC function.
   * @param {string} fnName
   * @param {Object} args - JSON body for POST
   * @param {string} method - 'GET' or 'POST'
   */
  async function callFunction(fnName, args, method = 'POST') {
    const path = `/rpc/${fnName}`;
    if (method === 'GET') {
      return executeQuery(path, args);
    }

    const headers = _headers({
      'Content-Type': 'application/json',
      'Prefer': 'count=exact'
    });

    _abortController = new AbortController();
    const start = performance.now();
    const res = await fetch(_baseUrl + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(args || {}),
      signal: _abortController.signal
    });
    const elapsed = Math.round(performance.now() - start);

    const contentRange = res.headers.get('Content-Range');
    let count = null;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+|\*)/);
      if (match && match[1] !== '*') count = parseInt(match[1], 10);
    }

    if (!res.ok) {
      const body = await res.text();
      let errObj;
      try { errObj = JSON.parse(body); } catch { errObj = { message: body }; }
      throw Object.assign(new Error(errObj.message || `HTTP ${res.status}`), {
        status: res.status,
        statusText: res.statusText,
        detail: errObj.details || errObj.detail || '',
        hint: errObj.hint || '',
        elapsed
      });
    }

    const data = await res.json();
    return { data, status: res.status, statusText: res.statusText, count, elapsed, contentRange };
  }

  /**
   * Execute a raw request (for the Raw Request tab).
   * @param {string} method - GET or POST
   * @param {string} pathAndQuery - e.g. '/users?select=id,name'
   * @param {string} body - optional JSON body string
   */
  async function executeRaw(method, pathAndQuery, body) {
    const url = _baseUrl + pathAndQuery;
    const headers = _headers({ 'Prefer': 'count=exact' });
    if (method === 'POST' && body) {
      headers['Content-Type'] = 'application/json';
    }

    const opts = { method, headers };
    if (method === 'POST' && body) opts.body = body;

    _abortController = new AbortController();
    opts.signal = _abortController.signal;
    const start = performance.now();
    const res = await fetch(url, opts);
    const elapsed = Math.round(performance.now() - start);

    const contentRange = res.headers.get('Content-Range');
    let count = null;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+|\*)/);
      if (match && match[1] !== '*') count = parseInt(match[1], 10);
    }

    if (!res.ok) {
      const body = await res.text();
      let errObj;
      try { errObj = JSON.parse(body); } catch { errObj = { message: body }; }
      throw Object.assign(new Error(errObj.message || `HTTP ${res.status}`), {
        status: res.status,
        statusText: res.statusText,
        detail: errObj.details || errObj.detail || '',
        hint: errObj.hint || '',
        elapsed
      });
    }

    const data = await res.json();
    return { data, status: res.status, statusText: res.statusText, count, elapsed, contentRange };
  }

  function cancel() {
    if (_abortController) {
      _abortController.abort();
      _abortController = null;
    }
  }

  function getBaseUrl() { return _baseUrl; }

  return { configure, fetchSchema, executeQuery, callFunction, executeRaw, cancel, getBaseUrl };
})();
