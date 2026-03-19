# Aviation Complaints Intelligence Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an aviation complaints intelligence dashboard that aggregates complaints from 11+ sources, auto-categorises them into 6 taxonomy categories, and presents trends, clusters, and consulting opportunities in a Command Centre layout.

**Architecture:** Node.js `.mjs` server (port 3851) with API endpoints for fetching, filtering, and exporting. Single-file HTML dashboard with Chart.js visualisations. JSON file archive with yearly splitting. Keyword-weighted auto-categorisation engine.

**Tech Stack:** Node.js (built-in modules only), Chart.js v4.4.7 (CDN), vanilla JavaScript, HTML/CSS, pandoc (for PDF export)

**Spec:** `docs/superpowers/specs/2026-03-19-aviation-complaints-intelligence-design.md`

**Existing pattern to follow:** `Aviation_Tools/QC_New_Airlines_Dashboard_server.mjs` and `Aviation_Tools/QC_New_Airlines_Dashboard.html`

---

## File Structure

All files in `Aviation_Tools/`:

| File | Responsibility |
|------|----------------|
| `QC_Aviation_Complaints_categories.json` | Category keyword dictionaries, entity lists, airline-to-region mappings |
| `QC_Aviation_Complaints_sources.json` | Source configuration: enabled flags, URLs, subreddits, keywords, rate limits |
| `QC_Aviation_Complaints_keys.json` | API keys for Reddit, X, YouTube (gitignored) |
| `QC_Aviation_Complaints_data.json` | Master complaint archive (metadata + posts array) |
| `QC_Aviation_Complaints_Server.mjs` | Node.js server: static serving, API endpoints, source fetching, categorisation, SSE, export |
| `QC_Aviation_Complaints_Dashboard.html` | Single-file HTML dashboard: all CSS, JS, Chart.js visualisations, Command Centre layout |
| `README_Aviation_Complaints.md` | Deployment and usage guide |

---

## Task 1: Configuration Files (categories, sources, keys)

**Files:**
- Create: `Aviation_Tools/QC_Aviation_Complaints_categories.json`
- Create: `Aviation_Tools/QC_Aviation_Complaints_sources.json`
- Create: `Aviation_Tools/QC_Aviation_Complaints_keys.json`

- [ ] **Step 1: Create the categories configuration file**

Create `Aviation_Tools/QC_Aviation_Complaints_categories.json` with all 6 taxonomy categories (keyword dictionaries with integer weights), entity lists (airframe OEMs, engine OEMs, aircraft types), and airline-to-region mappings.

Categories to include with keywords and weights as specified in the design spec Section 6.1:
- `technology` (colour `#2196f3`)
- `airframe_manufacturer` (colour `#ff9800`)
- `engine_manufacturer` (colour `#f44336`)
- `airline_operations` (colour `#4caf50`)
- `regulatory` (colour `#9c27b0`)
- `mro_maintenance` (colour `#d4a843`)

Additionally include:
- `entities.airframe_oems`: array of strings — `["Boeing", "Airbus", "Embraer", "ATR", "COMAC", "Bombardier", "Mitsubishi", "De Havilland Canada", "AVIC"]`
- `entities.engine_oems`: array of strings — `["Pratt & Whitney", "Rolls-Royce", "CFM International", "GE Aerospace", "Safran", "Honeywell"]`
- `entities.aircraft_types`: array of strings — `["737", "737 MAX", "747", "767", "777", "787", "A220", "A320", "A320neo", "A321", "A330", "A350", "A380", "E-Jet", "E175", "E190", "E195", "ATR 42", "ATR 72", "CRJ", "Dash 8", "Q400", "C919", "ARJ21"]`
- `entities.airlines`: object mapping airline name → region code. Include top 50 global airlines. Regions: `apac`, `emea`, `americas`, `middle_east`, `africa`. Example: `{"Qantas": "apac", "Ryanair": "emea", "Delta": "americas", "Emirates": "middle_east", "Ethiopian": "africa", ...}`
- `regionSources`: object mapping source keywords to regions — `{"CASA": "apac", "ATSB": "apac", "FAA": "americas", "NTSB": "americas", "EASA": "emea", "UK CAA": "emea", "CAAT": "apac", "DGCA": "apac"}`
- `scoringThreshold`: `15`

- [ ] **Step 2: Create the sources configuration file**

Create `Aviation_Tools/QC_Aviation_Complaints_sources.json` with all 11 source configurations:

```json
{
  "reddit": {
    "enabled": true,
    "subreddits": ["aviation", "flying", "airlines", "boeing", "MRO", "aviationmaintenance", "ATC"],
    "keywords": ["complaint", "issue", "problem", "failure", "broken", "unsafe", "delay", "cancel", "recall", "defect", "grounding", "incident", "accident", "warning", "concern"],
    "maxPostsPerFetch": 100,
    "rateLimitMs": 1000
  },
  "rss": {
    "enabled": true,
    "feeds": [
      { "name": "FlightGlobal", "url": "https://www.flightglobal.com/rss" },
      { "name": "AeroTime", "url": "https://www.aerotime.aero/rss" },
      { "name": "ch-aviation", "url": "https://www.ch-aviation.com/portal/news/rss" },
      { "name": "Aviation Week", "url": "https://aviationweek.com/rss/air-transport" },
      { "name": "Simple Flying", "url": "https://simpleflying.com/feed/" },
      { "name": "Australian Aviation", "url": "https://australianaviation.com.au/feed/" },
      { "name": "Airways Magazine", "url": "https://www.airwaysmag.com/feed/" }
    ],
    "keywords": ["complaint", "grounding", "recall", "airworthiness directive", "incident", "safety concern", "failure", "defect", "investigation", "emergency", "diversion"],
    "maxPostsPerFetch": 50
  },
  "faa_sdr": {
    "enabled": true,
    "url": "https://av-info.faa.gov/sdrx/Query.aspx",
    "maxPostsPerFetch": 50,
    "rateLimitMs": 2000
  },
  "easa": {
    "enabled": true,
    "url": "https://ad.easa.europa.eu/ad/ad-rss",
    "maxPostsPerFetch": 50
  },
  "asrs": {
    "enabled": false,
    "note": "Requires manual CSV download from https://asrs.arc.nasa.gov/search/database.html — use Manual Add",
    "maxPostsPerFetch": 50
  },
  "twitter": {
    "enabled": false,
    "note": "Requires paid API key ($100/month). Set bearerToken in _keys.json to enable.",
    "keywords": ["#aviationsafety", "#airlinecomplaint", "#boeing", "#airbus", "#avgeek complaint", "#flightdelay"],
    "maxPostsPerFetch": 100,
    "rateLimitMs": 1000
  },
  "skytrax": {
    "enabled": true,
    "baseUrl": "https://www.airlinequality.com/airline-reviews/",
    "airlines": ["british-airways", "ryanair", "emirates", "qantas-airways", "singapore-airlines", "american-airlines", "united-airlines", "delta-air-lines", "lufthansa", "air-france"],
    "maxPostsPerFetch": 20,
    "rateLimitMs": 2000
  },
  "tripadvisor": {
    "enabled": false,
    "note": "Scraping is fragile — enable cautiously. Use Manual Add as fallback.",
    "rateLimitMs": 3000
  },
  "pprune": {
    "enabled": true,
    "forums": [
      { "name": "Rumours & News", "url": "https://www.pprune.org/rumours-news/" },
      { "name": "Tech Log", "url": "https://www.pprune.org/tech-log/" }
    ],
    "maxPostsPerFetch": 30,
    "rateLimitMs": 3000
  },
  "airlinersnet": {
    "enabled": false,
    "note": "Forum scraping — enable cautiously.",
    "forums": ["general-aviation-buzz", "tech-ops"],
    "maxPostsPerFetch": 30,
    "rateLimitMs": 3000
  },
  "youtube": {
    "enabled": false,
    "note": "Requires YouTube Data API v3 key in _keys.json",
    "channels": ["UCwEIBZnlQkvPMYR2MBVjaSQ", "UC-T4iaxjJM-doTPPKM_gDLQ"],
    "keywords": ["complaint", "safety", "failure", "investigation", "problem"],
    "maxPostsPerFetch": 50,
    "rateLimitMs": 500
  }
}
```

- [ ] **Step 3: Create the API keys template file**

Create `Aviation_Tools/QC_Aviation_Complaints_keys.json`:

```json
{
  "reddit": { "clientId": "", "clientSecret": "", "userAgent": "QC-Aviation-Complaints/1.0" },
  "twitter": { "bearerToken": "" },
  "youtube": { "apiKey": "" }
}
```

- [ ] **Step 4: Create a seed data file**

Create `Aviation_Tools/QC_Aviation_Complaints_data.json` with empty archive structure:

```json
{
  "metadata": {
    "title": "Aviation Complaints Intelligence",
    "lastUpdate": null,
    "totalPosts": 0,
    "sources": ""
  },
  "posts": []
}
```

- [ ] **Step 5: Commit configuration files**

```bash
cd Aviation_Tools
git add QC_Aviation_Complaints_categories.json QC_Aviation_Complaints_sources.json QC_Aviation_Complaints_keys.json QC_Aviation_Complaints_data.json
git commit -m "feat: add configuration files for Aviation Complaints Intelligence Dashboard"
```

---

## Task 2: Server Core — Static Serving & API Skeleton

**Files:**
- Create: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs`

- [ ] **Step 1: Create server with static file serving and API route skeleton**

Create `Aviation_Tools/QC_Aviation_Complaints_Server.mjs` following the exact pattern from `QC_New_Airlines_Dashboard_server.mjs`:

The server must include:

1. **Imports and constants:**
   ```javascript
   import http from 'http';
   import https from 'https';
   import fs from 'fs';
   import path from 'path';
   import { fileURLToPath } from 'url';
   import { exec } from 'child_process';

   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);
   const PORT = 3851;
   const DATA_FILE = path.join(__dirname, 'QC_Aviation_Complaints_data.json');
   const CATEGORIES_FILE = path.join(__dirname, 'QC_Aviation_Complaints_categories.json');
   const SOURCES_FILE = path.join(__dirname, 'QC_Aviation_Complaints_sources.json');
   const KEYS_FILE = path.join(__dirname, 'QC_Aviation_Complaints_keys.json');
   ```

2. **MIME type map** — identical to existing servers (`.html`, `.json`, `.js`, `.mjs`, `.css`, `.png`, `.jpg`, `.svg`, `.ico`)

3. **Helper: `httpsGet(url, timeout)`** — copy pattern from existing server (follows redirects up to 3 levels, configurable timeout, User-Agent header)

4. **Helper: `httpGet(url, timeout)`** — same as httpsGet but using `http` module for non-HTTPS URLs

5. **Helper: `readJSON(filePath)`** — reads and parses a JSON file, returns parsed object or default `{ metadata: {}, posts: [] }` on error

6. **Helper: `writeJSON(filePath, data)`** — writes JSON with 2-space indent

7. **Helper: `parseBody(req)`** — returns a Promise that collects request body and JSON-parses it

8. **Request router** in `http.createServer` callback:
   - `GET /` → serve `QC_Aviation_Complaints_Dashboard.html`
   - `GET /api/complaints` → handler (stub returning empty array for now)
   - `GET /api/summary` → handler (stub returning empty object for now)
   - `GET /api/update-status` → SSE handler (stub)
   - `POST /api/update` → handler (stub returning `{ status: 'ok' }`)
   - `POST /api/recategorise` → handler (stub)
   - `POST /api/export-pdf` → handler (stub)
   - `POST /api/manual-add` → handler (stub)
   - Default: static file serving from `__dirname` (same pattern as existing servers)

9. **CORS headers** on all responses: `Access-Control-Allow-Origin: *`, handle OPTIONS preflight

10. **Server startup** with console log: `QC Aviation Complaints Intelligence server running on http://localhost:3851`

- [ ] **Step 2: Test server starts and serves static files**

Run: `node Aviation_Tools/QC_Aviation_Complaints_Server.mjs`
Expected: Server starts on port 3851, console log confirms. Test with `curl http://localhost:3851/QC_Aviation_Complaints_data.json` — should return the seed JSON.

- [ ] **Step 3: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Server.mjs
git commit -m "feat: add server core with static serving and API route skeleton"
```

---

## Task 3: Auto-Categorisation Engine

**Files:**
- Modify: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs`

This task adds the categorisation functions to the server. These are pure functions that take a post object and the categories config, and return categorised results.

- [ ] **Step 1: Implement the categorisation functions**

Add these functions to the server file, after the helper functions and before the request router:

1. **`loadCategories()`** — reads `_categories.json`, caches in memory. Returns the parsed config object.

2. **`categorisePost(post, config)`** — implements the keyword-weighted scoring algorithm:
   - Concatenate `post.title + ' ' + post.body`, lowercase
   - For each of the 6 categories in `config`, scan text for each keyword (case-insensitive)
   - Sum weights per category
   - Return array of category keys where score >= `config.scoringThreshold` (default 15)
   - If no category scores above threshold, return `["uncategorised"]`

3. **`extractEntities(post, config)`** — scans post text for known entities:
   - Check against `config.entities.airframe_oems`, `config.entities.engine_oems`, `config.entities.aircraft_types`, and all keys in `config.entities.airlines`
   - Return array of matched entity strings (deduplicated)

4. **`assignRegion(post, config)`** — implements region priority chain:
   - First: check `post.entities` for airline names, look up in `config.entities.airlines` mapping
   - Second: check post text for keywords in `config.regionSources`
   - Fallback: return `"global"`

5. **`processPost(rawPost, config)`** — orchestrator that calls categorisePost, extractEntities, assignRegion and assembles the full post object with `autoCategories`, `entities`, `region`, `sentiment: "negative"` (default — all complaints), `manualCategories: null`

- [ ] **Step 2: Test categorisation with a manual test**

Add a temporary test block at the bottom of the server file (guarded by `if (process.argv.includes('--test-categorise'))`) that:
- Loads categories config
- Processes a sample post: `{ title: "Third PW1100G engine failure on IndiGo A320neo", body: "Pratt & Whitney needs to address the reliability issues with the geared turbofan. Multiple AOG situations reported." }`
- Logs the result
- Expected output: autoCategories should include `engine_manufacturer` and `mro_maintenance`, entities should include `Pratt & Whitney`, `PW1100G`, `IndiGo`, `A320neo`, region should be `apac`

Run: `node Aviation_Tools/QC_Aviation_Complaints_Server.mjs --test-categorise`

- [ ] **Step 3: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Server.mjs
git commit -m "feat: add auto-categorisation engine with keyword scoring, entity extraction, and region assignment"
```

---

## Task 4: Source Fetchers — RSS, Reddit, Web Scraping

**Files:**
- Modify: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs`

Each source fetcher is an async function that takes its source config + keys, fetches raw data, and returns an array of normalised post objects (before categorisation). The source fetchers are added to the server file.

- [ ] **Step 1: Implement RSS feed fetcher**

Add function `async fetchRSS(sourceConfig)`:
- Iterate `sourceConfig.feeds` array
- For each feed, call `httpsGet(feed.url)`
- Parse RSS/Atom XML using the same `parseRSSItems()` function from the existing New Airlines server (copy it)
- Filter items matching any keyword in `sourceConfig.keywords` (case-insensitive match on title + description)
- Normalise each matching item to post schema:
  ```javascript
  {
    id: `rss_${hashString(item.link || item.title)}`,
    source: 'rss',
    sourceDetail: feed.name,
    author: feed.name,
    date: new Date(item.pubDate).toISOString(),
    title: item.title,
    body: stripHTML(item.description),
    url: item.link
  }
  ```
- Add a `hashString(str)` helper that returns a simple numeric hash (same pattern as existing server uses for dedup)
- Add a `stripHTML(html)` helper that removes HTML tags from text
- Respect `maxPostsPerFetch` limit
- Wrap in try/catch — log errors, return partial results on failure

- [ ] **Step 2: Implement Reddit fetcher**

Add function `async fetchReddit(sourceConfig, keys)`:
- If no `keys.reddit.clientId`, log warning and return empty array
- Authenticate via Reddit OAuth2: POST to `https://www.reddit.com/api/v1/access_token` with client credentials grant
- For each subreddit in `sourceConfig.subreddits`:
  - Fetch `https://oauth.reddit.com/r/{subreddit}/new.json?limit=25` with Bearer token
  - Filter posts matching any keyword in `sourceConfig.keywords`
  - Normalise to post schema:
    ```javascript
    {
      id: `reddit_${post.data.id}`,
      source: 'reddit',
      sourceDetail: `r/${subreddit}`,
      author: post.data.author,
      date: new Date(post.data.created_utc * 1000).toISOString(),
      title: post.data.title,
      body: post.data.selftext || '',
      url: `https://reddit.com${post.data.permalink}`
    }
    ```
- Respect `rateLimitMs` between requests (use `await sleep(ms)` helper)
- Respect `maxPostsPerFetch` total limit
- Wrap in try/catch

- [ ] **Step 3: Implement EASA RSS fetcher**

Add function `async fetchEASA(sourceConfig)`:
- Fetch the EASA AD RSS feed URL from sourceConfig
- Parse RSS items
- Normalise each AD to post schema:
  ```javascript
  {
    id: `easa_${hashString(item.link)}`,
    source: 'easa',
    sourceDetail: 'EASA Airworthiness Directives',
    author: 'EASA',
    date: new Date(item.pubDate).toISOString(),
    title: item.title,
    body: stripHTML(item.description),
    url: item.link
  }
  ```
- No keyword filtering needed — all ADs are relevant

- [ ] **Step 4: Implement Skytrax scraper**

Add function `async fetchSkytrax(sourceConfig)`:
- For each airline in `sourceConfig.airlines`:
  - Fetch `${sourceConfig.baseUrl}${airline}/` via `httpsGet`
  - Parse HTML to extract review blocks using regex:
    - Review title: match `<h2 class="text_header">(.*?)</h2>`
    - Review body: match `<div class="text_content">(.*?)</div>`
    - Rating: match `<span itemprop="ratingValue">(.*?)</span>`
    - Date: match `<time itemprop="datePublished" datetime="(.*?)">`
  - Filter for reviews with rating <= 3 (complaints)
  - Normalise to post schema with `source: 'skytrax'`, `sourceDetail: airline`
- Respect `rateLimitMs` between airline page fetches
- Wrap in try/catch — individual airline failures should not block others

- [ ] **Step 5: Implement PPRuNe forum scraper**

Add function `async fetchPPRuNe(sourceConfig)`:
- For each forum in `sourceConfig.forums`:
  - Fetch forum URL via `httpsGet`
  - Parse HTML to extract thread listings:
    - Thread title: match `<a[^>]*id="thread_title_\d+"[^>]*>(.*?)</a>` (or similar pattern)
    - Thread URL: extract href from the same link
  - For each thread (up to `maxPostsPerFetch`), fetch the thread page and extract the first post body
  - Normalise to post schema with `source: 'pprune'`, `sourceDetail: forum.name`
- Respect `rateLimitMs`
- Wrap in try/catch

- [ ] **Step 6: Implement YouTube comments fetcher**

Add function `async fetchYouTube(sourceConfig, keys)`:
- If no `keys.youtube.apiKey`, log warning and return empty array
- For each channel in `sourceConfig.channels`:
  - Fetch recent videos: `https://www.googleapis.com/youtube/v3/search?key=${key}&channelId=${channel}&part=snippet&order=date&maxResults=5&type=video`
  - For each video, fetch comments: `https://www.googleapis.com/youtube/v3/commentThreads?key=${key}&videoId=${videoId}&part=snippet&maxResults=50`
  - Filter comments matching keywords
  - Normalise to post schema with `source: 'youtube'`, `sourceDetail: channelTitle`
- Wrap in try/catch

- [ ] **Step 7: Implement Twitter/X fetcher (stub with note)**

Add function `async fetchTwitter(sourceConfig, keys)`:
- If no `keys.twitter.bearerToken`, log warning and return empty array
- Fetch `https://api.twitter.com/2/tweets/search/recent` with Bearer token
- Query: join keywords with OR
- Normalise results to post schema with `source: 'twitter'`
- Note in code comment: "Requires paid API access ($100/month Basic tier)"

- [ ] **Step 8: Implement FAA SDR fetcher (stub)**

Add function `async fetchFAASDR(sourceConfig)`:
- FAA SDR data is not available via a clean REST API — the web interface requires form submission
- Implement as a stub that logs "FAA SDR: automated fetching not yet implemented — use Manual Add"
- Return empty array
- Add a code comment explaining the limitation and suggesting manual CSV download

- [ ] **Step 9: Create the source fetcher registry**

Add a `SOURCE_FETCHERS` object mapping source keys to their fetch functions:

```javascript
const SOURCE_FETCHERS = {
    reddit: fetchReddit,
    rss: fetchRSS,
    easa: fetchEASA,
    skytrax: fetchSkytrax,
    pprune: fetchPPRuNe,
    youtube: fetchYouTube,
    twitter: fetchTwitter,
    faa_sdr: fetchFAASDR,
    // asrs, tripadvisor, airlinersnet — manual entry or future implementation
};
```

- [ ] **Step 10: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Server.mjs
git commit -m "feat: add source fetchers for RSS, Reddit, EASA, Skytrax, PPRuNe, YouTube, Twitter, FAA SDR"
```

---

## Task 5: Update Cycle & SSE Progress

**Files:**
- Modify: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs`

- [ ] **Step 1: Implement the update orchestrator**

Add function `async runUpdate(sseClients)`:

1. Load sources config, keys config, categories config, and current archive
2. Track progress: `{ total: enabledSourceCount, completed: 0, newPosts: 0, errors: [] }`
3. For each enabled source in sources config:
   - Send SSE event: `{ type: 'progress', source: sourceName, status: 'fetching', completed, total }`
   - Call the appropriate fetcher from `SOURCE_FETCHERS`
   - For each returned raw post:
     - Check deduplication: skip if `post.id` already exists in archive
     - Run `processPost(rawPost, categoriesConfig)` to add categories, entities, region
     - Add `fetchDate: new Date().toISOString()`
     - Append to archive posts array
   - Send SSE event: `{ type: 'progress', source: sourceName, status: 'complete', newPosts: countForSource, completed: ++progress.completed, total }`
   - If error, send: `{ type: 'progress', source: sourceName, status: 'error', error: err.message }`
4. Update archive metadata: `lastUpdate`, `totalPosts`, `sources` (comma-joined list of sources that returned data)
5. Check yearly archive split: if `posts.length > 10000`, move oldest complete year's posts to `QC_Aviation_Complaints_archive_YYYY.json`
6. Write updated archive to `DATA_FILE`
7. Send SSE event: `{ type: 'complete', totalNew: progress.newPosts, totalArchive: archive.posts.length }`

- [ ] **Step 2: Implement the SSE endpoint**

Wire up `GET /api/update-status`:
- Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Add the response object to a `sseClients` Set
- On `close` event, remove from Set
- Add helper `sendSSE(clients, data)` that writes `data: ${JSON.stringify(data)}\n\n` to all connected clients

- [ ] **Step 3: Wire up POST /api/update**

- Call `runUpdate(sseClients)` (don't await — run async so request can return immediately)
- Return `{ status: 'started' }`
- Prevent concurrent updates with a `let updateInProgress = false` flag

- [ ] **Step 4: Test the update cycle**

Start server, then in another terminal:
- `curl -X POST http://localhost:3851/api/update` — should return `{"status":"started"}`
- The RSS and EASA fetchers (which need no API keys) should successfully fetch and categorise posts
- Check `QC_Aviation_Complaints_data.json` — should have new posts with categories, entities, region fields

- [ ] **Step 5: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Server.mjs
git commit -m "feat: add update cycle orchestrator with SSE progress streaming and deduplication"
```

---

## Task 6: Query & Filter API Endpoints

**Files:**
- Modify: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs`

- [ ] **Step 1: Implement GET /api/complaints**

Parse query params: `category`, `region`, `source`, `dateFrom`, `dateTo`, `search`, `page` (default 1), `limit` (default 50).

1. Load archive (use cached in-memory copy refreshed on each update). **Important:** also scan for `QC_Aviation_Complaints_archive_*.json` files in the same directory and merge their posts into the query set, so yearly-archived posts remain searchable.
2. Filter posts:
   - `category`: match against `manualCategories || autoCategories` array (any match)
   - `region`: exact match on `region` field, or include `global` posts in all regions
   - `source`: exact match on `source` field
   - `dateFrom`/`dateTo`: filter on `date` field (ISO string comparison)
   - `search`: case-insensitive match on `title` + `body`
3. Sort by `date` descending (newest first)
4. Paginate: slice `(page-1)*limit` to `page*limit`
5. Return `{ total: filteredCount, page, limit, posts: paginatedPosts }`

- [ ] **Step 2: Implement GET /api/summary**

Parse query params: `days` (default 30), `region`.

1. Load archive, apply region filter if set
2. Filter to posts within the `days` window
3. Calculate and return:
   ```javascript
   {
     totalPosts: archive.metadata.totalPosts,
     lastUpdate: archive.metadata.lastUpdate,
     period: { days, from: dateFrom, to: dateTo },
     newSinceLastUpdate: countOfPostsWithFetchDate === lastUpdate,
     categoryBreakdown: { technology: { count, growth }, ... },  // count per category + % change vs previous period
     trendData: [ { date: '2026-03-01', technology: 5, airframe_manufacturer: 3, ... }, ... ],  // daily counts per category
     manufacturers: { "Boeing": { technology: 2, airframe_manufacturer: 15, ... }, ... },  // heatmap data
     clusters: [ { name: "PW1100G Reliability", entity: "PW1100G", count: 23, growth: 32, categories: ["engine_manufacturer"], topSource: "reddit", isOpportunity: true }, ... ],
     regionCounts: { apac: 412, emea: 389, americas: 671, middle_east: 198, africa: 177, global: 0 }
   }
   ```

The cluster detection logic:
- Group posts in the date window by their primary entity (first entity in the array)
- For each entity group with 5+ posts, create a cluster
- Calculate growth: compare count in current period vs same-length previous period
- Flag as `isOpportunity` if growth > 20%

- [ ] **Step 3: Implement POST /api/recategorise**

Parse body: `{ postId, categories }` where categories is an array of category keys.

1. Load archive
2. Find post by `id`
3. Set `post.manualCategories = categories`
4. Save archive
5. Return `{ status: 'ok', postId, categories }`

- [ ] **Step 4: Implement POST /api/manual-add**

Parse body: `{ source, title, body, url, categories, region }`

1. Load categories config
2. Create post object:
   ```javascript
   {
     id: `manual_${Date.now()}_${hashString(title)}`,
     source: source || 'manual',
     sourceDetail: source || 'Manual Entry',
     author: 'Manual Entry',
     date: new Date().toISOString(),
     title, body, url,
     autoCategories: categorisePost({ title, body }, config),
     manualCategories: categories && categories.length > 0 ? categories : null,
     sentiment: 'negative',
     region: region || 'global',
     entities: extractEntities({ title, body }, config),
     fetchDate: new Date().toISOString()
   }
   ```
3. Append to archive, save
4. Return `{ status: 'ok', post: newPost }`

- [ ] **Step 5: Test query endpoints**

After running an update to populate some data:
- `curl "http://localhost:3851/api/complaints?page=1&limit=5"` — should return paginated posts
- `curl "http://localhost:3851/api/summary?days=30"` — should return aggregated stats
- `curl -X POST -H "Content-Type: application/json" -d '{"source":"manual","title":"Test complaint","body":"Boeing 737 MAX quality issue","url":"","categories":[],"region":"americas"}' http://localhost:3851/api/manual-add` — should add a post

- [ ] **Step 6: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Server.mjs
git commit -m "feat: add query, summary, recategorise, and manual-add API endpoints"
```

---

## Task 7: Dashboard HTML — Layout Shell & Header

**Files:**
- Create: `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html`

- [ ] **Step 1: Create the dashboard HTML with full CSS and layout structure**

Create `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html` as a single-file HTML dashboard. Follow the exact branding and patterns from existing QC dashboards.

The file structure:
1. `<!DOCTYPE html>` + `<head>` with Chart.js CDN link, embedded `<style>` block
2. `<body>` with the Command Centre layout
3. Embedded `<script>` block at the bottom

**CSS to include** (all in a single `<style>` block):
- Root variables matching QC design system colours from spec Section 4.3
- Body: `background: #0a0e1a; color: #e0e0e0; font-family: Arial, sans-serif; margin: 0;`
- Sticky header: gradient background `linear-gradient(135deg, #0d1b2a 0%, #1b2a4a 100%)`, gold bottom border, flex layout
- Filter bar: below header, dark background, flex layout with dropdowns and Update button
- KPI cards row: 4 cards, flex layout, each with coloured left border
- Main body: two-column flex (60% left / 40% right)
- Left column: charts stacked vertically with card styling
- Right column: complaint feed with scrollable list
- Regional filter strip: bottom bar with clickable region buttons
- Feed items: left border coloured by sentiment, hover state, expandable
- Category tag pills: small rounded pills with category colour background at 20% opacity, text in category colour
- Modal overlay for manual add form
- Gold gradient button styles for primary actions
- Responsive: on screens < 1200px wide, stack columns vertically

**HTML structure:**
```html
<header>
  <div class="header-left">
    <img src="../Branding_Assets/QC_Logo_Small_241206.png" alt="QC" height="72">
    <div>
      <h1>Aviation Complaints Intelligence</h1>
      <span class="version">v1.0</span>
    </div>
  </div>
  <div class="header-right">
    <span id="lastUpdate" class="last-update">Last update: Never</span>
    <button id="btnExportCharts" class="btn-secondary">Export Charts</button>
    <button id="btnExportPDF" class="btn-secondary">Export PDF</button>
  </div>
</header>

<div class="filter-bar">
  <!-- Region multi-select dropdown -->
  <!-- Category multi-select dropdown -->
  <!-- Source multi-select dropdown -->
  <!-- Date from/to inputs -->
  <button id="btnUpdate" class="btn-primary">UPDATE</button>
</div>

<div class="kpi-row">
  <div class="kpi-card" style="border-left-color: #f44336">
    <div class="kpi-label">TOTAL COMPLAINTS</div>
    <div class="kpi-value" id="kpiTotal">0</div>
  </div>
  <!-- 3 more KPI cards: New, Trending, Opportunities -->
</div>

<div class="main-body">
  <div class="charts-column">
    <div class="chart-card">
      <div class="chart-header">
        <h3>Complaint Trends</h3>
        <div class="chart-toggles">
          <button class="toggle active" data-days="30">30d</button>
          <button class="toggle" data-days="60">60d</button>
          <button class="toggle" data-days="90">90d</button>
        </div>
      </div>
      <canvas id="trendChart"></canvas>
    </div>
    <div class="chart-card">
      <h3>Category Breakdown</h3>
      <canvas id="categoryChart"></canvas>
    </div>
    <div class="chart-card">
      <h3>Manufacturer Heatmap</h3>
      <div id="heatmapTable"></div>
    </div>
    <div class="chart-card">
      <h3>Top Complaint Clusters</h3>
      <div id="clustersContainer"></div>
    </div>
  </div>

  <div class="feed-column">
    <div class="feed-header">
      <h3>Live Complaint Feed</h3>
      <input type="text" id="feedSearch" placeholder="Search complaints...">
    </div>
    <div id="feedList" class="feed-list"></div>
    <button id="btnManualAdd" class="btn-secondary" style="width:100%;margin-top:8px;">+ Manual Add</button>
  </div>
</div>

<div class="region-strip">
  <!-- 5 region buttons + global count -->
</div>

<!-- Manual Add Modal -->
<div id="manualAddModal" class="modal-overlay" style="display:none;">
  <!-- Modal content with form fields -->
</div>

<!-- Update Progress Overlay -->
<div id="progressOverlay" class="modal-overlay" style="display:none;">
  <!-- Progress indicators for each source -->
</div>
```

Implement the filter dropdowns as custom multi-select components (styled `<div>` with checkboxes, toggled by clicking the dropdown button — same pattern used in other QC dashboards).

- [ ] **Step 2: Test the layout renders correctly**

Start the server and open `http://localhost:3851` in a browser. Verify:
- Header with QC logo, title, export buttons
- Filter bar with dropdowns and gold Update button
- 4 KPI cards in a row
- Two-column layout with chart placeholders left, empty feed right
- Regional filter strip at bottom
- All styling matches QC design system (dark navy background, gold accents, Arial font)

- [ ] **Step 3: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Dashboard.html
git commit -m "feat: add dashboard HTML with Command Centre layout, CSS, and structure"
```

---

## Task 8: Dashboard JavaScript — Data Loading & Feed Rendering

**Files:**
- Modify: `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html`

- [ ] **Step 1: Implement core JavaScript in the `<script>` block**

Add the following JavaScript functionality to the dashboard:

1. **State management:**
   ```javascript
   const STATE = {
     filters: { regions: [], categories: [], sources: [], dateFrom: '', dateTo: '', search: '' },
     summary: null,
     complaints: [],
     page: 1,
     limit: 50,
     totalComplaints: 0
   };
   ```

2. **`async loadSummary(days = 30)`** — fetches `/api/summary?days=${days}&region=${activeRegions}`, stores in `STATE.summary`, calls render functions

3. **`async loadComplaints()`** — fetches `/api/complaints` with current filter state as query params, stores in `STATE.complaints`, calls `renderFeed()`

4. **`async init()`** — called on DOMContentLoaded, loads summary + complaints, renders everything

5. **`renderKPIs(summary)`** — updates the 4 KPI card values from summary data

6. **`renderFeed(complaints)`** — generates HTML for each complaint in the feed list:
   - Source icon (SVG inline icons for reddit, rss, skytrax, pprune, easa, youtube, twitter, manual)
   - Relative timestamp (e.g., "2h ago", "3d ago") using a `timeAgo(dateString)` helper
   - Title (truncated to 100 chars)
   - Category tags as coloured pills (using colours from categories config fetched at init)
   - Sentiment dot
   - Click to expand: toggle a `.expanded` class showing full body, entities, link to source
   - Click category tag: show dropdown overlay with all 6 categories as checkboxes, save via `/api/recategorise`

7. **`renderRegionStrip(regionCounts)`** — renders the 5 region buttons with counts, handles click to toggle filter

8. **Filter dropdown handlers** — each dropdown toggles a checkbox list, on change updates `STATE.filters` and calls `loadComplaints()` + `loadSummary()`

9. **Feed search handler** — debounced input handler (300ms) that updates `STATE.filters.search` and reloads

10. **Pagination** — "Load More" button at bottom of feed, increments page and appends results

11. **Update button handler:**
    - POST to `/api/update`
    - Show progress overlay
    - Open SSE connection to `/api/update-status`
    - Update progress indicators as events arrive
    - On `complete` event, close SSE, hide overlay, reload all data

12. **Manual Add modal:**
    - Show/hide modal on button click
    - Form with: source (text input), title (text input), body (textarea), URL (text input), categories (checkbox grid), region (dropdown)
    - Submit: POST to `/api/manual-add`, close modal, reload feed

- [ ] **Step 2: Test feed rendering with data**

Run an update first (press Update button), then verify:
- KPI cards show correct counts
- Feed shows complaint posts with source icons, timestamps, category tags
- Search filters the feed
- Region buttons show counts and filter when clicked
- Click a post expands to show full details
- Manual Add modal opens, submits, and new post appears in feed

- [ ] **Step 3: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Dashboard.html
git commit -m "feat: add dashboard JavaScript — data loading, feed rendering, filters, SSE progress"
```

---

## Task 9: Dashboard Charts — Chart.js Visualisations

**Files:**
- Modify: `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html`

- [ ] **Step 1: Implement Chart.js visualisations**

Add chart rendering functions to the dashboard script:

1. **`renderTrendChart(trendData, days)`**
   - Chart.js line chart on `#trendChart` canvas
   - One dataset per category (6 lines), using category colours from spec
   - X-axis: dates. Y-axis: complaint count
   - Tooltips showing count per category per day
   - Toggle buttons (30/60/90d) destroy and recreate chart with new data window
   - Store chart instance in `STATE.trendChartInstance` for later destruction/export

2. **`renderCategoryChart(categoryBreakdown)`**
   - Chart.js horizontal bar chart on `#categoryChart` canvas
   - One bar per category, coloured by category colour
   - Add growth percentage as a label on each bar (e.g., "+18%")
   - Store instance in `STATE.categoryChartInstance`

3. **`renderHeatmap(manufacturers)`**
   - HTML table rendered into `#heatmapTable` (not a Chart.js chart — HTML table is better for heatmaps)
   - Rows: manufacturer names. Columns: 6 category labels
   - Cell background colour: interpolate from `#1a3a1a` (green, 0–5) through `#3a3a1a` (amber, 6–15) to `#3a1a1a` (red, 16+)
   - Cell text: complaint count number
   - Click handler on each cell: set category + manufacturer entity as filters, reload feed

4. **`renderClusters(clusters)`**
   - HTML cards rendered into `#clustersContainer`
   - Each card: cluster name (entity), post count, trend arrow (↑↓→), growth percentage, primary category tag, top source
   - Cards with `isOpportunity: true` get a gold border and a "Consulting Opportunity" badge
   - Click a cluster card: filter feed to that entity

5. **`renderAll()`** — master render function that calls all of the above from `STATE.summary`

- [ ] **Step 2: Implement chart period toggle**

Wire up the 30d/60d/90d toggle buttons:
- On click, add `.active` class to clicked button, remove from siblings
- Call `loadSummary(days)` which triggers `renderTrendChart` with new data

- [ ] **Step 3: Test all visualisations**

With data populated (after an update), verify in browser:
- Trend chart shows lines for each category over time
- Category bar chart shows bars with growth labels
- Heatmap table is colour-coded correctly
- Cluster cards display with opportunity badges where applicable
- Period toggle switches between 30/60/90 day views
- Clicking heatmap cells and cluster cards filters the feed

- [ ] **Step 4: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Dashboard.html
git commit -m "feat: add Chart.js trend lines, category bars, manufacturer heatmap, and cluster cards"
```

---

## Task 10: Export — Chart PNGs & PDF Report

**Files:**
- Modify: `Aviation_Tools/QC_Aviation_Complaints_Dashboard.html` (client-side export)
- Modify: `Aviation_Tools/QC_Aviation_Complaints_Server.mjs` (server-side PDF generation)

- [ ] **Step 1: Implement chart PNG export on the client**

Add function `exportCharts()` to the dashboard script:
- Collect all Chart.js instances: `trendChartInstance`, `categoryChartInstance`
- For each, call `.toBase64Image('image/png')` to get base64 PNG data
- For the heatmap (HTML table), use a simple approach: create a hidden canvas, draw the table data as a grid, export as PNG. Alternatively, use `html2canvas` from CDN — but to avoid extra dependencies, render a simplified version using Canvas 2D API.
- Create a zip file using a minimal inline implementation (or just download each image individually with `<a download>`)
- Trigger download for each PNG:
  ```javascript
  function downloadPNG(base64, filename) {
    const link = document.createElement('a');
    link.href = base64;
    link.download = filename;
    link.click();
  }
  ```
- Name files: `complaint_trends_30d.png`, `category_breakdown.png`, `manufacturer_heatmap.png`, `top_clusters.png`, `regional_distribution.png`

Wire to `#btnExportCharts` click handler.

- [ ] **Step 2: Implement PDF export on the client (send to server)**

Add function `async exportPDF()` to the dashboard script:
- Collect chart images as base64 (same as above)
- Collect current filter state
- POST to `/api/export-pdf` with body:
  ```json
  {
    "filters": { "region": [...], "category": [...], "dateFrom": "", "dateTo": "" },
    "charts": {
      "trends": "data:image/png;base64,...",
      "categories": "data:image/png;base64,...",
      "heatmap": "data:image/png;base64,..."
    }
  }
  ```
- Server returns DOCX file as binary — trigger download

Wire to `#btnExportPDF` click handler.

- [ ] **Step 3: Implement PDF generation on the server**

Add the `/api/export-pdf` handler to the server:

1. Parse request body (filters + chart base64 images)
2. Load archive, apply filters
3. Run cluster detection on filtered data
4. Generate markdown report string following the structure in spec Section 7.1:

   ```markdown
   ---
   title: "Aviation Complaints Intelligence Report"
   date: "19MAR2026"
   ---

   # Aviation Complaints Intelligence Report

   **Report Period:** {dateFrom} to {dateTo}
   **Generated:** {now}
   **Filters Applied:** {region}, {category}

   ## Executive Summary

   This report identifies {totalComplaints} aviation industry complaints...
   Top complaint clusters: ...
   Recommended consulting opportunities: ...

   ## Acronyms

   | Acronym | Definition |
   |---------|-----------|
   | AD | Airworthiness Directive |
   ...

   ## Complaint Trends

   ![Complaint Trends](trends.png)

   ## Category Analysis
   ...

   ## Manufacturer Analysis
   ...

   ## Regional Analysis
   ...

   ## Consulting Opportunities
   ...

   ## References
   ...
   ```

5. Save chart base64 images as temporary PNG files
6. Write markdown to a temporary file
7. Call pandoc:
   ```bash
   pandoc report.md -o report.docx --reference-doc=../Document_Publishing_Tools/reference_arial.docx
   ```
8. Read the generated DOCX, return as binary response with `Content-Disposition: attachment; filename="QC_Aviation_Complaints_Report_DDMMMYYYY.docx"`
9. Clean up temp files

- [ ] **Step 4: Test export functions**

- Click "Export Charts" — should download PNG files of each chart
- Click "Export PDF" — should download a DOCX file with the report content and embedded charts
- Open DOCX in Word — verify Arial font, QC formatting, charts visible

- [ ] **Step 5: Commit**

```bash
git add Aviation_Tools/QC_Aviation_Complaints_Dashboard.html Aviation_Tools/QC_Aviation_Complaints_Server.mjs
git commit -m "feat: add chart PNG export and PDF report generation via pandoc"
```

---

## Task 11: README & Final Integration

**Files:**
- Create: `Aviation_Tools/README_Aviation_Complaints.md`

- [ ] **Step 1: Create README**

Create `Aviation_Tools/README_Aviation_Complaints.md` with:

```markdown
# QC Aviation Complaints Intelligence Dashboard

## Overview
Aggregates aviation complaints from social media, forums, review platforms, safety databases, and news feeds. Auto-categorises into 6 taxonomy categories and flags consulting opportunities.

## Quick Start
1. Configure API keys in `QC_Aviation_Complaints_keys.json` (optional — RSS and EASA work without keys)
2. Start the server: `node QC_Aviation_Complaints_Server.mjs`
3. Open `http://localhost:3851` in your browser
4. Press UPDATE to fetch complaints from all enabled sources

## Data Sources
| Source | Status | API Key Required |
|--------|--------|-----------------|
| Aviation News RSS | Enabled | No |
| EASA ADs | Enabled | No |
| Skytrax | Enabled | No |
| PPRuNe | Enabled | No |
| Reddit | Enabled | Yes (free) |
| YouTube | Disabled | Yes (free) |
| X / Twitter | Disabled | Yes (paid) |
| FAA SDR | Stub | Manual download |
| NASA ASRS | Disabled | Manual download |
| TripAdvisor | Disabled | Fragile scraping |
| Airliners.net | Disabled | Fragile scraping |

## Configuration
- `QC_Aviation_Complaints_sources.json` — enable/disable sources, configure URLs and keywords
- `QC_Aviation_Complaints_categories.json` — tune auto-categorisation keyword weights
- `QC_Aviation_Complaints_keys.json` — API keys (not committed to git)

## Export
- **Export Charts** — downloads individual PNG images of each chart
- **Export PDF** — generates a DOCX report via pandoc (requires pandoc installed)

## Port
Runs on port 3851 (alongside existing QC tools on 3847, 3848, 3850)
```

- [ ] **Step 2: Add keys file to .gitignore**

Check if `.gitignore` exists in `Aviation_Tools/` or project root. Add `QC_Aviation_Complaints_keys.json` to it.

- [ ] **Step 3: Final integration test**

Full end-to-end test:
1. Start server: `node Aviation_Tools/QC_Aviation_Complaints_Server.mjs`
2. Open `http://localhost:3851`
3. Press UPDATE — verify progress overlay shows sources being fetched
4. After update completes:
   - KPI cards show correct totals
   - Trend chart renders with category lines
   - Category bar chart shows breakdown
   - Heatmap table is colour-coded
   - Cluster cards appear with opportunity badges
   - Feed shows posts with category tags
5. Test filters: click region button, select a category, search text
6. Test manual add: open modal, fill form, submit — post appears in feed
7. Test recategorise: click a category tag on a post, change it
8. Test export charts: download PNGs
9. Test export PDF: download DOCX, verify formatting

- [ ] **Step 4: Commit**

```bash
git add Aviation_Tools/README_Aviation_Complaints.md
git commit -m "feat: add README and complete Aviation Complaints Intelligence Dashboard"
```
