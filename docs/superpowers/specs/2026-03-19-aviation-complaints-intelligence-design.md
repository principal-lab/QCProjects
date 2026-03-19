# QC Aviation Complaints Intelligence Dashboard — Design Specification

**Date:** 19MAR2026
**Status:** Approved
**Author:** QC Aviation / Claude Code

---

## 1. Executive Summary

The Aviation Complaints Intelligence Dashboard is a web-based monitoring tool that aggregates complaints and negative sentiment from across the aviation community — social media, professional forums, review platforms, government safety databases, and news feeds. It auto-categorises complaints into six taxonomy categories, builds a searchable archive over time, and flags trending complaint clusters as potential consulting opportunities. The dashboard serves dual purposes: internal daily monitoring and client-facing export (PDF reports and presentation-ready chart images).

---

## 2. Goals & Success Criteria

- **Primary goal:** Surface aviation industry pain points that represent consulting or advisory opportunities for QC Aviation
- **Secondary goal:** Provide evidence-based, exportable intelligence for client pitches
- **Success criteria:**
  - Dashboard loads and displays archived complaints with filtering in under 2 seconds
  - Update cycle fetches from all enabled sources and categorises results within 2–3 minutes
  - Auto-categorisation achieves >70% accuracy (measured by manual override rate)
  - PDF export produces a client-ready report matching QC document standards

---

## 3. Architecture

### 3.1 System Components

| Component | File | Purpose |
|-----------|------|---------|
| Dashboard | `QC_Aviation_Complaints_Dashboard.html` | Single-file HTML dashboard with embedded CSS/JS, Chart.js visualisations |
| Server | `QC_Aviation_Complaints_Server.mjs` | Node.js server (port 3851). API endpoints, source fetching, categorisation, export |
| Archive | `QC_Aviation_Complaints_data.json` | Master complaint archive with metadata and posts array |
| Categories | `QC_Aviation_Complaints_categories.json` | Keyword dictionaries and weights for auto-categorisation |
| Sources | `QC_Aviation_Complaints_sources.json` | Source configuration: URLs, subreddits, enabled/disabled flags |
| API Keys | `QC_Aviation_Complaints_keys.json` | API keys for Reddit, X, YouTube (gitignored) |

All files reside in `Aviation_Tools/`.

### 3.2 Server API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Serve dashboard HTML |
| `/api/update` | POST | Trigger fetch from all enabled sources |
| `/api/update-status` | GET (SSE) | Stream real-time progress during fetch cycle |
| `/api/complaints` | GET | Return filtered/paginated complaint data. Query params: `category`, `region`, `source`, `dateFrom`, `dateTo`, `search`, `page`, `limit` |
| `/api/summary` | GET | Return aggregated stats for charts (trends, category counts, cluster data). Query params: `days` (30/60/90), `region` |
| `/api/recategorise` | POST | Accept manual category override for a post. Body: `{ postId, categories }` |
| `/api/export-pdf` | POST | Generate markdown report, run pandoc, return DOCX file. Body: `{ region, category, dateFrom, dateTo }` |
| `/api/manual-add` | POST | Add a manually entered post to the archive. Body: `{ source, title, body, url, categories, region }` |

### 3.3 Data Flow — Update Cycle

1. User presses **Update** button in dashboard
2. Dashboard sends `POST /api/update` and opens SSE connection to `/api/update-status`
3. Server reads `_sources.json`, iterates enabled sources sequentially with staggered timing
4. For each source:
   - Fetch raw data (API call, RSS parse, or web scrape)
   - Normalise into standard post schema
   - Deduplicate against existing archive by post ID
   - Run auto-categorisation engine on new posts
   - Append to archive
   - Send progress event via SSE ("Fetching Reddit... 3/7 sources complete")
5. Server saves updated archive to `_data.json`
6. SSE sends completion event; dashboard refreshes all visualisations

### 3.4 Archive Schema

```json
{
  "metadata": {
    "title": "Aviation Complaints Intelligence",
    "lastUpdate": "2026-03-19T15:30:00Z",
    "totalPosts": 1847,
    "sources": "Reddit, X, PPRuNe, Skytrax, ASRS, FAA, EASA, RSS, YouTube"
  },
  "posts": [
    {
      "id": "reddit_abc123",
      "source": "reddit",
      "sourceDetail": "r/aviation",
      "author": "username",
      "date": "2026-03-15T08:22:00Z",
      "title": "Third PW1100G engine issue this month",
      "body": "Full post text...",
      "url": "https://reddit.com/r/aviation/...",
      "autoCategories": ["engine_manufacturer", "mro_maintenance"],
      "manualCategories": null,
      "sentiment": "negative",
      "region": "apac",
      "entities": ["Pratt & Whitney", "PW1100G", "IndiGo"],
      "fetchDate": "2026-03-19T15:30:00Z"
    }
  ]
}
```

**Yearly archive split:** When `posts` array exceeds 10,000 entries, server moves posts from the oldest complete year to `QC_Aviation_Complaints_archive_YYYY.json`. The main file retains the current year. Server API queries across all archive files transparently.

---

## 4. Dashboard Layout — Command Centre

### 4.1 Overall Structure

```
┌─────────────────────────────────────────────────────────┐
│  QC Logo  │  Aviation Complaints Intelligence  │ UPDATE │
│           │  Filters: Region|Category|Source|Date       │
├─────────────────────────────────────────────────────────┤
│ [Total: 1847] [New: +127] [Trending: 12] [Opps: 5]    │
├──────────────────────────┬──────────────────────────────┤
│                          │                              │
│  Complaint Trends (line) │  Live Complaint Feed         │
│  30/60/90 day toggle     │  - Source icon + timestamp   │
│                          │  - Title / excerpt           │
│  Category Breakdown      │  - Category tags (clickable) │
│  (horizontal bar)        │  - Sentiment indicator       │
│                          │  - Click to expand           │
│  Manufacturer Heatmap    │  - Search bar at top         │
│  (table, colour-coded)   │                              │
│                          │  Manual Add button           │
│  Top Complaint Clusters  │                              │
│  (ranked cards)          │                              │
│                          │                              │
├──────────────────────────┴──────────────────────────────┤
│  Regional Filter: [APAC:412] [EMEA:389] [Americas:671] │
│                   [Middle East:198] [Africa:177]        │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Component Details

**Header bar:**
- Sticky. QC logo (72px) + title left, filter dropdowns + Update button right
- QC gold gradient on Update button, gold bottom border
- Filter dropdowns: Region (multi-select), Category (multi-select), Source (multi-select), Date range (from/to date pickers)

**KPI summary cards (4):**
- Total complaints in archive
- New complaints since last update (with green/red delta arrow)
- Trending topics count (clusters with >20% monthly growth)
- Consulting opportunities flagged (clusters crossing configurable threshold)
- Each card has a coloured left border (red, orange, green, blue)

**Complaint Trends — line chart:**
- Chart.js line chart, one line per taxonomy category (6 lines, colour-coded)
- Toggle buttons: 30 / 60 / 90 days
- Hoverable tooltips showing post count per day per category
- Y-axis: complaint count. X-axis: date

**Category Breakdown — horizontal bar chart:**
- One bar per taxonomy category
- Primary bar: total volume
- Secondary overlay bar or label: growth/decline percentage (last 30 days)

**Manufacturer Heatmap — colour-coded table:**
- Rows: manufacturers (Boeing, Airbus, Embraer, ATR, COMAC, Pratt & Whitney, Rolls-Royce, CFM, GE Aerospace)
- Columns: the 6 taxonomy categories
- Cells colour-coded: green (0–5 complaints) → amber (6–15) → red (16+)
- Click a cell to filter the complaint feed to that manufacturer + category intersection

**Top Complaint Clusters — ranked cards:**
- Auto-detected clusters of posts sharing entities + categories
- Each card shows: cluster name, post count, trend direction (↑/↓/→), percentage change, primary category tag, top source
- Clusters with >20% growth highlighted with gold border ("Consulting Opportunity")

**Live Complaint Feed (right column, 40%):**
- Scrollable list, newest first
- Each post: source icon, relative timestamp, title/excerpt (truncated to ~100 chars), category tags (colour-coded pills), sentiment dot (red/amber/green)
- Click post to expand: full text, link to original source, entity list, fetch date
- Click category tag to override (dropdown with all 6 categories, multi-select)
- Search bar at top: full-text filtering across title + body
- "Manual Add" button: opens modal form with fields for source, title, body, URL, categories (multi-select), region (dropdown)

**Regional filter strip (bottom):**
- 5 clickable region buttons: APAC, EMEA, Americas, Middle East, Africa
- Each shows complaint count
- Click to filter entire dashboard; click again to deselect
- Multi-select supported (e.g., APAC + Middle East)

### 4.3 Branding & Styling

Consistent with existing QC Aviation Tools design system:

- Dark background: `#0a0e1a`
- Card background: `#111827`
- Primary text: `#e0e0e0`
- Secondary text: `#8fadc8`
- Accent (QC Gold): `#d4a843`
- Category colours: Technology `#2196f3`, Airframe Mfr `#ff9800`, Engine Mfr `#f44336`, Airline Ops `#4caf50`, Regulatory `#9c27b0`, MRO `#d4a843`
- Font: Arial, sans-serif exclusively
- Header: sticky, gradient background, gold bottom border
- Buttons: gold gradient for primary actions, outline for secondary
- Chart.js v4.4.7 from CDN

---

## 5. Data Sources

### 5.1 Tier 1 — Reliable, Free or Low-Cost

| Source | Method | Auth | Rate Limits | Data Extracted |
|--------|--------|------|-------------|----------------|
| **Reddit** | OAuth2 API | Free app registration | 100 req/min | Posts + comments from configured subreddits (r/aviation, r/flying, r/airlines, r/boeing, r/MRO). Search by keywords |
| **Aviation news RSS** | RSS/Atom feed parsing | None | N/A | Articles from FlightGlobal, AeroTime, ch-aviation, Aviation Week, Simple Flying. Filter for complaint-related keywords |
| **FAA SDRs** | Public data download (CSV/JSON) | None | N/A | Service Difficulty Reports — official maintenance complaints with aircraft type, system, description |
| **EASA Safety Pubs** | RSS feed | None | N/A | Airworthiness Directives, Safety Information Bulletins |
| **NASA ASRS** | Database search + CSV export | None | N/A | Voluntary safety reports, searchable by keyword |

### 5.2 Tier 2 — Paid API or Scraping

| Source | Method | Auth | Rate Limits | Data Extracted |
|--------|--------|------|-------------|----------------|
| **X / Twitter** | API v2 Basic | ~$100/month | 10,000 tweets/month | Aviation hashtags, airline complaint keywords. Fallback: Nitter RSS proxies (free, unreliable) |
| **Skytrax** | Server-side web scrape | None (public) | Self-imposed: 1 req/2s | Airline reviews: rating, title, body, airline, date |
| **TripAdvisor** | Server-side web scrape | None (public) | Self-imposed: 1 req/2s | Airline reviews: rating, title, body, route |

### 5.3 Tier 3 — Best-Effort

| Source | Method | Auth | Rate Limits | Data Extracted |
|--------|--------|------|-------------|----------------|
| **PPRuNe** | Server-side web scrape | None (public) | Self-imposed: 1 req/3s | Forum thread titles + post bodies from Rumours & News, Tech Log |
| **Airliners.net** | Server-side web scrape | None (public) | Self-imposed: 1 req/3s | Forum posts from General Aviation, Technical Operations |
| **YouTube** | Data API v3 | Free (10k units/day) | ~100 comment fetches/day | Comments from aviation channels (Mentour Pilot, blancolirio, etc.) |
| **LinkedIn** | Manual entry only | N/A | N/A | User pastes content via Manual Add form |

### 5.4 Source Configuration

Each source is a pluggable module. `_sources.json` structure:

```json
{
  "reddit": {
    "enabled": true,
    "subreddits": ["aviation", "flying", "airlines", "boeing", "MRO"],
    "keywords": ["complaint", "issue", "problem", "failure", "broken", "unsafe"],
    "maxPostsPerFetch": 100
  },
  "rss": {
    "enabled": true,
    "feeds": [
      { "name": "FlightGlobal", "url": "https://..." },
      { "name": "AeroTime", "url": "https://..." }
    ],
    "keywords": ["complaint", "grounding", "recall", "AD", "incident"]
  }
}
```

Failed sources do not block the update cycle. Errors are logged and reported in the SSE progress stream.

---

## 6. Auto-Categorisation Engine

### 6.1 Keyword-Weighted Scoring

Each taxonomy category has a dictionary of keywords/phrases with integer weights in `_categories.json`:

```json
{
  "technology": {
    "label": "Technology",
    "colour": "#2196f3",
    "keywords": {
      "app crash": 10, "software": 8, "FMS": 9, "ACARS": 8,
      "booking system": 7, "wifi": 6, "avionics": 9, "EFB": 8,
      "digital": 5, "IT system": 7, "check-in": 6, "automation": 7
    }
  },
  "airframe_manufacturer": {
    "label": "Airframe Manufacturer",
    "colour": "#ff9800",
    "keywords": {
      "Boeing": 9, "Airbus": 9, "Embraer": 9, "ATR": 9,
      "COMAC": 9, "fuselage": 8, "door plug": 10, "structural": 8,
      "737 MAX": 10, "A220": 9, "787": 9, "quality control": 7
    }
  },
  "engine_manufacturer": {
    "label": "Engine Manufacturer",
    "colour": "#f44336",
    "keywords": {
      "Pratt & Whitney": 10, "PW1100G": 10, "Rolls-Royce": 9,
      "CFM": 9, "LEAP": 9, "GE Aerospace": 9, "Trent": 9,
      "engine failure": 10, "compressor": 8, "turbine blade": 9
    }
  },
  "airline_operations": {
    "label": "Airline Operations",
    "colour": "#4caf50",
    "keywords": {
      "delay": 7, "cancellation": 8, "baggage": 7, "customer service": 8,
      "overbooked": 9, "refund": 7, "stranded": 9, "safety concern": 9
    }
  },
  "regulatory": {
    "label": "Regulatory / Compliance",
    "colour": "#9c27b0",
    "keywords": {
      "FAA": 7, "EASA": 7, "CASA": 7, "airworthiness directive": 10,
      "certification": 8, "audit": 7, "non-compliance": 10, "grounding": 9
    }
  },
  "mro_maintenance": {
    "label": "MRO / Maintenance",
    "colour": "#d4a843",
    "keywords": {
      "MRO": 10, "maintenance": 7, "parts shortage": 10, "AOG": 10,
      "turnaround time": 8, "inspection": 7, "repair station": 8,
      "corrosion": 9, "fleet grounding": 10
    }
  }
}
```

### 6.2 Scoring Logic

1. Concatenate post title + body, convert to lowercase
2. For each category, scan for all keyword matches (case-insensitive, whole-word where practical)
3. Sum weights per category
4. Assign all categories scoring above threshold (default: 15 points)
5. If no category scores above threshold, tag as `uncategorised`
6. Posts can have multiple categories

### 6.3 Entity Extraction

A secondary dictionary maps specific names to entity records:

- **Airframe OEMs:** Boeing, Airbus, Embraer, ATR, COMAC, Bombardier, Mitsubishi
- **Engine OEMs:** Pratt & Whitney, Rolls-Royce, CFM International, GE Aerospace
- **Airlines:** configurable list, initially top 50 global airlines + regional focus airlines
- **Aircraft types:** 737, 787, A320, A220, A350, E-Jet, ATR 72, etc.

Matched entities stored in post's `entities` array.

### 6.4 Manual Override

- `manualCategories` field on each post, initially `null`
- When user clicks a category tag in the feed and changes it, `manualCategories` is set
- `autoCategories` is preserved for reference
- Dashboard always displays `manualCategories` if not null, otherwise `autoCategories`

### 6.5 Cluster Detection

After each update:
1. Group posts by shared entities + categories within a 30-day rolling window
2. Clusters with 5+ posts are flagged as "trending topics"
3. Compare cluster size to previous 30-day window
4. Clusters with >20% growth are flagged as "consulting opportunities"
5. Cluster data served via `/api/summary` endpoint

---

## 7. Export & Reporting

### 7.1 PDF Report

Triggered by "Export PDF" button. Server generates a markdown document and converts via pandoc using `Document_Publishing_Tools/reference_arial.docx`.

**Report structure:**
1. Cover page — title, date range, QC branding
2. Executive summary — top 5 clusters, highest-growth topics, recommended consulting opportunities (conclusion first)
3. Acronyms table — auto-generated from content
4. Complaint trends — 30/60/90 day charts embedded as PNG
5. Category analysis — per-category breakdown with volume, trend, notable posts
6. Manufacturer analysis — heatmap as formatted table, top entities
7. Regional analysis — complaint distribution
8. Consulting opportunities — flagged clusters with evidence excerpts
9. References — APA 7th edition, with footnotes per CLAUDE.md conventions

Active dashboard filters (region, category, date range) are applied to the export.

### 7.2 Chart Export

"Export Charts" button renders each Chart.js canvas via `.toBase64Image()`, packages as individual PNGs in a zip:
- `complaint_trends_30d.png`
- `category_breakdown.png`
- `manufacturer_heatmap.png`
- `top_clusters.png`
- `regional_distribution.png`

Named descriptively for drag-and-drop into PowerPoint.

---

## 8. Configuration Files

### 8.1 Sources — `QC_Aviation_Complaints_sources.json`

Per-source configuration: enabled flag, URLs/subreddits/channels, keyword filters, max items per fetch, rate limit settings.

### 8.2 Categories — `QC_Aviation_Complaints_categories.json`

Keyword dictionaries with weights per category. Editable to tune auto-categorisation over time.

### 8.3 API Keys — `QC_Aviation_Complaints_keys.json` (gitignored)

```json
{
  "reddit": { "clientId": "", "clientSecret": "", "userAgent": "" },
  "twitter": { "bearerToken": "" },
  "youtube": { "apiKey": "" }
}
```

---

## 9. Technical Constraints & Dependencies

- **Runtime:** Node.js (built-in `http`, `https`, `fs` modules only for server core)
- **CDN dependencies:** Chart.js v4.4.7
- **No npm packages required** for core functionality (web scraping uses built-in `https` + regex/string parsing)
- **Optional:** `pandoc` + `reference_arial.docx` for PDF export (already available in user's environment)
- **Port:** 3851 (consistent with existing Aviation_Tools port range: 3847, 3848, 3850)
- **Storage:** JSON files, no database
- **Browser:** Modern browsers (Chrome, Edge, Firefox). No IE support needed.

---

## 10. File Inventory

All files in `Aviation_Tools/`:

| File | Purpose |
|------|---------|
| `QC_Aviation_Complaints_Dashboard.html` | Single-file HTML dashboard |
| `QC_Aviation_Complaints_Server.mjs` | Node.js server |
| `QC_Aviation_Complaints_data.json` | Master complaint archive |
| `QC_Aviation_Complaints_categories.json` | Category keyword dictionaries |
| `QC_Aviation_Complaints_sources.json` | Source configuration |
| `QC_Aviation_Complaints_keys.json` | API keys (gitignored) |
| `README_Aviation_Complaints.md` | Deployment and usage guide |
