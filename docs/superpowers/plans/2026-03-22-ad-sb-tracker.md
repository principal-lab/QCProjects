# QC AD/SB Intelligence Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based dashboard for tracking Airworthiness Directives and Service Bulletins from EASA, FAA, and CASA across 10 aircraft manufacturers.

**Architecture:** Single-file Node.js server (`QC_AD_SB_Server.mjs`) serving a single-file HTML dashboard (`QC_AD_SB_Dashboard.html`), with JSON file storage. Mirrors the QC Aviation Complaints Dashboard pattern exactly — no npm dependencies, Chart.js via CDN, SSE for update progress.

**Tech Stack:** Node.js (built-in modules only), Chart.js v4.4.7 (CDN), vanilla JavaScript, CSS3

**Spec:** `docs/superpowers/specs/2026-03-22-ad-sb-tracker-design.md`

**Reference implementation:** `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html` and `Aviation_Tools/QC_Aviation_Complaints_Server.mjs`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `Aviation_Tools/QC_AD_SB_types.json` | Create | Manufacturer/family mapping with aliases (Task 1) |
| `Aviation_Tools/QC_AD_SB_sources.json` | Create | Agency endpoint configuration (Task 1) |
| `Aviation_Tools/QC_AD_SB_data.json` | Create | Seed data file with metadata + directives array (Task 2) |
| `Aviation_Tools/QC_AD_SB_Server.mjs` | Create | Backend: HTTP server, API endpoints, fetchers, classification (Tasks 2–6) |
| `Aviation_Tools/QC_AD_SB_Dashboard.html` | Create | Frontend: full dashboard HTML/CSS/JS (Tasks 7–11) |

---

### Task 1: Create Configuration Files

**Files:**
- Create: `Aviation_Tools/QC_AD_SB_types.json`
- Create: `Aviation_Tools/QC_AD_SB_sources.json`

These are pure data files that define the manufacturer/family mapping and agency endpoints. They are consumed by the server and referenced by the spec sections 3.7 and 3.8.

- [ ] **Step 1: Create the types config file**

Create `Aviation_Tools/QC_AD_SB_types.json` with all 10 manufacturers, their aliases, exclude-aliases, and aircraft families. Follow the schema in spec section 3.8. The full list of families per manufacturer is in spec section 3.3.

```json
{
  "airbus": {
    "label": "Airbus",
    "colour": "#2196f3",
    "aliases": ["AIRBUS S.A.S.", "AIRBUS OPERATIONS", "AIRBUS DEFENCE AND SPACE"],
    "excludeAliases": ["AIRBUS HELICOPTERS"],
    "families": ["A220", "A300", "A310", "A318", "A319", "A320", "A321", "A330", "A340", "A350", "A380"]
  },
  "boeing": {
    "label": "Boeing",
    "colour": "#ff9800",
    "aliases": ["THE BOEING COMPANY", "BOEING COMMERCIAL AIRPLANES"],
    "excludeAliases": [],
    "families": ["707", "717", "727", "737", "747", "757", "767", "777", "787"]
  },
  "atr": {
    "label": "ATR",
    "colour": "#4caf50",
    "aliases": ["ATR - GIE AVIONS DE TRANSPORT RÉGIONAL", "AVIONS DE TRANSPORT REGIONAL"],
    "excludeAliases": [],
    "families": ["ATR 42", "ATR 72"]
  },
  "embraer": {
    "label": "Embraer",
    "colour": "#9c27b0",
    "aliases": ["EMBRAER S.A.", "EMBRAER - EMPRESA BRASILEIRA DE AERONÁUTICA"],
    "excludeAliases": [],
    "families": ["ERJ 135", "ERJ 140", "ERJ 145", "E170", "E175", "E190", "E195", "E2"]
  },
  "gulfstream": {
    "label": "Gulfstream",
    "colour": "#00bcd4",
    "aliases": ["GULFSTREAM AEROSPACE CORPORATION", "GULFSTREAM AEROSPACE"],
    "excludeAliases": [],
    "families": ["G280", "G500", "G550", "G600", "G650", "G700"]
  },
  "bombardier": {
    "label": "Bombardier",
    "colour": "#e91e63",
    "aliases": ["BOMBARDIER INC.", "BOMBARDIER AEROSPACE"],
    "excludeAliases": [],
    "families": ["CRJ", "Challenger 300", "Challenger 350", "Challenger 600", "Challenger 650", "Global 5000", "Global 5500", "Global 6000", "Global 6500", "Global 7500", "Global 8000"]
  },
  "dassault": {
    "label": "Dassault Aviation",
    "colour": "#ff5722",
    "aliases": ["DASSAULT AVIATION SA", "DASSAULT AVIATION"],
    "excludeAliases": [],
    "families": ["Falcon 50", "Falcon 900", "Falcon 2000", "Falcon 7X", "Falcon 8X", "Falcon 6X", "Falcon 10X"]
  },
  "textron": {
    "label": "Textron Aviation",
    "colour": "#795548",
    "aliases": ["TEXTRON AVIATION INC.", "TEXTRON AVIATION", "CESSNA AIRCRAFT COMPANY", "BEECHCRAFT CORPORATION", "HAWKER BEECHCRAFT"],
    "excludeAliases": [],
    "families": ["Citation", "King Air", "Baron", "Bonanza", "Caravan", "Cessna 172", "Cessna 182", "Cessna 206", "Cessna 208"]
  },
  "pilatus": {
    "label": "Pilatus Aircraft",
    "colour": "#607d8b",
    "aliases": ["PILATUS AIRCRAFT LTD"],
    "excludeAliases": [],
    "families": ["PC-6", "PC-7", "PC-9", "PC-12", "PC-21", "PC-24"]
  },
  "honda": {
    "label": "Honda Aircraft Company",
    "colour": "#cddc39",
    "aliases": ["HONDA AIRCRAFT COMPANY LLC", "HONDA AIRCRAFT COMPANY"],
    "excludeAliases": [],
    "families": ["HondaJet", "HondaJet Elite", "HondaJet Elite S", "HondaJet Elite II"]
  }
}
```

- [ ] **Step 2: Create the sources config file**

Create `Aviation_Tools/QC_AD_SB_sources.json` per spec section 3.7.

- [ ] **Step 3: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_types.json Aviation_Tools/QC_AD_SB_sources.json
git commit -m "feat(ad-sb): add configuration files for types and sources"
```

---

### Task 2: Create Server Skeleton with Static File Serving and Seed Data

**Files:**
- Create: `Aviation_Tools/QC_AD_SB_Server.mjs`
- Create: `Aviation_Tools/QC_AD_SB_data.json`

Build the server skeleton: imports, constants, helper functions (`readJSON`, `writeJSON`, `httpsGet`, `getArchive`), MIME types, static file serving, and the HTTP server listener on port 3852. Also create the seed data file with the metadata wrapper and an empty directives array.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs` lines 1–95 for the imports/helpers pattern, lines 1890–1910 for the HTTP server creation and static file serving, and lines 2343–2348 for the listen call.

- [ ] **Step 1: Create the seed data file**

Create `Aviation_Tools/QC_AD_SB_data.json` with the metadata wrapper and empty directives array per spec section 3.6:

```json
{
  "metadata": {
    "title": "AD/SB Intelligence Tracker",
    "lastUpdate": null,
    "totalRecords": 0,
    "sources": "easa, faa, casa"
  },
  "directives": []
}
```

- [ ] **Step 2: Create the server file with skeleton**

Create `Aviation_Tools/QC_AD_SB_Server.mjs` with:

1. **Imports:** `http`, `https`, `fs`, `path`, `url` (all built-in)
2. **Constants:** `PORT = 3852`, file paths for `DATA_FILE`, `SOURCES_FILE`, `TYPES_FILE`
3. **MIME map** — identical to Complaints server
4. **`httpsGet(url, timeout)`** — HTTPS GET with redirect following (copy pattern from Complaints server lines 52–71)
5. **`readJSON(filePath)`** / **`writeJSON(filePath, data)`** — JSON file I/O (copy pattern from lines 96–112)
6. **`getArchive()`** — read and cache the data file in memory (copy pattern from lines 115–130)
7. **`loadTypes()`** — read and cache `QC_AD_SB_types.json`
8. **`loadSources()`** — read and cache `QC_AD_SB_sources.json`
9. **SSE client tracking** — `const sseClients = new Set()`
10. **`serveFile(filePath, res)`** — static file serving helper
11. **HTTP server** — `http.createServer` with CORS preflight and route to `GET /` serving `QC_AD_SB_Dashboard.html`
12. **`server.listen(PORT)`** — startup message

- [ ] **Step 3: Verify the server starts**

Run: `node Aviation_Tools/QC_AD_SB_Server.mjs`
Expected: Console output `AD/SB Intelligence Tracker running on http://localhost:3852`

- [ ] **Step 4: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Server.mjs Aviation_Tools/QC_AD_SB_data.json
git commit -m "feat(ad-sb): add server skeleton with static file serving and seed data"
```

---

### Task 3: Implement `/api/directives` Endpoint (Filtered, Paginated)

**Files:**
- Modify: `Aviation_Tools/QC_AD_SB_Server.mjs`

Add the `GET /api/directives` endpoint that reads the archive, applies all filters (type, agency, manufacturer, family, urgency, dateFrom, dateTo, search), sorts by publishDate descending, and returns paginated results.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs` lines 1912–1998 for the `/api/complaints` endpoint pattern — the filter/sort/paginate logic is nearly identical, just with different filter fields.

- [ ] **Step 1: Add the filter and paginate helper**

Add a function `filterDirectives(directives, params)` that takes the full directives array and a params object, and returns the filtered + sorted array. This function will be reused by both `/api/directives` and `/api/summary`.

Filter logic (all filters are optional; only apply when the parameter is present):
- `type`: split by comma, filter where `d.type` is in the list (case-insensitive)
- `agency`: split by comma, filter where `d.agency` is in the list
- `manufacturer`: split by comma, filter where `d.manufacturer` is in the list
- `family`: split by comma, filter where `d.family` is in the list (case-insensitive)
- `urgency`: split by comma, filter where `d.urgency` is in the list
- `dateFrom`: filter where `d.publishDate >= dateFrom`
- `dateTo`: filter where `d.publishDate <= dateTo`
- `search`: lowercase search across `d.number + d.subject + d.summary`

Sort: by `publishDate` descending.

- [ ] **Step 2: Add the `/api/directives` route**

In the HTTP server handler, add a route for `GET /api/directives` that:
1. Parses query parameters from the URL
2. Calls `filterDirectives(getArchive().directives, params)`
3. Paginates with `page` and `limit` (defaults: page=1, limit=50)
4. Returns JSON: `{ total, page, limit, directives: [...] }`

- [ ] **Step 3: Test with curl**

Run: `curl "http://localhost:3852/api/directives?page=1&limit=10"`
Expected: `{"total":0,"page":1,"limit":10,"directives":[]}`

- [ ] **Step 4: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Server.mjs
git commit -m "feat(ad-sb): implement /api/directives endpoint with filtering and pagination"
```

---

### Task 4: Implement `/api/summary` Endpoint

**Files:**
- Modify: `Aviation_Tools/QC_AD_SB_Server.mjs`

Add the `GET /api/summary` endpoint that computes aggregated statistics from the filtered directive set.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs` lines 2001–2170 for the `/api/summary` pattern — category breakdown, trend data, manufacturer counts.

- [ ] **Step 1: Add the `/api/summary` route**

In the HTTP server handler, add a route for `GET /api/summary` that:

1. Parses the same filter parameters as `/api/directives`
2. Calls `filterDirectives(getArchive().directives, params)` to get the filtered set
3. Computes from the filtered set:
   - `totalADs`: count where `type === 'AD'`
   - `totalSBs`: count where `type === 'SB'`
   - `emergencyADs`: count where `urgency === 'emergency'`
   - `newADsThisMonth`: count of ADs with `publishDate` in current calendar month
   - `newEmergencyThisMonth`: count of emergency ADs with `publishDate` in current calendar month
   - `byManufacturer`: object keyed by manufacturer key, value is count — include all 10 manufacturers (zero if none)
   - `byAgency`: object keyed by agency key (`easa`, `faa`, `casa`), value is count — always include all 3 keys with zero counts even when filtered
   - `byFamily`: object keyed by family name, value is count — top 20 by count
   - `trend`: array of `{ month: "YYYY-MM", adCount, sbCount }` for the last 12 months
   - `lastUpdate`: from `getArchive().metadata.lastUpdate`

4. Returns JSON per spec section 4.3

- [ ] **Step 2: Test with curl**

Run: `curl "http://localhost:3852/api/summary"`
Expected: JSON with all zero counts and empty trend (no seed data yet)

- [ ] **Step 3: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Server.mjs
git commit -m "feat(ad-sb): implement /api/summary endpoint with aggregated statistics"
```

---

### Task 5: Implement Auto-Classification Pipeline and `/api/manual-add`

**Files:**
- Modify: `Aviation_Tools/QC_AD_SB_Server.mjs`

Add the classification pipeline that assigns manufacturer, family, variant, urgency, and referenced SBs to each fetched directive. Also add the manual-add endpoint.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs` lines 240–400 for the `categorisePost()` and `extractEntities()` functions — same keyword-matching pattern but for manufacturers/families instead of complaint categories.

- [ ] **Step 1: Add the `classifyDirective(raw)` function**

This function takes a raw directive object (with at minimum: `subject`, `applicability` or `summary` text, and `agency`) and populates:
- `manufacturer` — match against types.json aliases (case-insensitive), excluding `excludeAliases` entries. If no match, set to `"unknown"`.
- `family` — for the matched manufacturer, scan text for family names from types.json. Use word-boundary matching for short names (e.g., `\b737\b`).
- `variant` — regex for specific model numbers: patterns like `A320-214`, `737-8`, `E190-E2`, `PC-12/47E`. Store in `variant` field, or `null` if not found.
- `urgency` — check for keywords: "emergency", "Emergency AD", "EAD", "emergency airworthiness directive". Also flag as emergency if `effectiveDate` is within 30 days of `publishDate`. Default: `"standard"` for ADs, `"informational"` for SBs.
- `referencedSBs` — regex: `SB\s+[A-Z0-9][\w.-]+` to extract all SB references from text.

- [ ] **Step 2: Add the `createSBsFromReferences(directive)` function**

For each SB number found in `referencedSBs`, create a new SB record:
```javascript
{
  id: `ref_sb_${hashString(sbNumber)}`,
  type: 'SB',
  agency: directive.agency,
  number: sbNumber,
  manufacturer: directive.manufacturer,
  family: directive.family,
  variant: null,
  subject: `Referenced in ${directive.number}: ${directive.subject}`,
  summary: `Service Bulletin referenced by ${directive.agency.toUpperCase()} AD ${directive.number}`,
  applicability: directive.applicability || '',
  compliance: null,
  effectiveDate: null,
  publishDate: directive.publishDate,
  urgency: 'informational',
  referencedSBs: [],
  sourceUrl: directive.sourceUrl,
  fetchDate: directive.fetchDate
}
```

Only create if the SB doesn't already exist in the archive (deduplicate by `number`).

- [ ] **Step 3: Add the `hashString(str)` helper**

Simple string hash for generating unique IDs:
```javascript
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}
```

- [ ] **Step 4: Add the `/api/manual-add` route**

POST endpoint that accepts JSON body `{ number, manufacturer, family, subject, summary, sourceUrl }` and:
1. Creates an SB record with `type: 'SB'`, `agency: 'manual'`, `urgency: 'informational'`
2. Generates ID: `manual_sb_${hashString(number)}`
3. Deduplicates by ID
4. Appends to archive, updates metadata, writes to disk
5. Invalidates the archive cache
6. Returns `{ success: true, id: ... }`

- [ ] **Step 5: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Server.mjs
git commit -m "feat(ad-sb): add classification pipeline and manual-add endpoint"
```

---

### Task 6: Implement Agency Fetchers and Update Flow

**Files:**
- Modify: `Aviation_Tools/QC_AD_SB_Server.mjs`

Add the three agency fetchers (EASA, FAA, CASA), the update orchestrator with SSE progress streaming, and the `/api/update` + `/api/update-status` endpoints.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs` — `fetchRSS()` (line 404), `fetchFAANews()` (line 1047), `fetchCASANews()` (line 1110) for HTML scraping patterns. Lines 1485–1888 for the `runUpdate()` orchestrator and SSE endpoints.

- [ ] **Step 1: Add the SSE infrastructure**

Add the `GET /api/update-status` route that:
1. Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
2. Adds the response to `sseClients` set
3. Removes on close

Add helper: `function broadcastSSE(data)` that sends `data: ${JSON.stringify(data)}\n\n` to all clients.

- [ ] **Step 2: Add the EASA fetcher**

`async function fetchEASA(sourceConfig)`:
1. Fetch the EASA Safety Publications Tool search page at `${sourceConfig.baseUrl}${sourceConfig.searchPath}`
2. Parse HTML to extract AD listing rows — each row contains: AD number, type certificate holder, subject, publication date, effective date, and link to detail page
3. For each of the 10 manufacturers, search using their name/aliases
4. Parse individual AD detail pages for summary text (first paragraph of the AD body)
5. Rate limit: `sourceConfig.rateLimitMs` between requests
6. Timeout: 30 seconds per request
7. Return array of raw directive objects: `{ number, subject, summary, applicability, publishDate, effectiveDate, sourceUrl }`
8. On error: log and return empty array (resilient — don't block other fetchers)

**Important:** The EASA website structure may change. Use broad regex patterns and log warnings when expected patterns don't match. The fetcher should degrade gracefully.

- [ ] **Step 3: Add the FAA DRS fetcher**

`async function fetchFAA(sourceConfig)`:
1. Fetch the FAA DRS standard AD page at `${sourceConfig.baseUrl}${sourceConfig.searchPath}`
2. Also fetch emergency ADs at `${sourceConfig.baseUrl}${sourceConfig.emergencyPath}`
3. Parse HTML tables for: AD number, product, subject, effective date, PDF link
4. Rate limit: `sourceConfig.rateLimitMs` between requests
5. Return array of raw directive objects
6. Mark emergency ADs with a flag so `classifyDirective` can detect them

- [ ] **Step 4: Add the CASA fetcher**

`async function fetchCASA(sourceConfig)`:

**Primary approach — CASA data files:**
1. Fetch the CASA AD data files index page at `${sourceConfig.baseUrl}${sourceConfig.dataFilesPath}`
2. Parse the page to find download links for AD data files (typically CSV or Excel format)
3. Download the data file and parse rows for: AD number, applicability (maps to manufacturer/type), subject, effective date
4. CSV parsing: split by comma or tab delimiter, handle quoted fields

**Fallback — HTML scraping (if data files unavailable):**
1. Fetch the search page at `https://services.casa.gov.au/airworth/airwd/`
2. Parse the HTML form to understand search parameters
3. For each of the 10 manufacturers, submit a search query
4. Parse result HTML tables for: AD number, applicability, subject, effective date
5. Follow pagination links if results span multiple pages
6. Use regex patterns similar to the existing `fetchCASANews()` in the Complaints server (line 1110)

**Common:**
- Rate limit: `sourceConfig.rateLimitMs` between requests
- Timeout: 30 seconds per request
- On error: log detailed error and return empty array
- Return array of raw directive objects

- [ ] **Step 5: Add the update orchestrator**

`async function runUpdate()`:
1. Load sources config
2. Load types config
3. Read existing archive
4. For each enabled source (`easa`, `faa`, `casa`):
   a. Broadcast SSE: `{ type: 'progress', agency, status: 'fetching', completed: i, total: enabledCount }`
   b. Call the fetcher function with 30-second timeout wrapper
   c. For each raw result: run `classifyDirective()`, generate ID (`${agency}_ad_${hashString(number)}`), deduplicate against existing archive
   d. Create SB records from references via `createSBsFromReferences()`
   e. Broadcast SSE: `{ type: 'progress', agency, status: 'complete', newCount }` or `{ type: 'progress', agency, status: 'error', message }`
5. Append new directives to archive
6. Update metadata: `lastUpdate`, `totalRecords`
7. Write archive to disk, invalidate cache
8. Broadcast SSE: `{ type: 'complete', totalNew, totalArchive }`

- [ ] **Step 6: Add the `/api/update` route**

POST endpoint that calls `runUpdate()` asynchronously and returns immediately with `{ status: 'started' }`.

- [ ] **Step 7: Test the update flow**

Run: `curl -X POST http://localhost:3852/api/update`
Expected: `{"status":"started"}` — then check console for fetcher logs. Some fetchers may fail due to website structure changes; this is expected. The important thing is that the orchestrator completes and writes any successful results to the data file.

- [ ] **Step 8: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Server.mjs
git commit -m "feat(ad-sb): add EASA/FAA/CASA fetchers and update orchestrator with SSE"
```

---

### Task 7: Create Dashboard HTML — Structure, CSS, and Header

**Files:**
- Create: `Aviation_Tools/QC_AD_SB_Dashboard.html`

Build the HTML shell with the full CSS (dark theme, gold accents, 60/40 layout) and the header + filter bar. This is the largest single file — it follows the same embedded CSS/JS pattern as the Complaints Dashboard.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html` lines 1–400 for the CSS and header HTML. Use the same CSS variable names and class structure, adapted for the AD/SB domain.

- [ ] **Step 1: Create the HTML file with DOCTYPE, head, and CSS**

Create `Aviation_Tools/QC_AD_SB_Dashboard.html` with:
1. `<!DOCTYPE html>`, charset, viewport meta
2. Title: `QC AD/SB Intelligence Tracker`
3. Chart.js CDN script tag: `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js`
4. Full embedded `<style>` block with:
   - CSS variables (`:root`) matching spec section 2.3 — same as Complaints Dashboard
   - Additional manufacturer colour variables from spec section 3.4
   - Agency colour variables from spec section 3.5
   - All layout classes: `header`, `filter-bar`, `kpi-row`, `kpi-card`, `main-body`, `charts-column`, `feed-column`, `chart-card`, `chart-canvas-wrap`, `feed-header`, `feed-list`, `feed-item`, `feed-item.expanded .feed-body`, `category-tag`, `modal-overlay`, `modal-content`, `btn-primary`, `btn-secondary`, `filter-dropdown`, `filter-menu`, `filter-btn`, `filter-count`, `empty-state`
   - Urgency styling: `.urgency-emergency` (red), `.urgency-standard`, `.urgency-informational`

- [ ] **Step 2: Add the header HTML**

After the `<style>` block, add the `<body>` with:
1. `<header>` — sticky, gradient background, gold border-bottom
   - Left: QC logo placeholder (same `<img>` pattern as Complaints), title "AD/SB Intelligence Tracker", version "v1.0"
   - Right: "Last update:" timestamp span (`id="lastUpdateTime"`), UPDATE button (`id="btnUpdate"`), Export Charts button (`id="btnExportCharts"`)

- [ ] **Step 3: Add the filter bar HTML**

Below the header:
1. Filter group with 5 dropdown buttons:
   - **Type** dropdown: checkboxes for AD, SB (`data-filter="type"`)
   - **Agency** dropdown: checkboxes for EASA, FAA, CASA (`data-filter="agency"`)
   - **Manufacturer** dropdown: checkboxes for all 10 manufacturers (`data-filter="manufacturer"`)
   - **Family** dropdown: dynamically populated (`data-filter="family"`, `id="familyFilterMenu"`)
   - **Urgency** dropdown: checkboxes for Emergency, Standard, Informational (`data-filter="urgency"`)
2. Date range: From (`id="dateFrom"`) and To (`id="dateTo"`) date inputs

- [ ] **Step 4: Add the KPI row HTML**

4 KPI cards per spec section 6.2:
1. Total ADs — blue left border, `id="kpiTotalADs"`, subtitle `id="kpiNewADs"`
2. Total SBs — orange left border, `id="kpiTotalSBs"`, subtitle "Referenced + Manual"
3. Emergency ADs — red left border, `id="kpiEmergencyADs"`, subtitle `id="kpiNewEmergency"`
4. Manufacturers — gold left border, value "10", subtitle "Tracked"

- [ ] **Step 5: Add the main body structure (60/40 split)**

```html
<div class="main-body">
  <div class="charts-column">
    <!-- Chart 1: Trend -->
    <div class="chart-card">
      <div class="chart-header">
        <h3>AD Issuance Trend</h3>
        <div class="chart-toggles">
          <button class="toggle active" data-months="6">6M</button>
          <button class="toggle" data-months="12">1Y</button>
          <button class="toggle" data-months="0">ALL</button>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="trendChart"></canvas></div>
    </div>
    <!-- Chart 2: Manufacturer -->
    <div class="chart-card">
      <h3>ADs by Manufacturer</h3>
      <div class="chart-canvas-wrap" style="height:260px"><canvas id="manufacturerChart"></canvas></div>
    </div>
    <!-- Charts 3+4: Agency + Family side by side -->
    <div style="display:flex;gap:16px;">
      <div class="chart-card" style="flex:1">
        <h3>ADs by Agency</h3>
        <div class="chart-canvas-wrap"><canvas id="agencyChart"></canvas></div>
      </div>
      <div class="chart-card" style="flex:1">
        <h3>ADs by Aircraft Family</h3>
        <div class="chart-canvas-wrap"><canvas id="familyChart"></canvas></div>
      </div>
    </div>
  </div>

  <div class="feed-column">
    <div class="feed-header">
      <h3>AD/SB Feed <span id="feedCount" style="color:var(--text-secondary);font-size:11px"></span></h3>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="feedSearch" placeholder="Search directives...">
        <button id="btnAddSB" class="btn-secondary">+ Add SB</button>
      </div>
    </div>
    <div id="feedList" class="feed-list"></div>
    <button id="btnLoadMore" class="btn-secondary" style="width:100%;margin-top:8px;display:none">Load More</button>
  </div>
</div>
```

- [ ] **Step 6: Add the Manual Add SB modal HTML**

Modal overlay (`id="manualAddModal"`, `style="display:none"`) with form fields:
- SB Number (text input, required)
- Manufacturer (select dropdown, all 10 options)
- Aircraft Family (select dropdown, dynamically populated based on manufacturer)
- Subject (text input, required)
- Summary (textarea)
- Source URL (text input)
- Submit and Cancel buttons

- [ ] **Step 7: Add the update progress overlay HTML**

Progress overlay (`id="updateOverlay"`, `style="display:none"`) similar to Complaints Dashboard:
- Semi-transparent background
- Progress card with agency status rows (`id="updateProgress"`)
- Status text for each agency (Fetching... / Complete / Error)

- [ ] **Step 8: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Dashboard.html
git commit -m "feat(ad-sb): add dashboard HTML structure, CSS, header, filters, and layout"
```

---

### Task 8: Dashboard JavaScript — State, API, Filters, and Feed Rendering

**Files:**
- Modify: `Aviation_Tools/QC_AD_SB_Dashboard.html`

Add the JavaScript block with state management, API helpers, filter logic, feed rendering, and click-to-expand.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html` lines 1200–1615 for the STATE object, API helper, filter dropdown handlers, and feed rendering.

- [ ] **Step 1: Add the constants and state object**

Inside a `<script>` block at the bottom of the body:

```javascript
const MANUFACTURERS = { /* loaded from types.json or hardcoded */ };
const AGENCY_COLOURS = { easa: '#1565c0', faa: '#e65100', casa: '#2e7d32' };
const AGENCY_LABELS = { easa: 'EASA', faa: 'FAA', casa: 'CASA', manual: 'Manual', ref: 'REF' };

const STATE = {
    filters: { types: [], agencies: [], manufacturers: [], families: [], urgencies: [], dateFrom: '', dateTo: '', search: '' },
    summary: null,
    directives: [],
    page: 1,
    limit: 50,
    totalDirectives: 0,
    trendMonths: 6,
    trendChartInstance: null,
    manufacturerChartInstance: null,
    agencyChartInstance: null,
    familyChartInstance: null
};
```

Hardcode the MANUFACTURERS object with the same data as `QC_AD_SB_types.json` (label, colour, families) so the dashboard works without an extra fetch.

- [ ] **Step 2: Add API helper and query string builder**

```javascript
async function api(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

function buildQueryString() {
    const p = new URLSearchParams();
    if (STATE.filters.types.length) p.set('type', STATE.filters.types.join(','));
    if (STATE.filters.agencies.length) p.set('agency', STATE.filters.agencies.join(','));
    if (STATE.filters.manufacturers.length) p.set('manufacturer', STATE.filters.manufacturers.join(','));
    if (STATE.filters.families.length) p.set('family', STATE.filters.families.join(','));
    if (STATE.filters.urgencies.length) p.set('urgency', STATE.filters.urgencies.join(','));
    if (STATE.filters.dateFrom) p.set('dateFrom', STATE.filters.dateFrom);
    if (STATE.filters.dateTo) p.set('dateTo', STATE.filters.dateTo);
    if (STATE.filters.search) p.set('search', STATE.filters.search);
    return p.toString();
}
```

- [ ] **Step 3: Add `loadSummary()` and `loadDirectives()`**

```javascript
async function loadSummary() {
    const qs = buildQueryString();
    const extra = qs ? '?' + qs : '';
    STATE.summary = await api('/api/summary' + extra);
    renderKPIs();
    renderTrendChart();
    renderManufacturerChart();
    renderAgencyChart();
    renderFamilyChart();
    // Update last-update timestamp in header
    if (STATE.summary.lastUpdate) {
        document.getElementById('lastUpdateTime').textContent =
            'Last update: ' + formatDate(STATE.summary.lastUpdate);
    }
}

async function loadDirectives(append = false) {
    if (!append) STATE.page = 1;
    const qs = buildQueryString();
    const extra = qs ? '&' + qs : '';
    const data = await api(`/api/directives?page=${STATE.page}&limit=${STATE.limit}${extra}`);
    if (append) {
        STATE.directives.push(...data.directives);
    } else {
        STATE.directives = data.directives;
    }
    STATE.totalDirectives = data.total;
    renderFeed();
}
```

- [ ] **Step 4: Add helper functions**

- `formatDate(isoStr)` — converts ISO date to `DDMMMYYYY` format (e.g., "18MAR2026") per CLAUDE.md convention
- `timeAgo(isoStr)` — relative time string (e.g., "3 days ago")
- `truncate(str, maxLen)` — truncates with ellipsis
- `getManufacturerColour(key)` — returns colour from MANUFACTURERS object
- `getAgencyColour(key)` — returns colour from AGENCY_COLOURS
- `getBorderColour(directive)` — returns red for emergency, agency colour for standard AD, gold for SB

- [ ] **Step 5: Add `renderKPIs()`**

Updates the 4 KPI card values from `STATE.summary`:
- `kpiTotalADs` → `STATE.summary.totalADs`
- `kpiTotalSBs` → `STATE.summary.totalSBs`
- `kpiEmergencyADs` → `STATE.summary.emergencyADs`
- `kpiNewADs` → `"↑ ${STATE.summary.newADsThisMonth} new ADs this month"`
- `kpiNewEmergency` → `"↑ ${STATE.summary.newEmergencyThisMonth} new emergency this month"`

- [ ] **Step 6: Add `renderFeed()`**

Renders `STATE.directives` into `#feedList`. Each directive becomes a `.feed-item` div with:

**Collapsed content:**
```html
<div class="feed-item" data-id="${d.id}" onclick="toggleFeedItem(this)" style="border-left-color:${borderColour}">
  <div class="feed-source">
    ${AGENCY_LABELS[d.agency]} · ${d.number}
    ${d.urgency === 'emergency' ? '<span class="urgency-emergency">EMERGENCY</span>' : ''}
    <span class="feed-date">${formatDate(d.publishDate)}</span>
  </div>
  <div class="feed-title">${d.family ? d.family + ' — ' : ''}${truncate(d.subject, 100)}</div>
  <div class="feed-tags">
    <span class="category-tag" style="background:${mfrColour}20;color:${mfrColour}">${mfrLabel}</span>
    ${d.family ? `<span class="category-tag" style="...">${d.family}</span>` : ''}
    <span class="category-tag" style="...">${d.type}</span>
  </div>
  <div class="feed-body">
    <p>${d.summary || 'No summary available'}</p>
    ${d.variant ? `<div><strong>Variant:</strong> ${d.variant}</div>` : ''}
    ${d.applicability ? `<div><strong>Applicability:</strong> ${d.applicability}</div>` : ''}
    ${d.compliance ? `<div><strong>Compliance:</strong> ${d.compliance}</div>` : ''}
    ${d.referencedSBs?.length ? `<div><strong>Referenced SBs:</strong> ${d.referencedSBs.join(', ')}</div>` : ''}
    ${d.sourceUrl ? `<a href="${d.sourceUrl}" target="_blank" class="feed-link">View Source →</a>` : ''}
  </div>
</div>
```

Also update `#feedCount` with `(${STATE.totalDirectives} results)` and show/hide the Load More button.

- [ ] **Step 7: Add `toggleFeedItem(el)`**

```javascript
function toggleFeedItem(el) { el.classList.toggle('expanded'); }
```

- [ ] **Step 8: Add filter dropdown handlers**

Follow the same pattern as Complaints Dashboard lines 1522–1614:

1. `updateFiltersFromDropdowns()` — reads all checked checkboxes into `STATE.filters`
2. Click handlers on each `.filter-dropdown` button to toggle menu visibility
3. Change handlers on each checkbox that call `updateFiltersFromDropdowns()`, then `loadDirectives()` and `loadSummary()`
4. Date input change handlers
5. Feed search debounced handler (300ms)
6. Close menus on outside click

**Dynamic family filter:** When manufacturer filter changes, repopulate the Family dropdown with only the families belonging to selected manufacturers. If no manufacturers selected, show all families.

- [ ] **Step 9: Add Load More handler and initial data load**

```javascript
document.getElementById('btnLoadMore').addEventListener('click', () => {
    STATE.page++;
    loadDirectives(true);
});

// Initial load
loadSummary();
loadDirectives();
```

- [ ] **Step 10: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Dashboard.html
git commit -m "feat(ad-sb): add dashboard JS — state, API, filters, feed rendering with click-to-expand"
```

---

### Task 9: Dashboard Charts — Trend, Manufacturer, Agency, Family

**Files:**
- Modify: `Aviation_Tools/QC_AD_SB_Dashboard.html`

Add the four Chart.js chart rendering functions. Each chart should update in place if the instance already exists, or create a new chart if not.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html` lines 1864–1970 for the trend chart and category chart rendering patterns.

- [ ] **Step 1: Add `renderTrendChart()`**

Bar chart showing AD issuance by month:
- Data source: `STATE.summary.trend`
- Filter to last N months based on `STATE.trendMonths` (6, 12, or all)
- Labels: month strings formatted as "MMM YY"
- Dataset: `adCount` values, colour `#2196f3`
- Options: responsive, maintainAspectRatio false, animation 300ms, legend hidden
- X-axis: month labels. Y-axis: count, beginAtZero
- Add click handler on the trend toggle buttons (6M/1Y/ALL) to update `STATE.trendMonths` and re-render

- [ ] **Step 2: Add `renderManufacturerChart()`**

Horizontal bar chart showing AD count per manufacturer (all 10):
- Data source: `STATE.summary.byManufacturer`
- Sort entries by count descending
- Labels: manufacturer display names
- Colours: each bar uses its manufacturer colour (with `80` alpha suffix for background, full colour for border)
- Height: 260px (accommodates 10 bars)
- **Click handler:** On bar click, toggle the manufacturer filter (same pattern as the category chart click handler added earlier — set `STATE.filters.manufacturers`, sync checkboxes, reload)

- [ ] **Step 3: Add `renderAgencyChart()`**

Doughnut chart showing AD count by agency:
- Data source: `STATE.summary.byAgency`
- 3 segments: EASA, FAA, CASA with agency colours
- Centre plugin to show total AD count as text
- **Click handler:** On segment click, toggle the agency filter, sync checkboxes, reload

For the centre label, use a Chart.js plugin:
```javascript
const centreTextPlugin = {
    id: 'centreText',
    afterDraw(chart) {
        const { ctx, width, height } = chart;
        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        ctx.save();
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#e0e0e0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total.toLocaleString(), width / 2, height / 2);
        ctx.restore();
    }
};
```

- [ ] **Step 4: Add `renderFamilyChart()`**

Vertical bar chart showing top 8 aircraft families by AD count:
- Data source: `STATE.summary.byFamily` — sort by count descending, take top 8
- Bar colour: match the parent manufacturer's colour (look up which manufacturer owns each family from MANUFACTURERS object)
- **Click handler:** On bar click, toggle the family filter, sync checkboxes, reload

- [ ] **Step 5: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Dashboard.html
git commit -m "feat(ad-sb): add Chart.js charts — trend, manufacturer, agency, family with click-to-filter"
```

---

### Task 10: Dashboard — Update Flow, Manual Add Modal, and Export

**Files:**
- Modify: `Aviation_Tools/QC_AD_SB_Dashboard.html`

Add the UPDATE button SSE handler, the manual add modal logic, and the chart export function.

Reference: `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html` lines 1750–1860 for the SSE update flow, lines 1420–1480 for the manual add modal.

- [ ] **Step 1: Add the UPDATE button handler with SSE**

```javascript
document.getElementById('btnUpdate').addEventListener('click', async () => {
    const overlay = document.getElementById('updateOverlay');
    const progress = document.getElementById('updateProgress');
    overlay.style.display = 'flex';
    progress.innerHTML = '<p style="color:var(--text-secondary)">Starting update...</p>';

    const evtSource = new EventSource('/api/update-status');
    evtSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'progress') {
            // Update the progress display per agency
            updateProgressUI(data, progress);
        }
        if (data.type === 'complete') {
            evtSource.close();
            progress.innerHTML += `<p style="color:var(--status-green)">Complete: ${data.totalNew} new directives</p>`;
            setTimeout(() => {
                overlay.style.display = 'none';
                loadSummary();
                loadDirectives();
            }, 1500);
        }
    };
    evtSource.onerror = () => {
        evtSource.close();
        progress.innerHTML += '<p style="color:var(--status-red)">Connection lost</p>';
        setTimeout(() => { overlay.style.display = 'none'; }, 2000);
    };

    await fetch('/api/update', { method: 'POST' });
});
```

Add `updateProgressUI(data, container)` helper that creates/updates a row per agency showing status (Fetching.../Complete/Error).

Track which agencies failed in a `failedAgencies` array. When the update completes and the overlay closes, if any agencies failed, render a persistent warning banner at the top of the feed column:

```html
<div class="warning-banner" style="background:#2a1a1a;border:1px solid #f44336;border-radius:4px;padding:8px 12px;margin-bottom:8px;font-size:11px;color:#f44336">
  ⚠ FAA update failed — showing cached data
  <button onclick="this.parentElement.remove()" style="float:right;background:none;border:none;color:#f44336;cursor:pointer">✕</button>
</div>
```

- [ ] **Step 2: Add the manual add modal handlers**

1. Open modal on `#btnAddSB` click
2. Close on Cancel button or overlay click
3. Populate manufacturer select from MANUFACTURERS object
4. On manufacturer select change, populate family select with that manufacturer's families
5. On Submit: POST to `/api/manual-add` with form data as JSON, close modal, reload feed

- [ ] **Step 3: Add the Export Charts handler**

Export all charts as a single ZIP file. Use a minimal client-side ZIP builder (no external library — build the ZIP binary manually using the PKZip format, same approach as other QC tools):

```javascript
document.getElementById('btnExportCharts').addEventListener('click', async () => {
    const charts = [
        { instance: STATE.trendChartInstance, name: 'ad_issuance_trend.png' },
        { instance: STATE.manufacturerChartInstance, name: 'ads_by_manufacturer.png' },
        { instance: STATE.agencyChartInstance, name: 'ads_by_agency.png' },
        { instance: STATE.familyChartInstance, name: 'ads_by_family.png' }
    ];
    const files = [];
    for (const { instance, name } of charts) {
        if (!instance) continue;
        const dataUrl = instance.toBase64Image('image/png');
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        files.push({ name, data: bytes });
    }
    const zipBlob = buildZip(files); // See buildZip() helper below
    const link = document.createElement('a');
    link.download = 'ad_sb_charts.zip';
    link.href = URL.createObjectURL(zipBlob);
    link.click();
    URL.revokeObjectURL(link.href);
});
```

Add a `buildZip(files)` function that constructs a valid PKZip binary from an array of `{name, data}` objects. This is a minimal ZIP builder (~60 lines) using stored (no compression) entries — sufficient for PNG files which are already compressed. Pattern: write local file headers, then central directory, then end-of-central-directory record.

- [ ] **Step 4: Commit**

```bash
git add Aviation_Tools/QC_AD_SB_Dashboard.html
git commit -m "feat(ad-sb): add update flow with SSE, manual add modal, and chart export"
```

---

### Task 11: Seed Data Population and End-to-End Verification

**Files:**
- Modify: `Aviation_Tools/QC_AD_SB_data.json`
- Modify: `Aviation_Tools/QC_AD_SB_Server.mjs` (if any bugs found)
- Modify: `Aviation_Tools/QC_AD_SB_Dashboard.html` (if any bugs found)

Populate the seed data file with realistic sample directives so the dashboard works immediately, then verify all features end-to-end.

- [ ] **Step 1: Run the server and trigger an update to fetch real data**

```bash
node Aviation_Tools/QC_AD_SB_Server.mjs
```

Then in another terminal:
```bash
curl -X POST http://localhost:3852/api/update
```

Wait for the update to complete. Check the console output for fetcher results.

- [ ] **Step 2: If live fetchers return data, verify it**

Check `Aviation_Tools/QC_AD_SB_data.json` has populated with real directives. Verify:
- Directives have correct `manufacturer`, `family`, `agency` fields
- `summary` and `sourceUrl` are populated
- Emergency ADs are correctly flagged
- Referenced SBs are extracted

- [ ] **Step 3: If live fetchers fail (expected — websites may block or change), create manual seed data**

Create a representative seed dataset with ~50 directives covering:
- At least 2 ADs per manufacturer (all 10 represented)
- All 3 agencies represented (EASA, FAA, CASA)
- At least 3 emergency ADs
- At least 5 SBs (referenced from ADs)
- Varied aircraft families
- Realistic AD numbers, subjects, summaries, dates, and source URLs (use real AD numbers from known public sources)

Write this to `QC_AD_SB_data.json` with correct metadata.

- [ ] **Step 4: Verify dashboard loads with seed data**

Open `http://localhost:3852` in browser. Verify:
1. KPI cards show correct counts
2. All 4 charts render with data
3. All 10 manufacturers appear in the manufacturer chart
4. Feed shows directives sorted by date descending
5. Click a directive → expands to show summary, applicability, compliance, referenced SBs, source link
6. Source link opens correct URL in new tab

- [ ] **Step 5: Verify filters work**

Test each filter:
1. Click a manufacturer bar → feed filters to that manufacturer
2. Click the agency doughnut → feed filters to that agency
3. Click a family bar → feed filters to that family
4. Use the Type dropdown → filter to AD only or SB only
5. Use the date range → filter by date
6. Use the search box → filter by keyword
7. Combine filters → verify they stack correctly
8. Clear all filters → verify full list returns

- [ ] **Step 6: Verify manual add**

1. Click "+ Add SB"
2. Fill in form with test data
3. Submit
4. Verify new SB appears in feed

- [ ] **Step 7: Fix any bugs found during verification**

Address any issues discovered during end-to-end testing.

- [ ] **Step 8: Commit final state**

```bash
git add Aviation_Tools/QC_AD_SB_data.json Aviation_Tools/QC_AD_SB_Server.mjs Aviation_Tools/QC_AD_SB_Dashboard.html
git commit -m "feat(ad-sb): add seed data and verify end-to-end functionality"
```

---

## Task Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Configuration files (types.json, sources.json) | None |
| 2 | Server skeleton with static file serving | Task 1 |
| 3 | `/api/directives` and `/api/summary` endpoints | Task 2 |
| 4 | Classification pipeline and `/api/manual-add` | Task 2 |
| 5 | EASA fetcher, SSE infrastructure, update orchestrator | Tasks 3, 4 |
| 6 | FAA and CASA fetchers | Task 5 |
| 7 | Dashboard HTML structure, CSS, layout | Task 2 |
| 8 | Dashboard JS — state, API, filters, feed | Task 7 |
| 9 | Dashboard charts | Task 8 |
| 10 | Update flow, manual add modal, export | Task 9 |
| 11 | Seed data and E2E verification | Tasks 6, 10 |

**Parallelism:** After Task 2, two tracks can run in parallel — server (Tasks 3–6) and frontend (Tasks 7–10). Tasks 3 and 4 can also run in parallel since they share no dependencies. Task 11 requires both tracks complete.
