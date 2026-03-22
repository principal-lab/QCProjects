# QC Lead Analyser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lead discovery and management dashboard that scans aviation news feeds, grades leads against QC Aviation's 10 service lines, and provides a Keep/Archive workflow with contact enrichment.

**Architecture:** Single HTML file + Node.js ESM server (port 3849) + three JSON data files. Server handles RSS feed fetching, rule-based lead scoring, optional Claude API deep assessment, and CRUD operations for lead lifecycle. Frontend uses the QC dark navy/gold theme with tab-based navigation (Discover/Keep/Archive).

**Tech Stack:** Node.js ESM (http/https/fs/path — no npm dependencies), single-file HTML with inline CSS/JS, JSON file persistence, SSE for progress reporting.

**Spec:** `docs/superpowers/specs/2026-03-23-lead-analyser-design.md`

**Reference files:**
- Theme/CSS: `Aviation_Tools/QC_AD_SB_Dashboard.html` (lines 1-150 for CSS variables, header, buttons)
- Server pattern: `Aviation_Tools/QC_AD_SB_Server.mjs` (SSE, routing, body parsing, static file serving)
- RSS parsing: `Aviation_Tools/QC_New_Airlines_Dashboard_server.mjs` (RSS/Atom parser, region map, keyword filtering)
- Logo: `Branding_Assets/QC_Logo_Small_241206.png`

---

## File Structure

| File | Purpose |
|------|---------|
| `Aviation_Tools/QC_Lead_Analyser_Server.mjs` | Node.js ESM server — feeds, scoring, CRUD, SSE, AI assess |
| `Aviation_Tools/QC_Lead_Analyser.html` | Frontend — single HTML with inline CSS/JS |
| `Aviation_Tools/QC_Lead_Analyser_data.json` | Discovered leads store |
| `Aviation_Tools/QC_Lead_Analyser_keep.json` | Kept leads store |
| `Aviation_Tools/QC_Lead_Analyser_archive.json` | Archived leads store |

---

### Task 1: Server Skeleton — Static File Serving, SSE, JSON Helpers

**Files:**
- Create: `Aviation_Tools/QC_Lead_Analyser_Server.mjs`
- Create: `Aviation_Tools/QC_Lead_Analyser_data.json`
- Create: `Aviation_Tools/QC_Lead_Analyser_keep.json`
- Create: `Aviation_Tools/QC_Lead_Analyser_archive.json`

- [ ] **Step 1: Create the three empty JSON data files**

`QC_Lead_Analyser_data.json`:
```json
{
  "leads": [],
  "lastScanDate": null,
  "scanStats": { "totalScanned": 0, "matchedLeads": 0 }
}
```

`QC_Lead_Analyser_keep.json`:
```json
{
  "leads": []
}
```

`QC_Lead_Analyser_archive.json`:
```json
{
  "leads": []
}
```

- [ ] **Step 2: Create server skeleton with imports, constants, MIME map, JSON helpers, hashString, SSE tracking, and static file serving**

Reference: `QC_AD_SB_Server.mjs` lines 1-131 for the exact patterns (imports, `__filename`/`__dirname`, MIME map, `readJSON`, `writeJSON`, `serveFile`, SSE client set).

The server must include:
- `import http, https, fs, path, { fileURLToPath }` (ESM pattern)
- `PORT = 3849`
- Three data file path constants: `DATA_FILE`, `KEEP_FILE`, `ARCHIVE_FILE`
- `MIME` map (same as AD/SB server)
- `sseClients` Set for SSE tracking
- `httpsGet(url, timeout)` — HTTPS GET with redirect following (copy from AD/SB server lines 46-65)
- `readJSON(filePath)` / `writeJSON(filePath, data)` helpers
- `hashString(str)` — deterministic ID hash (copy from AD/SB server lines 134-142)
- `broadcastSSE(data)` — push JSON to all SSE clients
- `serveFile(filePath, res)` — serve static files with MIME types
- In-memory caches: `discoverCache`, `keepCache`, `archiveCache` with getter functions that lazy-load from disk

- [ ] **Step 3: Add HTTP server with CORS preflight, root route, branding route, static file route, SSE route, and 404 default**

Reference: `QC_AD_SB_Server.mjs` lines 748-999 for the routing pattern.

Routes to implement in this step:
- `OPTIONS *` → CORS 204 with `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS` (note: AD/SB server only allows GET/POST — this app also needs PUT and DELETE for keep updates and archive deletion)
- `GET /` → serve `QC_Lead_Analyser.html`
- `GET /Branding_Assets/*` → serve from parent directory `../Branding_Assets/`
- `GET /events` → SSE stream (same pattern as AD/SB server line 968-978: set headers, write connected event, add to set, remove on close)
- `GET *` → try static file from `__dirname`, guard against traversal
- Default → 404

Server listen on port 3849, print startup banner.

- [ ] **Step 4: Add body-parsing helper for POST/PUT/DELETE routes**

```javascript
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { resolve({}); }
        });
        req.on('error', reject);
    });
}
```

- [ ] **Step 5: Add GET API routes for all three data stores**

Routes:
- `GET /api/discover` → return `readJSON(DATA_FILE)` (entire discover store)
- `GET /api/keep` → return `readJSON(KEEP_FILE)` (entire keep store)
- `GET /api/archive` → return `readJSON(ARCHIVE_FILE)` (entire archive store)
- `GET /api/config` → return `{ aiEnabled: !!process.env.ANTHROPIC_API_KEY }` (exposes AI availability to frontend)

Each returns JSON with `Access-Control-Allow-Origin: *` header.

- [ ] **Step 6: Test the server starts and serves a placeholder HTML**

Create a minimal `QC_Lead_Analyser.html` with just `<h1>QC Lead Analyser</h1>` for now.

Run: `node Aviation_Tools/QC_Lead_Analyser_Server.mjs`
Expected: Server prints banner, `http://localhost:3849` serves the placeholder HTML.
Test: `curl http://localhost:3849/api/discover` returns the empty data JSON.

- [ ] **Step 7: Commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser_Server.mjs Aviation_Tools/QC_Lead_Analyser_data.json Aviation_Tools/QC_Lead_Analyser_keep.json Aviation_Tools/QC_Lead_Analyser_archive.json Aviation_Tools/QC_Lead_Analyser.html
git commit -m "feat(lead-analyser): add server skeleton with static serving, SSE, and data API"
```

---

### Task 2: RSS Feed Parser, Region Map, and Service Line Keywords

**Files:**
- Modify: `Aviation_Tools/QC_Lead_Analyser_Server.mjs`

- [ ] **Step 1: Add RSS feed source list**

Reference: `QC_New_Airlines_Dashboard_server.mjs` lines 44-53 for the feed array pattern.

```javascript
const RSS_FEEDS = [
    { name: 'AeroTime', url: 'https://www.aerotime.aero/rss' },
    { name: 'Aviation Week', url: 'https://aviationweek.com/rss/air-transport' },
    { name: 'FlightGlobal', url: 'https://www.flightglobal.com/rss' },
    { name: 'ch-aviation', url: 'https://www.ch-aviation.com/portal/news/rss' },
    { name: 'Simple Flying', url: 'https://simpleflying.com/feed/' },
    { name: 'Aviation Business ME', url: 'https://www.aviationbusinessme.com/feed/' },
    { name: 'Australian Aviation', url: 'https://australianaviation.com.au/feed/' },
    { name: 'Airways Magazine', url: 'https://www.airwaysmag.com/feed/' },
    { name: 'CASA Media', url: 'https://www.casa.gov.au/news-and-media/rss.xml' },
    { name: 'EASA News', url: 'https://www.easa.europa.eu/en/newsroom/rss' },
];

const TENDER_URL = 'https://www.tendersontime.com/searchrfp/global-aviation-consultancy-rfp-733/';
```

- [ ] **Step 2: Add RSS/Atom XML parser functions**

Copy directly from `QC_New_Airlines_Dashboard_server.mjs` lines 163-209:
- `parseRSSItems(xml)` — extracts `<item>` (RSS 2.0) or `<entry>` (Atom) elements
- `extractTag(xml, tag)` — regex tag content extraction
- `extractAttr(xml, tag, attr)` — regex attribute extraction
- `stripCDATA(text)` — strip CDATA and HTML tags

- [ ] **Step 3: Add the seven-region keyword map**

Reference: `QC_New_Airlines_Dashboard_server.mjs` lines 69-129 for the pattern, but expand to seven regions per spec Section 10.

```javascript
const REGION_MAP = {
    australia: ['australia', 'australian', 'sydney', 'melbourne', 'brisbane', 'perth',
        'adelaide', 'darwin', 'hobart', 'canberra', 'casa', 'qantas',
        'gold coast', 'cairns', 'virgin australia', 'jetstar', 'rex airlines', 'bonza'],
    oceania: ['new zealand', 'auckland', 'wellington', 'christchurch', 'fiji', 'suva', 'nadi',
        'papua new guinea', 'port moresby', 'vanuatu', 'samoa', 'tonga',
        'french polynesia', 'tahiti', 'new caledonia', 'solomon islands',
        'micronesia', 'guam', 'palau', 'cook islands', 'kiribati', 'air niugini'],
    se_asia: ['thailand', 'thai', 'bangkok', 'suvarnabhumi', 'don mueang', 'caat',
        'vietnam', 'vietnamese', 'hanoi', 'ho chi minh',
        'indonesia', 'indonesian', 'jakarta', 'garuda', 'lion air',
        'philippines', 'filipino', 'manila', 'cebu',
        'malaysia', 'malaysian', 'kuala lumpur', 'caam',
        'singapore', 'singaporean', 'changi', 'caas',
        'cambodia', 'phnom penh', 'myanmar', 'yangon', 'laos', 'vientiane', 'brunei'],
    east_asia: ['china', 'chinese', 'beijing', 'shanghai', 'guangzhou', 'shenzhen', 'caac',
        'japan', 'japanese', 'tokyo', 'osaka', 'narita', 'haneda',
        'south korea', 'korean', 'seoul', 'incheon',
        'taiwan', 'taipei', 'taoyuan',
        'hong kong', 'cathay', 'macau',
        'mongolia', 'ulaanbaatar'],
    central_asia: ['kazakhstan', 'kazakh', 'astana', 'almaty', 'air astana',
        'uzbekistan', 'uzbek', 'tashkent', 'uzbekistan airways',
        'turkmenistan', 'ashgabat', 'turkmenistan airlines',
        'tajikistan', 'dushanbe', 'somon air',
        'kyrgyzstan', 'bishkek', 'ala archa'],
    middle_east: ['saudi arabia', 'saudi', 'riyadh', 'jeddah', 'neom', 'gaca', 'saudia',
        'uae', 'emirates', 'dubai', 'abu dhabi', 'etihad', 'flydubai',
        'qatar', 'doha', 'qatar airways',
        'bahrain', 'gulf air', 'oman', 'muscat', 'salalah', 'oman air',
        'kuwait', 'jordan', 'amman', 'royal jordanian',
        'iraq', 'baghdad', 'iraqi airways',
        'israel', 'tel aviv', 'el al', 'iran', 'tehran', 'mahan air',
        'lebanon', 'beirut', 'middle east airlines'],
    europe: ['europe', 'european', 'easa',
        'united kingdom', 'uk ', 'british', 'london', 'heathrow', 'gatwick',
        'germany', 'german', 'lufthansa', 'frankfurt', 'munich', 'berlin',
        'france', 'french', 'paris', 'air france',
        'spain', 'spanish', 'madrid', 'barcelona', 'iberia',
        'italy', 'italian', 'rome', 'milan', 'ita airways',
        'netherlands', 'dutch', 'amsterdam', 'klm',
        'poland', 'warsaw', 'lot polish',
        'norway', 'norwegian', 'oslo', 'sweden', 'stockholm', 'sas',
        'denmark', 'copenhagen', 'finland', 'helsinki', 'finnair',
        'ireland', 'dublin', 'ryanair', 'aer lingus',
        'portugal', 'lisbon', 'tap', 'greece', 'athens', 'aegean',
        'switzerland', 'swiss', 'zurich', 'austria', 'vienna',
        'iceland', 'reykjavik', 'malta', 'romania', 'bucharest',
        'hungary', 'budapest', 'wizz air', 'croatia', 'czech', 'prague',
        'bulgaria', 'sofia', 'estonia', 'tallinn'],
};
```

- [ ] **Step 4: Add service line keyword map and relevance checker**

Per spec Section 6 keyword table:

```javascript
const SERVICE_KEYWORDS = {
    'Airline Startup': ['new airline', 'startup airline', 'airline launch', 'aoc granted',
        'air operator certificate', 'inaugural flight', 'commences operations',
        'begins operations', 'maiden flight', 'new carrier', 'airline approved',
        'aoc application', 'aoc received'],
    'Aircraft Entry Into Service': ['new aircraft', 'fleet renewal', 'aircraft delivery',
        'entry into service', 'first delivery', 'aircraft order', 'new fleet',
        'aircraft induction'],
    'Sourcing Aircraft': ['aircraft acquisition', 'aircraft purchase', 'business jet order',
        'fleet expansion', 'aircraft lease', 'aircraft deal', 'jet order',
        'aircraft procurement'],
    'Flight Training': ['flight training', 'pilot training', 'cadet programme',
        'flight school', 'type rating', 'training centre', 'training center',
        'pilot academy', 'training contract'],
    'Ops Management': ['flight operations', 'operations management', 'operational efficiency',
        'coo appointed', 'ops director', 'operations director',
        'flight operations manager'],
    'Simulators': ['simulator', 'flight simulation', 'full flight simulator', 'ffs',
        'fstd', 'simulator acquisition', 'sim centre', 'sim center',
        'simulator contract', 'training device'],
    'Route Analysis': ['new route', 'route launch', 'route expansion', 'network expansion',
        'new destination', 'route application', 'route announcement',
        'new service', 'new flights'],
    'Ops Technology': ['flight ops technology', 'efb', 'electronic flight bag',
        'ops system', 'flight planning system', 'crew management system',
        'operations technology', 'digital ops'],
    'Auditing': ['audit', 'iosa', 'safety review', 'regulatory action', 'compliance review',
        'regulatory intervention', 'sanctions', 'restrictions', 'grounded',
        'safety audit', 'compliance audit', 'regulatory review',
        'enforcement action', 'safety inspection'],
    'Ops Manual': ['operations manual', 'flight operations manual', 'sop',
        'standard operating procedures', 'manual amendment', 'ops manual',
        'manual review', 'fcom', 'operations specification'],
};
```

Add `classifyRegion(title, description)` function — same pattern as New Airlines server line 212-222 but using the expanded seven-region map.

Add `matchServiceLines(title, description)` function:
```javascript
function matchServiceLines(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    const hits = {};
    for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
        let count = 0;
        for (const kw of keywords) {
            if (text.includes(kw.toLowerCase())) count++;
        }
        if (count > 0) hits[service] = count;
    }
    return hits;
}
```

Add `isRelevant(title, description)`:
```javascript
function isRelevant(title, description) {
    return Object.keys(matchServiceLines(title, description)).length > 0;
}
```

- [ ] **Step 5: Commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser_Server.mjs
git commit -m "feat(lead-analyser): add RSS parser, region map, and service line keywords"
```

---

### Task 3: Scan Pipeline — Fetch, Parse, Deduplicate, Score, Persist

**Files:**
- Modify: `Aviation_Tools/QC_Lead_Analyser_Server.mjs`

- [ ] **Step 1: Add entity name extraction function**

Similar to `QC_New_Airlines_Dashboard_server.mjs` lines 288-304 (`extractAirlineName`), but adapted for broader lead types:

```javascript
function extractEntityName(title) {
    const patterns = [
        /^([A-Z][A-Za-z\s]+(?:Air(?:lines?|ways)?|Aviation|Aerospace))/,
        /^([A-Z][A-Za-z\s]{2,30})\s+(?:launch|receiv|secur|commence|begin|start|plan|announc|get|gain|grant|order|sign|acquir)/i,
        /new (?:airline|carrier)\s+([A-Z][A-Za-z\s]+?)(?:\s+(?:launch|to|plan|set|receiv))/i,
    ];
    for (const re of patterns) {
        const m = title.match(re);
        if (m) return m[1].trim();
    }
    return title.split(/\s+/).slice(0, 5).join(' ');
}
```

- [ ] **Step 2: Add grading function (rule-based scoring)**

Per spec Section 7:

```javascript
function gradeLead(keywordHits) {
    const serviceCount = Object.keys(keywordHits).length;
    const totalHits = Object.values(keywordHits).reduce((a, b) => a + b, 0);

    // GREEN: 3+ service lines matched, or strong primary match
    const criticalServices = ['Airline Startup', 'Simulators', 'Auditing'];
    const hasCriticalStrong = criticalServices.some(s => (keywordHits[s] || 0) >= 2);

    if (serviceCount >= 3 || (serviceCount >= 1 && hasCriticalStrong && totalHits >= 3)) {
        return { grade: 'GREEN', gradeLabel: 'Good Fit' };
    }
    if (serviceCount >= 1) {
        return { grade: 'YELLOW', gradeLabel: 'Possible Fit' };
    }
    return { grade: 'AMBER', gradeLabel: 'Poor Fit' };
}
```

- [ ] **Step 3: Add reasoning generator**

```javascript
function generateReasoning(entity, keywordHits, grade) {
    const services = Object.keys(keywordHits);
    if (services.length === 0) {
        return `Tangential match for ${entity}. Limited direct consulting opportunity identified.`;
    }
    const serviceList = services.join(', ');
    if (grade === 'GREEN') {
        return `Strong fit across ${services.length} service lines: ${serviceList}. Multiple consulting opportunities identified.`;
    }
    if (grade === 'YELLOW') {
        return `Possible fit for ${serviceList}. Further assessment recommended to confirm consulting opportunity.`;
    }
    return `Weak match for ${serviceList}. Limited or tangential consulting opportunity.`;
}
```

- [ ] **Step 4: Add TendersOnTime HTML parser**

```javascript
function parseTenderItems(html) {
    const items = [];
    // Look for repeated item containers — tender listings typically use <div> or <tr> patterns
    // Strategy: find all anchor links with titles that look like tender listings
    const titlePattern = /<a[^>]+href="([^"]*)"[^>]*>([^<]*(?:aviation|airline|flight|airport|pilot|training|simulator|consulting)[^<]*)<\/a>/gi;
    let match;
    while ((match = titlePattern.exec(html)) !== null) {
        const link = match[1].startsWith('http') ? match[1] : 'https://www.tendersontime.com' + match[1];
        items.push({
            title: match[2].trim(),
            link,
            description: match[2].trim(),
            pubDate: new Date().toISOString(),
        });
    }
    // Fallback: look for structured listing items
    if (items.length === 0) {
        const listPattern = /<h[2-4][^>]*>([^<]*(?:aviation|airline|flight|airport|pilot|training|simulator|consulting)[^<]*)<\/h[2-4]>/gi;
        while ((match = listPattern.exec(html)) !== null) {
            items.push({
                title: match[1].trim(),
                link: 'https://www.tendersontime.com/searchrfp/global-aviation-consultancy-rfp-733/',
                description: match[1].trim(),
                pubDate: new Date().toISOString(),
            });
        }
    }
    return items;
}
```

- [ ] **Step 5: Add deduplication function**

```javascript
function isDuplicate(leadId, title, allStores) {
    const normTitle = title.toLowerCase().trim().substring(0, 40);
    for (const store of allStores) {
        for (const lead of (store.leads || [])) {
            if (lead.id === leadId) return true;
            if (normTitle.length > 20 && lead.headline &&
                lead.headline.toLowerCase().trim().substring(0, 40) === normTitle) return true;
        }
    }
    return false;
}
```

- [ ] **Step 6: Add the main scan orchestrator function**

This is the core function called by `POST /api/scan`. It:
1. Accepts `{ regions: [...] }` body to filter which regions to scan
2. Checks 10-minute scan cache — returns cached results if within window
3. Fetches all RSS feeds concurrently (using `Promise.allSettled`)
4. Fetches TendersOnTime page
5. Parses all results using `parseRSSItems` and `parseTenderItems`
6. For each parsed item: classify region, check if region is in the requested set, check relevance, deduplicate, extract entity name, score service lines, grade, generate reasoning
7. Builds lead objects per the spec JSON schema (id, entity, headline, description, sourceUrl, source, publishDate, fetchDate, region, grade, gradeLabel, reasoning, matchedServices, assessmentSource, keywordHits)
8. Appends new leads to `DATA_FILE`, updates `lastScanDate` and `scanStats`
9. Broadcasts SSE progress at each feed and completion
10. Returns count of new leads

```javascript
let scanCache = { timestamp: 0, regionKey: '', results: null };
const SCAN_CACHE_MS = 10 * 60 * 1000; // 10 minutes

async function runScan(requestedRegions) {
    // Check cache — keyed by region set so different region selections don't return stale results
    const regionKey = requestedRegions.slice().sort().join(',');
    if (Date.now() - scanCache.timestamp < SCAN_CACHE_MS && scanCache.regionKey === regionKey && scanCache.results) {
        broadcastSSE({ stage: 'complete', cached: true, ...scanCache.results });
        return scanCache.results;
    }

    const data = readJSON(DATA_FILE);
    const keep = readJSON(KEEP_FILE);
    const archive = readJSON(ARCHIVE_FILE);
    const allStores = [data, keep, archive];
    const failedSources = [];
    let totalScanned = 0;
    const newLeads = [];

    // Fetch all RSS feeds concurrently (spec requires concurrent fetching)
    const total = RSS_FEEDS.length + 1; // +1 for TendersOnTime
    let completed = 0;

    const feedPromises = RSS_FEEDS.map(feed =>
        httpsGet(feed.url, 15000)
            .then(xml => ({ feed, xml, error: null }))
            .catch(err => ({ feed, xml: null, error: err }))
    );

    const feedResults = await Promise.all(feedPromises);

    for (const { feed, xml, error } of feedResults) {
        completed++;
        broadcastSSE({ stage: 'fetching', source: feed.name, progress: completed / total });

        if (error) {
            console.error(`[scan] ${feed.name} failed:`, error.message);
            failedSources.push(feed.name);
            continue;
        }

        const items = parseRSSItems(xml);
        totalScanned += items.length;

        for (const item of items) {
            const region = classifyRegion(item.title, item.description);
            if (!region || !requestedRegions.includes(region)) continue;
            if (!isRelevant(item.title, item.description)) continue;

            const id = 'lead_' + hashString((item.link || '') + item.title);
            if (isDuplicate(id, item.title, allStores)) continue;

            const entity = extractEntityName(item.title);
            const keywordHits = matchServiceLines(item.title, item.description);
            const { grade, gradeLabel } = gradeLead(keywordHits);
            const reasoning = generateReasoning(entity, keywordHits, grade);

            newLeads.push({
                id,
                entity,
                headline: item.title,
                description: stripCDATA(item.description || '').substring(0, 500),
                sourceUrl: item.link || '',
                source: feed.name,
                publishDate: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                fetchDate: new Date().toISOString(),
                region,
                grade,
                gradeLabel,
                reasoning,
                matchedServices: Object.keys(keywordHits),
                assessmentSource: 'rule-based',
                keywordHits,
            });
        }
    }

    // Fetch TendersOnTime
    broadcastSSE({ stage: 'fetching', source: 'TendersOnTime', progress: completed / total });
    try {
        const html = await httpsGet(TENDER_URL, 15000);
        const tenderItems = parseTenderItems(html);
        totalScanned += tenderItems.length;

        for (const item of tenderItems) {
            const region = classifyRegion(item.title, item.description);
            if (!region || !requestedRegions.includes(region)) continue;

            const id = 'lead_' + hashString((item.link || '') + item.title);
            if (isDuplicate(id, item.title, allStores)) continue;

            const entity = extractEntityName(item.title);
            const keywordHits = matchServiceLines(item.title, item.description);
            const { grade, gradeLabel } = gradeLead(keywordHits);
            const reasoning = generateReasoning(entity, keywordHits, grade);

            newLeads.push({
                id, entity,
                headline: item.title,
                description: item.description.substring(0, 500),
                sourceUrl: item.link,
                source: 'TendersOnTime',
                publishDate: new Date().toISOString().slice(0, 10),
                fetchDate: new Date().toISOString(),
                region,
                grade, gradeLabel, reasoning,
                matchedServices: Object.keys(keywordHits),
                assessmentSource: 'rule-based',
                keywordHits,
            });
        }
    } catch (err) {
        console.error('[scan] TendersOnTime failed:', err.message);
        failedSources.push('TendersOnTime');
    }
    completed++;

    // Persist new leads
    data.leads.push(...newLeads);
    data.lastScanDate = new Date().toISOString();
    data.scanStats = { totalScanned, matchedLeads: data.leads.length };
    writeJSON(DATA_FILE, data);

    const result = { newLeads: newLeads.length, totalLeads: data.leads.length, failedSources };
    scanCache = { timestamp: Date.now(), regionKey, results: result };

    broadcastSSE({ stage: 'complete', ...result });
    console.log(`[scan] Complete: ${newLeads.length} new leads, ${data.leads.length} total`);
    return result;
}
```

- [ ] **Step 7: Add POST /api/scan route**

```javascript
if (req.method === 'POST' && url === '/api/scan') {
    const body = await parseBody(req);
    const regions = body.regions || Object.keys(REGION_MAP);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'started' }));
    runScan(regions).catch(err => {
        console.error('[scan] Fatal:', err.message);
        broadcastSSE({ stage: 'error', message: err.message });
    });
    return;
}
```

- [ ] **Step 8: Test the scan pipeline**

Run: `node Aviation_Tools/QC_Lead_Analyser_Server.mjs`
Test: `curl -X POST http://localhost:3849/api/scan -H "Content-Type: application/json" -d '{"regions":["australia","europe"]}'`
Expected: Returns `{ "status": "started" }`. Server logs show feeds being fetched. After completion, `curl http://localhost:3849/api/discover` returns leads with populated fields.

- [ ] **Step 9: Commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser_Server.mjs
git commit -m "feat(lead-analyser): add scan pipeline with RSS fetch, scoring, and deduplication"
```

---

### Task 4: Lead Lifecycle API — Keep, Archive, Restore, Delete, Update

**Files:**
- Modify: `Aviation_Tools/QC_Lead_Analyser_Server.mjs`

- [ ] **Step 1: Add POST /api/keep route — move lead from Discover to Keep**

When called with `{ leadId }`:
1. Find lead in `DATA_FILE` by ID
2. Remove from discover leads array
3. Extend lead with keep-specific fields: `keptDate`, `website` (empty), `contactName`, `contactEmail`, `contactPhone`, `linkedin`, `notes`, `recentUpdates` (empty array)
4. Best-effort website extraction: check if `sourceUrl` domain looks like an entity domain (not a news site)
5. Append to `KEEP_FILE` leads array
6. Save both files
7. Return the keep lead object

- [ ] **Step 2: Add POST /api/archive route — move lead to Archive**

When called with `{ leadId, notes }`:
1. Find lead in `DATA_FILE` or `KEEP_FILE` by ID
2. Remove from source file
3. Extend with `archiveDate` (ISO timestamp) and `archiveNotes` (from body)
4. Append to `ARCHIVE_FILE` leads array
5. Save all affected files
6. Return success

- [ ] **Step 3: Add PUT /api/keep/:id route — update Keep lead editable fields**

URL parameter extraction pattern (the existing servers don't use parameterised routes, so this is new):
```javascript
const keepMatch = url.match(/^\/api\/keep\/(.+)$/);
if (req.method === 'PUT' && keepMatch) {
    const leadId = decodeURIComponent(keepMatch[1]);
    // ...
}
```

When called with body containing any of: `website`, `contactName`, `contactEmail`, `contactPhone`, `linkedin`, `notes`:
1. Find lead in `KEEP_FILE` by ID (from URL path)
2. Merge provided fields into the lead object
3. Save `KEEP_FILE`
4. Return updated lead

- [ ] **Step 4: Add POST /api/restore route — restore archived lead to Keep**

When called with `{ leadId }`:
1. Find lead in `ARCHIVE_FILE` by ID
2. Remove from archive
3. Add keep-specific fields (same as Step 1)
4. Remove archive-specific fields (`archiveDate`, `archiveNotes`)
5. Append to `KEEP_FILE`
6. Save both files
7. Return success

- [ ] **Step 5: Add DELETE /api/archive/:id route — permanently delete archived lead**

URL parameter extraction:
```javascript
const archiveMatch = url.match(/^\/api\/archive\/(.+)$/);
if (req.method === 'DELETE' && archiveMatch) {
    const leadId = decodeURIComponent(archiveMatch[1]);
    // ...
}
```

1. Find and remove lead from `ARCHIVE_FILE` by ID
2. Save file
3. Return success

- [ ] **Step 6: Add POST /api/keep/update route — re-scan feeds for kept entity updates**

1. Read all kept leads from `KEEP_FILE`
2. Fetch all RSS feeds (same feeds as scan)
3. For each article, check if any kept entity name appears in the title/description
4. For matches: append `{ date, headline, source, url }` to that lead's `recentUpdates` array (deduplicate by URL)
5. Save `KEEP_FILE`
6. Broadcast SSE progress and completion

- [ ] **Step 7: Test all CRUD routes**

Test sequence:
1. Run a scan: `curl -X POST http://localhost:3849/api/scan -d '{"regions":["australia"]}'`
2. Get a lead ID from: `curl http://localhost:3849/api/discover`
3. Keep it: `curl -X POST http://localhost:3849/api/keep -d '{"leadId":"lead_xxx"}'`
4. Verify keep: `curl http://localhost:3849/api/keep`
5. Update contact: `curl -X PUT http://localhost:3849/api/keep/lead_xxx -d '{"contactName":"John Smith"}'`
6. Archive from keep: `curl -X POST http://localhost:3849/api/archive -d '{"leadId":"lead_xxx","notes":"Not pursuing"}'`
7. Verify archive: `curl http://localhost:3849/api/archive`
8. Restore: `curl -X POST http://localhost:3849/api/restore -d '{"leadId":"lead_xxx"}'`
9. Delete from archive: re-archive then `curl -X DELETE http://localhost:3849/api/archive/lead_xxx`

- [ ] **Step 8: Commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser_Server.mjs
git commit -m "feat(lead-analyser): add lead lifecycle CRUD — keep, archive, restore, delete, update"
```

---

### Task 5: AI Deep Assess API Route

**Files:**
- Modify: `Aviation_Tools/QC_Lead_Analyser_Server.mjs`

- [ ] **Step 1: Add Claude API call function**

```javascript
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

function callClaudeAPI(systemPrompt, userPrompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        });

        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.content && parsed.content[0]) {
                        resolve(parsed.content[0].text);
                    } else {
                        reject(new Error('Unexpected API response: ' + data.substring(0, 200)));
                    }
                } catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
```

- [ ] **Step 2: Add POST /api/ai-assess route**

Per spec Section 7 AI prompt template:

```javascript
if (req.method === 'POST' && url === '/api/ai-assess') {
    if (!ANTHROPIC_API_KEY) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }));
        return;
    }

    const body = await parseBody(req);
    const { leadId } = body;

    // Find lead in any store
    const data = readJSON(DATA_FILE);
    const keep = readJSON(KEEP_FILE);
    let lead = data.leads.find(l => l.id === leadId) || keep.leads.find(l => l.id === leadId);

    if (!lead) {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Lead not found' }));
        return;
    }

    const systemPrompt = `You are an aviation business development analyst for QC Aviation Group Pty Ltd, a flight operations consultancy. Assess the following news item as a potential business lead.

QC Aviation offers these services:
1. Airline Startup (domestic and international)
2. Aircraft Entry Into Service
3. Sourcing Aircraft (business jet and airline types)
4. Airline Flight Training Consulting
5. Flight Operations Management Consulting
6. Flight Training Simulators (assessment, validation, installation)
7. Airline Route Analysis
8. Flight Operations Technology Consulting
9. Auditing (internal, regulatory compliance, IOSA compliance)
10. Flight Operations Manual Suite (construction, assessment, amendment)

Respond with JSON only:
{
  "grade": "GREEN|YELLOW|AMBER",
  "gradeLabel": "Good Fit|Possible Fit|Poor Fit",
  "reasoning": "2-3 sentence explanation",
  "matchedServices": ["service name", ...]
}`;

    const userPrompt = `Title: ${lead.headline}\nSource: ${lead.source}\nDate: ${lead.publishDate}\nDescription: ${lead.description}`;

    try {
        const responseText = await callClaudeAPI(systemPrompt, userPrompt);
        const assessment = JSON.parse(responseText);

        // Update lead in its store
        lead.grade = assessment.grade;
        lead.gradeLabel = assessment.gradeLabel;
        lead.reasoning = assessment.reasoning;
        lead.matchedServices = assessment.matchedServices;
        lead.assessmentSource = 'ai-assessed';

        // Save to the correct file
        if (data.leads.find(l => l.id === leadId)) writeJSON(DATA_FILE, data);
        if (keep.leads.find(l => l.id === leadId)) writeJSON(KEEP_FILE, keep);

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, lead }));
    } catch (err) {
        console.error('[ai-assess] Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: err.message }));
    }
    return;
}
```

- [ ] **Step 3: Commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser_Server.mjs
git commit -m "feat(lead-analyser): add AI deep assess route with Claude API integration"
```

---

### Task 6: Frontend — HTML Structure, Header, Tabs, Theme CSS

**Files:**
- Create: `Aviation_Tools/QC_Lead_Analyser.html` (overwrite placeholder)

- [ ] **Step 1: Write the complete HTML document with CSS**

This is the full frontend file. Reference `QC_AD_SB_Dashboard.html` lines 1-150 for the exact CSS variable definitions, header styles, and button styles.

The HTML structure must include:
- `<!DOCTYPE html>` with `<meta charset="UTF-8">` and viewport meta
- `<title>QC Lead Analyser</title>`
- `<style>` block with:
  - CSS `:root` variables (copy exactly from AD/SB Dashboard lines 9-24)
  - Body: `background: var(--bg-primary); color: var(--text-primary); font-family: Arial, sans-serif; margin: 0; min-height: 100vh;`
  - Header: sticky, `background: var(--bg-header)`, gold bottom border, flex layout with logo left, title left-of-centre, CONFIDENTIAL label centred, Update button right
  - CONFIDENTIAL label: `background: #c0392b; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 16px; border-radius: 2px; letter-spacing: 3px; text-transform: uppercase; position: absolute; left: 50%; transform: translateX(-50%);`
  - Tab bar: flex row below header, `background: #0d1117`, bottom border. Active tab has gold bottom border and gold text. Inactive tabs have secondary text colour. Each tab shows count badge.
  - Region pills: flex wrap row, each pill is a rounded toggle. Active: gold background, dark text. Inactive: transparent with gold border and gold text.
  - Grade filter pills: same pattern as region pills but with grade colours
  - Sort dropdown: styled select matching theme
  - Lead card: `background: var(--bg-card)`, `border-radius: 8px`, `padding: 16px`, left border 4px coloured by grade, `margin-bottom: 12px`
  - Card internals: entity name (14px bold), headline (gold 11px), description (secondary 11px), reasoning section (divider, label, 10px text), service tags (coloured pills)
  - Keep card: extends lead card with editable fields section (inputs styled: `background: #0d1117; border: 1px solid #2a3a4a; color: var(--text-primary); padding: 6px 10px; border-radius: 4px; font-family: Arial;`)
  - Archive card: lead card with archive date and notes displayed
  - Context menu: `position: fixed; background: #1a2332; border: 1px solid #2a3a4a; border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);` — items have hover state
  - Archive modal: full-screen overlay with centred content box
  - Progress bar: thin bar below header, `background: var(--accent-gold)`, animates width
  - Button styles: copy `.btn-primary` and `.btn-secondary` from AD/SB Dashboard lines 84-123
  - Collapsible region headers (Keep tab): click to toggle, with chevron indicator
  - Last scanned timestamp: right-aligned in filter bar, secondary text colour

- `<body>` with:
  - `<header>` — logo, title, CONFIDENTIAL label, Update button
  - Tab bar `<div>`
  - Filter bar `<div>` — region pills, grade pills, sort dropdown, last scanned timestamp
  - Main content `<div id="content">` — container for tab content
  - Context menu `<div id="contextMenu">` — hidden by default
  - Archive modal `<div id="archiveModal">` — hidden by default
  - Progress bar `<div id="progressBar">` — hidden by default

- [ ] **Step 2: Commit the HTML structure and CSS (no JS yet)**

```bash
git add Aviation_Tools/QC_Lead_Analyser.html
git commit -m "feat(lead-analyser): add HTML structure, header, tabs, and theme CSS"
```

---

### Task 7: Frontend — JavaScript State, API, Tab Rendering

**Files:**
- Modify: `Aviation_Tools/QC_Lead_Analyser.html`

- [ ] **Step 1: Add JavaScript state management and API helper**

Add a `<script>` block at the bottom of the `<body>` with:

```javascript
// ===== STATE =====
const state = {
    activeTab: 'discover',      // 'discover' | 'keep' | 'archive'
    selectedRegions: new Set(['australia', 'oceania', 'se_asia', 'east_asia', 'central_asia', 'middle_east', 'europe']),
    gradeFilter: 'ALL',         // 'ALL' | 'GREEN' | 'YELLOW' | 'AMBER'
    sortBy: 'newest',           // 'newest' | 'grade' | 'entity'
    discoverLeads: [],
    keepLeads: [],
    archiveLeads: [],
    lastScanDate: null,
    scanning: false,
};

// ===== API =====
async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    return res.json();
}

async function loadAllData() {
    const [discover, keep, archive] = await Promise.all([
        api('GET', '/api/discover'),
        api('GET', '/api/keep'),
        api('GET', '/api/archive'),
    ]);
    state.discoverLeads = discover.leads || [];
    state.keepLeads = keep.leads || [];
    state.archiveLeads = archive.leads || [];
    state.lastScanDate = discover.lastScanDate || null;
    render();
}
```

- [ ] **Step 2: Add SSE connection for progress tracking**

```javascript
function connectSSE() {
    const es = new EventSource('/events');
    es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.stage === 'fetching') {
            updateProgress(data.source, data.progress);
        } else if (data.stage === 'complete') {
            hideProgress();
            state.scanning = false;
            loadAllData();
        } else if (data.stage === 'error') {
            hideProgress();
            state.scanning = false;
            showToast('Scan error: ' + data.message, 'error');
        }
    };
}
```

- [ ] **Step 3: Add tab switching logic**

```javascript
function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    render();
}
```

Wire up tab click handlers in an `init()` function called on `DOMContentLoaded`.

- [ ] **Step 4: Add region pill and grade filter rendering and toggle logic**

```javascript
const REGION_LABELS = {
    australia: 'Australia', oceania: 'Oceania', se_asia: 'South East Asia',
    east_asia: 'East Asia', central_asia: 'Central Asia',
    middle_east: 'Middle East', europe: 'Europe',
};

function renderRegionPills() {
    const container = document.getElementById('regionPills');
    container.innerHTML = Object.entries(REGION_LABELS).map(([key, label]) => {
        const active = state.selectedRegions.has(key);
        return `<button class="pill ${active ? 'active' : ''}" onclick="toggleRegion('${key}')">${label}</button>`;
    }).join('');
}

function renderGradeFilter() {
    const container = document.getElementById('gradeFilter');
    const grades = ['ALL', 'GREEN', 'YELLOW', 'AMBER'];
    container.innerHTML = grades.map(g => {
        const active = state.gradeFilter === g;
        return `<button class="pill grade-pill ${g.toLowerCase()} ${active ? 'active' : ''}" onclick="setGradeFilter('${g}')">${g}</button>`;
    }).join('');
}
```

```javascript
function toggleRegion(region) {
    if (state.selectedRegions.has(region)) {
        state.selectedRegions.delete(region);
    } else {
        state.selectedRegions.add(region);
    }
    renderRegionPills();
    render();
}

function setGradeFilter(grade) {
    state.gradeFilter = grade;
    renderGradeFilter();
    render();
}

function setSortBy(value) {
    state.sortBy = value;
    render();
}
```

- [ ] **Step 5: Add filtering and sorting helpers**

```javascript
function getFilteredLeads(leads) {
    let filtered = leads.filter(l => state.selectedRegions.has(l.region));
    if (state.gradeFilter !== 'ALL') {
        filtered = filtered.filter(l => l.grade === state.gradeFilter);
    }
    if (state.sortBy === 'newest') {
        filtered.sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''));
    } else if (state.sortBy === 'grade') {
        const order = { GREEN: 0, YELLOW: 1, AMBER: 2 };
        filtered.sort((a, b) => (order[a.grade] || 3) - (order[b.grade] || 3));
    } else if (state.sortBy === 'entity') {
        filtered.sort((a, b) => (a.entity || '').localeCompare(b.entity || ''));
    }
    return filtered;
}
```

- [ ] **Step 6: Add date formatting helper**

```javascript
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return String(d.getDate()).padStart(2, '0') + months[d.getMonth()] + d.getFullYear();
}
```

- [ ] **Step 7: Commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser.html
git commit -m "feat(lead-analyser): add JS state management, API, SSE, filters, and sorting"
```

---

### Task 8: Frontend — Lead Card Rendering (Discover, Keep, Archive)

**Files:**
- Modify: `Aviation_Tools/QC_Lead_Analyser.html`

- [ ] **Step 1: Add the main render() function and Discover tab renderer**

```javascript
function render() {
    updateTabCounts();
    const content = document.getElementById('content');

    if (state.activeTab === 'discover') {
        renderDiscoverTab(content);
    } else if (state.activeTab === 'keep') {
        renderKeepTab(content);
    } else if (state.activeTab === 'archive') {
        renderArchiveTab(content);
    }
}
```

`renderDiscoverTab(container)`:
- Calls `getFilteredLeads(state.discoverLeads)`
- For each lead, builds an expanded card HTML string using the card structure from spec Section 4:
  - Left border coloured by grade
  - Entity name (bold) + grade badge (right)
  - Headline (gold)
  - Description
  - Assessment Reasoning section (with divider, label, reasoning text)
  - Assessment source indicator ("Rule-based" or "AI-assessed")
  - Service line tag pills
  - Date and source (right-aligned)
- Sets `container.innerHTML` to the built HTML
- If no leads match the filters, show an empty-state message: "No leads found. Select regions and click Update to scan for leads."
- Attaches `oncontextmenu` handlers to each card for the custom context menu

- [ ] **Step 2: Add Keep tab renderer with editable fields and collapsible region groups**

`renderKeepTab(container)`:
- Groups leads by region
- For each region with leads, renders a collapsible header: region name + count + chevron
- Within each region, renders keep cards (same base as discover cards but with extra fields):
  - Website field (input, pre-populated)
  - Contact Name, Email, Phone, LinkedIn (input fields)
  - Notes (textarea)
  - Recent Updates section (if any): chronological list of headline + date + source + link
- Input fields have `onblur` handlers that call `PUT /api/keep/:id`
- Each card has `oncontextmenu` for Keep-tab-specific context menu

```javascript
// Debounced save — spec requires 500ms debounce on blur
const saveTimers = {};
function saveKeepField(leadId, field, value) {
    const key = leadId + '_' + field;
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => {
        api('PUT', `/api/keep/${leadId}`, { [field]: value });
    }, 500);
}
```

Input fields use `onblur` with the debounced save:
```html
<input onblur="saveKeepField('${lead.id}', 'contactName', this.value)" ...>
```

- [ ] **Step 3: Add Archive tab renderer with search**

`renderArchiveTab(container)`:
- Adds search input at top
- Filters archived leads by search text (entity, region, notes)
- Renders archive cards: entity name, headline, grade badge, archive date, archive notes
- Each card has `oncontextmenu` for Archive-tab-specific context menu
- Search input has `oninput` handler that re-filters and re-renders

- [ ] **Step 4: Add tab count badge updater**

```javascript
function updateTabCounts() {
    document.querySelector('[data-tab="discover"] .count').textContent = state.discoverLeads.length;
    document.querySelector('[data-tab="keep"] .count').textContent = state.keepLeads.length;
    document.querySelector('[data-tab="archive"] .count').textContent = state.archiveLeads.length;
}
```

- [ ] **Step 5: Commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser.html
git commit -m "feat(lead-analyser): add card rendering for Discover, Keep, and Archive tabs"
```

---

### Task 9: Frontend — Context Menu, Archive Modal, and Actions

**Files:**
- Modify: `Aviation_Tools/QC_Lead_Analyser.html`

- [ ] **Step 1: Add custom context menu logic**

```javascript
let contextTarget = null; // { leadId, tab }

function showContextMenu(e, leadId, tab) {
    e.preventDefault();
    contextTarget = { leadId, tab };
    const menu = document.getElementById('contextMenu');

    // Build menu items based on current tab
    let items = '';
    if (tab === 'discover') {
        items = `
            <div class="ctx-item" onclick="doKeep()">✓ Keep</div>
            <div class="ctx-item" onclick="doArchivePrompt()">📦 Archive</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item ${ANTHROPIC_API_KEY ? '' : 'disabled'}" onclick="doAIAssess()">🔍 AI Deep Assess</div>
        `;
    } else if (tab === 'keep') {
        items = `
            <div class="ctx-item" onclick="doArchivePrompt()">📦 Archive</div>
            <div class="ctx-item ${ANTHROPIC_API_KEY ? '' : 'disabled'}" onclick="doAIAssess()">🔍 AI Deep Assess</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item" onclick="doOpenWebsite()">🌐 Open Website</div>
        `;
    } else if (tab === 'archive') {
        items = `
            <div class="ctx-item" onclick="doRestore()">↩ Restore to Keep</div>
            <div class="ctx-item danger" onclick="doDeletePermanent()">🗑 Delete Permanently</div>
        `;
    }

    menu.innerHTML = items;
    menu.style.display = 'block';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
}

function hideContextMenu() {
    document.getElementById('contextMenu').style.display = 'none';
}

// Hide menu on click elsewhere
document.addEventListener('click', hideContextMenu);
```

Note: `ANTHROPIC_API_KEY` is a boolean set by a check route `GET /api/config` that returns `{ aiEnabled: true/false }`.

Note: `GET /api/config` route was already added in Task 1 Step 5. Frontend loads this on init: `const config = await api('GET', '/api/config'); window.ANTHROPIC_API_KEY = config.aiEnabled;`

- [ ] **Step 2: Add archive modal**

```javascript
function doArchivePrompt() {
    hideContextMenu();
    const modal = document.getElementById('archiveModal');
    const lead = findLeadById(contextTarget.leadId);

    document.getElementById('archiveEntity').textContent = lead.entity;
    document.getElementById('archiveHeadline').textContent = lead.headline;
    document.getElementById('archiveNotes').value = '';
    modal.style.display = 'flex';
}

function confirmArchive() {
    const notes = document.getElementById('archiveNotes').value;
    api('POST', '/api/archive', { leadId: contextTarget.leadId, notes }).then(() => {
        document.getElementById('archiveModal').style.display = 'none';
        loadAllData();
    });
}

function cancelArchive() {
    document.getElementById('archiveModal').style.display = 'none';
}
```

- [ ] **Step 3: Add Keep, AI Assess, Restore, Delete, and Open Website action functions**

```javascript
async function doKeep() {
    hideContextMenu();
    await api('POST', '/api/keep', { leadId: contextTarget.leadId });
    loadAllData();
    showToast('Lead moved to Keep');
}

async function doAIAssess() {
    hideContextMenu();
    if (!window.ANTHROPIC_API_KEY) return;
    showToast('AI assessment in progress...');
    const result = await api('POST', '/api/ai-assess', { leadId: contextTarget.leadId });
    if (result.success) {
        showToast('AI assessment complete');
        loadAllData();
    } else {
        showToast('AI assessment failed: ' + result.error, 'error');
    }
}

async function doRestore() {
    hideContextMenu();
    await api('POST', '/api/restore', { leadId: contextTarget.leadId });
    loadAllData();
    showToast('Lead restored to Keep');
}

async function doDeletePermanent() {
    hideContextMenu();
    if (!confirm('Permanently delete this lead?')) return;
    await api('DELETE', `/api/archive/${contextTarget.leadId}`);
    loadAllData();
    showToast('Lead deleted');
}

function doOpenWebsite() {
    hideContextMenu();
    const lead = state.keepLeads.find(l => l.id === contextTarget.leadId);
    if (lead && lead.website) {
        window.open(lead.website, '_blank');
    } else {
        showToast('No website URL set for this lead', 'error');
    }
}
```

- [ ] **Step 4: Add toast notification function**

```javascript
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
```

Add CSS for `.toast`:
```css
.toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    z-index: 10000;
    animation: fadeIn 0.3s, fadeOut 0.3s 2.7s;
    font-family: Arial, sans-serif;
}
.toast.success { background: #4caf50; color: #fff; }
.toast.error { background: #f44336; color: #fff; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
```

- [ ] **Step 5: Add progress bar show/hide/update functions**

```javascript
function showProgress() {
    document.getElementById('progressBar').style.display = 'block';
}

function updateProgress(source, progress) {
    const bar = document.getElementById('progressBar');
    bar.style.display = 'block';
    bar.querySelector('.bar-fill').style.width = (progress * 100) + '%';
    bar.querySelector('.bar-label').textContent = 'Scanning: ' + source;
}

function hideProgress() {
    document.getElementById('progressBar').style.display = 'none';
}
```

- [ ] **Step 6: Add Update button handlers**

```javascript
async function triggerScan() {
    if (state.scanning) return;
    state.scanning = true;
    showProgress();
    const regions = [...state.selectedRegions];
    await api('POST', '/api/scan', { regions });
}

async function triggerKeepUpdate() {
    if (state.scanning) return;
    state.scanning = true;
    showProgress();
    await api('POST', '/api/keep/update');
}
```

Wire Update button to call `triggerScan()` when on Discover tab, `triggerKeepUpdate()` when on Keep tab.

- [ ] **Step 7: Add init function and DOMContentLoaded**

```javascript
async function init() {
    const config = await api('GET', '/api/config');
    window.ANTHROPIC_API_KEY = config.aiEnabled;
    connectSSE();
    await loadAllData();
    renderRegionPills();
    renderGradeFilter();
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 8: Add findLeadById helper**

```javascript
function findLeadById(id) {
    return state.discoverLeads.find(l => l.id === id)
        || state.keepLeads.find(l => l.id === id)
        || state.archiveLeads.find(l => l.id === id);
}
```

- [ ] **Step 9: Commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser.html Aviation_Tools/QC_Lead_Analyser_Server.mjs
git commit -m "feat(lead-analyser): add context menu, archive modal, actions, and progress bar"
```

---

### Task 10: Integration Testing and Polish

**Files:**
- Modify: `Aviation_Tools/QC_Lead_Analyser.html` (minor fixes)
- Modify: `Aviation_Tools/QC_Lead_Analyser_Server.mjs` (minor fixes)

- [ ] **Step 1: Start server and test full workflow in browser**

Run: `node Aviation_Tools/QC_Lead_Analyser_Server.mjs`
Open: `http://localhost:3849`

Test checklist:
1. Header displays correctly: logo, title, CONFIDENTIAL label, Update button
2. All seven region pills render and toggle correctly
3. Click Update — progress bar animates, SSE events received, leads populate
4. Lead cards show: entity, headline, grade badge, description, reasoning, service tags, date, source
5. Grade filter pills work — clicking GREEN shows only green leads
6. Sort dropdown works — "Grade (best first)" sorts GREEN→YELLOW→AMBER
7. Right-click on Discover lead — context menu shows Keep/Archive/AI Deep Assess
8. Click Keep — lead moves to Keep tab, editable fields appear
9. Edit contact fields on Keep tab — fields persist after page refresh
10. Right-click on Keep lead — context menu shows Archive/AI Deep Assess/Open Website
11. Archive from Keep — modal appears, enter notes, confirm — lead moves to Archive tab
12. Archive tab shows archived leads with notes and archive date
13. Right-click on Archive lead — Restore to Keep works, Delete Permanently works
14. Keep tab Update button — re-scans and adds recent updates to kept leads
15. Last scanned timestamp displays correctly
16. If ANTHROPIC_API_KEY set: AI Deep Assess menu item is active and works
17. If ANTHROPIC_API_KEY not set: AI Deep Assess is greyed out

- [ ] **Step 2: Fix any issues found during integration testing**

Address visual alignment, missing handlers, API errors, or rendering bugs.

- [ ] **Step 3: Verify data persistence**

1. Stop server (Ctrl+C)
2. Check JSON files have data
3. Restart server
4. Refresh browser — all data (discover, keep, archive) loads correctly

- [ ] **Step 4: Final commit**

```bash
git add Aviation_Tools/QC_Lead_Analyser.html Aviation_Tools/QC_Lead_Analyser_Server.mjs
git commit -m "feat(lead-analyser): integration testing and polish"
```
