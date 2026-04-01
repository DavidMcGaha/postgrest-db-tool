# PostgREST Explorer

A browser-based database exploration tool for [PostgREST](https://postgrest.org) servers. Inspired by LINQPad and DBeaver, it provides a rich UI for browsing schemas and querying PostgreSQL databases through PostgREST's REST API.

## Features

- **Schema Browser** - Discovers tables, views, and functions from the PostgREST OpenAPI spec
- **Detail Panel** - Shows column types, nullability, primary keys, and function parameters
- **URL Builder** - Visual query builder with filters, column selection, ordering, and pagination
- **Raw Request** - Direct PostgREST URL editing for advanced queries
- **Results Grid** - Sortable results table with pagination, row counts, and NULL highlighting
- **Export** - Copy results as JSON or download as CSV
- **Dark / Light Themes** - Toggle between themes; preference is saved
- **Saved Connections** - Store and recall PostgREST server URLs
- **Query History** - Last 50 queries saved for quick recall
- **Keyboard Shortcuts** - Ctrl+Enter execute, Ctrl+Shift+C focus connection, Escape clear results

## Getting Started

1. Open `index.html` in any modern browser
2. Enter your PostgREST server URL (e.g. `http://localhost:3000`)
3. Optionally enter a JWT token for authenticated access
4. Click **Connect**

**Note:** PostgREST must have CORS enabled if the app is served from a different origin.
For local development, serve the files with a simple HTTP server:

```bash
python3 -m http.server 8080
# or
npx serve .
```

## Usage

### Browsing Schema

- The left panel shows tables, views, and functions
- Click a relation to see its columns/parameters in the Details panel
- Double-click to auto-execute a query
- Use the search box to filter by name

### Building Queries

**URL Builder tab:**

- Select a table/view/function from the dropdown
- Choose columns, add filters with PostgREST operators (eq, gt, like, etc.)
- Set ordering and pagination
- The generated URL updates live below the form

**Raw Request tab:**

- Type any PostgREST URL path and query string directly
- Switch between GET and POST methods
- Add a JSON body for RPC function calls

### Results

- Click column headers to sort (client-side)
- Use pagination controls or change page size
- Export as JSON (clipboard) or CSV (download)

## File Structure

```
postgrest-db-tool/
  index.html              Main HTML shell
  css/style.css           All styles (dark + light themes)
  js/
    app.js                App init, state, event bus, theme toggle
    postgrest-client.js   PostgREST HTTP client
    connection-manager.js Connection form, localStorage persistence
    schema-browser.js     Schema tree rendering
    detail-panel.js       Column/parameter detail view
    query-editor.js       URL builder + raw request editor + SQL tab
    results-grid.js       Results table, pagination, export
    sql-translator.js     URL Builder ↔ SQL translation logic
    demo-data.js          Offline demo dataset (OpenAPI spec + mock rows)
    mock-server.js        Fetch interceptor for demo mode
  tests/
    sql-translator.test.js  Unit tests for SqlTranslator (Node.js)
  img/icons.svg           SVG icon sprite
  README.md               This file
```

## Testing

The SQL translator has a self-contained test suite that requires only Node.js (no install needed):

```bash
node tests/sql-translator.test.js
```

125 tests cover `toSQL` (URL Builder → SQL) and `fromSQL` (SQL → URL Builder), including all 18 PostgREST filter operators, JOIN/embed handling, round-trips, and edge cases.

## Requirements

- Any modern browser (Chrome, Firefox, Edge, Safari)
- A running PostgREST server with CORS enabled
