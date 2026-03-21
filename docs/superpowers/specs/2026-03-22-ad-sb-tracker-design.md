# QC AD/SB Intelligence Tracker — Design Specification

**Date:** 22Mar2026 **Version:** 1.0 **Status:** Approved

***

## 1. Executive Summary

A browser-based dashboard for tracking Airworthiness Directives (ADs) and Service Bulletins (SBs) from EASA, FAA, and CASA across 10 aircraft manufacturers. Built as a client-server application mirroring the QC Aviation Complaints Dashboard architecture — single-file Node.js backend, single-file HTML frontend, JSON file storage, Chart.js visualisations, and a cached seed dataset for immediate usability.

***

## 2. Architecture

### 2.1 Pattern

Single-file server pattern, identical to QC_Aviation_Complaints_Dashboard:

-   **Frontend:** `Aviation_Tools/QC_AD_SB_Dashboard.html` — embedded CSS/JS, Chart.js v4.4.7 (CDN)
-   **Backend:** `Aviation_Tools/QC_AD_SB_Server.mjs` — Node.js built-in modules only (http, https, fs, path)
-   **Port:** 3852 (next in the Aviation_Tools port range 3847–3851)
-   **Data:** JSON file storage, no external database

### 2.2 Files

| File                      | Purpose                                   |
|---------------------------|-------------------------------------------|
| `QC_AD_SB_Dashboard.html` | Frontend dashboard                        |
| `QC_AD_SB_Server.mjs`     | Backend server                            |
| `QC_AD_SB_data.json`      | Master archive (seed data + fetched data) |
| `QC_AD_SB_sources.json`   | Agency endpoint configuration             |
| `QC_AD_SB_types.json`     | Manufacturer/aircraft family mapping      |

### 2.3 Design System

Dark theme matching existing QC dashboards:

-   Background: `#0a0e1a` (primary), `#111827` (cards)
-   Accent: `#d4a843` (gold)
-   Text: `#e0e0e0` (primary), `#8fadc8` (secondary)
-   Font: Arial throughout
-   QC logo in header

***

## 3. Data Model

### 3.1 AD/SB Record Schema

```json
{
  "id": "easa_ad_2026-0041",
  "type": "AD",
  "agency": "easa",
  "number": "2026-0041",
  "manufacturer": "airbus",
  "family": "A320",
  "variant": "A320-214",
  "subject": "Wing Spar Attachment Fitting — Inspection",
  "summary": "Mandatory inspection of wing spar attachment fittings on A320 family aircraft...",
  "applicability": "Airbus A318, A319, A320, A321 — all serial numbers",
  "compliance": "Within 6 months of effective date",
  "effectiveDate": "2026-03-18",
  "publishDate": "2026-03-15",
  "urgency": "emergency",
  "referencedSBs": ["SB A320-57-1042"],
  "sourceUrl": "https://ad.easa.europa.eu/ad/2026-0041",
  "fetchDate": "2026-03-22T10:00:00Z"
}
```

### 3.2 Urgency Classification

-   `emergency` — Emergency ADs (compliance within days/weeks)
-   `standard` — Standard ADs (compliance within months)
-   `informational` — SBs and informational notices

### 3.3 Manufacturers and Aircraft Families

10 manufacturers, each with aircraft families at family level for filtering:

| Manufacturer Key | Label                  | Example Families                                                                                |
|------------------|------------------------|-------------------------------------------------------------------------------------------------|
| `airbus`         | Airbus                 | A220, A300, A310, A318, A319, A320, A321, A330, A340, A350, A380                                |
| `boeing`         | Boeing                 | 707, 717, 727, 737, 747, 757, 767, 777, 787                                                     |
| `atr`            | ATR                    | ATR 42, ATR 72                                                                                  |
| `embraer`        | Embraer                | ERJ 135/140/145, E170, E175, E190, E195, E2                                                     |
| `gulfstream`     | Gulfstream             | G280, G500, G550, G600, G650, G700                                                              |
| `bombardier`     | Bombardier             | CRJ, Challenger 300/350/600/650, Global 5000/5500/6000/6500/7500/8000                           |
| `dassault`       | Dassault Aviation      | Falcon 50, Falcon 900, Falcon 2000, Falcon 7X, Falcon 8X, Falcon 6X, Falcon 10X                 |
| `textron`        | Textron Aviation       | Citation (all variants), King Air, Beechcraft Baron/Bonanza, Cessna Caravan, Cessna 172/182/206 |
| `pilatus`        | Pilatus Aircraft       | PC-6, PC-7, PC-9, PC-12, PC-21, PC-24                                                           |
| `honda`          | Honda Aircraft Company | HondaJet, HondaJet Elite, HondaJet Elite S, HondaJet Elite II                                   |

### 3.4 Manufacturer Colour Palette

| Manufacturer | Colour                  |
|--------------|-------------------------|
| Airbus       | `#2196f3` (blue)        |
| Boeing       | `#ff9800` (orange)      |
| ATR          | `#4caf50` (green)       |
| Embraer      | `#9c27b0` (purple)      |
| Gulfstream   | `#00bcd4` (cyan)        |
| Bombardier   | `#e91e63` (pink)        |
| Dassault     | `#ff5722` (deep orange) |
| Textron      | `#795548` (brown)       |
| Pilatus      | `#607d8b` (blue-grey)   |
| Honda        | `#cddc39` (lime)        |

### 3.5 Agency Colour Palette

Distinct from manufacturer colours to avoid visual confusion:

| Agency | Colour                  |
|--------|-------------------------|
| EASA   | `#1565c0` (dark blue)   |
| FAA    | `#e65100` (dark orange) |
| CASA   | `#2e7d32` (dark green)  |

### 3.6 Data File Schema (`QC_AD_SB_data.json`)

```json
{
  "metadata": {
    "title": "AD/SB Intelligence Tracker",
    "lastUpdate": "2026-03-22T10:00:00Z",
    "totalRecords": 1685,
    "sources": "easa, faa, casa"
  },
  "directives": [ ...array of records per schema in 3.1... ]
}
```

### 3.7 Sources Config Schema (`QC_AD_SB_sources.json`)

```json
{
  "sources": {
    "easa": {
      "enabled": true,
      "label": "EASA",
      "baseUrl": "https://ad.easa.europa.eu",
      "searchPath": "/search/advanced",
      "rateLimitMs": 1000,
      "maxPages": 20
    },
    "faa": {
      "enabled": true,
      "label": "FAA",
      "baseUrl": "https://drs.faa.gov",
      "searchPath": "/browse/ADFRAWD/doctypeDetails",
      "emergencyPath": "/browse/ADFREAD/doctypeDetails",
      "rateLimitMs": 2000,
      "maxPages": 20
    },
    "casa": {
      "enabled": true,
      "label": "CASA",
      "baseUrl": "https://www.casa.gov.au",
      "dataFilesPath": "/aircraft/airworthiness/airworthiness-directives/data-files-all-airworthiness-directives",
      "searchFallbackPath": "/search-centre/airworthiness-directives",
      "rateLimitMs": 2000,
      "maxPages": 20
    }
  }
}
```

### 3.8 Types Config Schema (`QC_AD_SB_types.json`)

```json
{
  "airbus": {
    "label": "Airbus",
    "aliases": ["AIRBUS S.A.S.", "AIRBUS OPERATIONS", "AIRBUS DEFENCE"],
    "excludeAliases": ["AIRBUS HELICOPTERS"],
    "families": ["A220", "A300", "A310", "A318", "A319", "A320", "A321", "A330", "A340", "A350", "A380"]
  },
  "boeing": {
    "label": "Boeing",
    "aliases": ["THE BOEING COMPANY", "BOEING COMMERCIAL"],
    "families": ["707", "717", "727", "737", "747", "757", "767", "777", "787"]
  }
}
```

(Full mapping for all 10 manufacturers follows the same structure.)

***

## 4. Server API

### 4.1 Endpoints

| Endpoint             | Method    | Purpose                                                                                          |
|----------------------|-----------|--------------------------------------------------------------------------------------------------|
| `/`                  | GET       | Serve dashboard HTML                                                                             |
| `/api/summary`       | GET       | Aggregated statistics                                                                            |
| `/api/directives`    | GET       | Paginated/filtered directive list                                                                |
| `/api/update`        | POST      | Trigger fetch from all agencies                                                                  |
| `/api/update-status` | GET (SSE) | Stream progress during update                                                                    |
| `/api/manual-add`    | POST      | Add an SB entry manually (body: `{ number, manufacturer, family, subject, summary, sourceUrl }`) |

### 4.2 Filter Parameters

Shared across `/api/summary` and `/api/directives`:

| Parameter      | Type   | Description                                      |
|----------------|--------|--------------------------------------------------|
| `type`         | string | `AD`, `SB`, or both (comma-separated)            |
| `agency`       | string | `easa`, `faa`, `casa` (comma-separated)          |
| `manufacturer` | string | Manufacturer keys (comma-separated)              |
| `family`       | string | Aircraft family codes (comma-separated)          |
| `urgency`      | string | `emergency`, `standard`, `informational`         |
| `dateFrom`     | string | ISO date, inclusive lower bound                  |
| `dateTo`       | string | ISO date, inclusive upper bound                  |
| `search`       | string | Full-text search across number, subject, summary |
| `page`         | number | Page number (default 1)                          |
| `limit`        | number | Results per page (default 50)                    |

**Filter semantics on** `/api/summary`**:** All filters apply to the entire summary — counts, breakdowns, and trend data all reflect only the filtered subset. For example, filtering to "Boeing only" returns `byManufacturer` with only Boeing having a non-zero count, `byFamily` showing only Boeing families, and trend data for Boeing ADs only. This ensures the summary and feed are always in sync.

**Sort order:** Directives are always sorted by `publishDate` descending (newest first). Sort order is not parameterisable.

### 4.3 Summary Response

```json
{
  "totalADs": 1247,
  "totalSBs": 438,
  "emergencyADs": 23,
  "newADsThisMonth": 12,
  "newEmergencyThisMonth": 3,
  "byManufacturer": {
    "airbus": 412,
    "boeing": 378,
    "atr": 72,
    "embraer": 98,
    "gulfstream": 58,
    "bombardier": 121,
    "dassault": 44,
    "textron": 35,
    "pilatus": 22,
    "honda": 7
  },
  "byAgency": {
    "easa": 561,
    "faa": 437,
    "casa": 249
  },
  "byFamily": {
    "A320": 187,
    "737": 165,
    ...
  },
  "trend": [
    { "month": "2025-04", "adCount": 42, "sbCount": 8 },
    { "month": "2025-05", "adCount": 51, "sbCount": 12 },
    ...
  ],
  "lastUpdate": "2026-03-22T10:00:00Z"
}
```

### 4.4 Directives Response

```json
{
  "total": 1685,
  "page": 1,
  "limit": 50,
  "directives": [ ...array of AD/SB records per schema in 3.1... ]
}
```

***

## 5. Data Sources and Fetchers

### 5.1 EASA — Safety Publications Tool (HTML Scraping)

-   **URL:** `https://ad.easa.europa.eu/` (Safety Publications Tool)
-   **Method:** HTML scraping of search results and biweekly AD listing pages at `https://ad.easa.europa.eu/biweekly`
-   **Note:** EASA does not provide a documented public JSON API. The `ad.easa.europa.eu/api/ADs` endpoint referenced in some documentation is not a reliable public API. The Complaints Dashboard sources.json has the EASA API disabled with the note: "EASA API endpoints do not return standard RSS."
-   **Fields extracted:** AD number, type certificate holder, subject, applicability, publication date, effective date, PDF link
-   **Parsing:** HTML parsing of search result pages with regex extraction; individual AD detail pages for summary text
-   **Fallback:** EASA RSS feed at `https://www.easa.europa.eu/rss.xml` for new AD announcements as a lighter-weight supplement
-   **Rate limit:** 1-second delay between page requests

### 5.2 FAA — Dynamic Regulatory System (DRS)

-   **URL:** `https://drs.faa.gov/browse/ADFRAWD/doctypeDetails` (standard ADs), `https://drs.faa.gov/browse/ADFREAD/doctypeDetails` (emergency ADs)
-   **Note:** The legacy Regulatory and Guidance Library (RGL) at `rgl.faa.gov` has been migrated to the Dynamic Regulatory System (DRS). The DRS is the current authoritative source.
-   **Method:** HTML scraping of DRS search results pages
-   **Fields extracted:** AD number, product (manufacturer/type), subject, effective date, amendment details
-   **PDF links:** Each AD has a direct PDF link
-   **Parsing:** HTML parsing of search result tables with regex for field extraction
-   **Rate limit:** 2-second delay between page requests

### 5.3 CASA — Airworthiness Directives (Data Files + Scraping)

-   **Primary URL:** `https://www.casa.gov.au/aircraft/airworthiness/airworthiness-directives/data-files-all-airworthiness-directives` — CASA publishes downloadable data files for all current Australian ADs; this is the most reliable source
-   **Fallback URL:** `https://services.casa.gov.au/airworth/airwd/` — online AD search interface
-   **Method:** Primary: download and parse CASA data files (structured data, more reliable than scraping). Fallback: HTML scraping of search interface
-   **Fields extracted:** AD number, applicability, subject, effective date
-   **Parsing:** Data file parsing (CSV/structured format) or HTML table parsing with regex for manufacturer/type extraction
-   **Rate limit:** 2-second delay between page requests

### 5.4 Fetcher Resilience

-   Each agency fetcher runs independently with a 30-second timeout
-   A failed fetcher does not block other agencies from completing
-   SSE reports failures: `{ type: 'progress', agency: 'faa', status: 'error', message: 'Timeout' }`
-   Dashboard displays partial results with a warning banner indicating which agencies failed
-   HTML scraping is inherently fragile; the server logs detailed parsing errors for debugging when page structures change

### 5.5 Auto-Classification Pipeline

For each fetched AD:

1.  **Manufacturer extraction** — keyword match against manufacturer names and aliases (e.g., "Airbus", "AIRBUS S.A.S.", "Airbus Helicopters" excluded)
2.  **Family matching** — scan subject/applicability text against the types.json family list for the identified manufacturer
3.  **Variant extraction** — regex for specific model numbers (e.g., "A320-214", "737-8") stored in `variant` field
4.  **Urgency detection** — keywords: "emergency", "Emergency AD", "EAD"; also effective date within 30 days of publish date
5.  **SB reference extraction** — regex: `SB\s+[A-Z0-9][\w-]+` to find referenced Service Bulletin numbers
6.  **Deduplication** — by `id` field (agency + type + number hash)

### 5.6 Seed Data

The application ships with a pre-populated `QC_AD_SB_data.json` containing a curated seed dataset fetched during development. This ensures the dashboard is immediately functional without requiring a live update. The UPDATE button triggers a fresh fetch to supplement/update the seed data.

***

## 6. Frontend Layout

### 6.1 Structure (60/40 Split)

Mirroring QC_Aviation_Complaints_Dashboard:

```
┌──────────────────────────────────────────────────────┐
│ HEADER: QC logo | AD/SB Intelligence Tracker | Last update timestamp | UPDATE│
├──────────────────────────────────────────────────────┤
│ FILTER BAR: Type | Agency | Manufacturer | Family |  │
│             Urgency | Date Range                     │
├──────────────────────────────────────────────────────┤
│ KPI: Total ADs | Total SBs | Emergency ADs | Mfrs   │
├───────────────────────────┬──────────────────────────┤
│ CHARTS (60%)              │ FEED (40%)               │
│ ┌───────────────────────┐ │ ┌──────────────────────┐ │
│ │ AD Issuance Trend     │ │ │ Search | + Add SB    │ │
│ │ (bar, 6M/1Y/ALL)      │ │ ├──────────────────────┤ │
│ └───────────────────────┘ │ │ AD item (collapsed)  │ │
│ ┌───────────────────────┐ │ │ AD item (expanded)   │ │
│ │ ADs by Manufacturer   │ │ │  → summary           │ │
│ │ (horiz bar, all 10)   │ │ │  → applicability     │ │
│ │ Click to filter →     │ │ │  → compliance        │ │
│ └───────────────────────┘ │ │  → referenced SBs    │ │
│ ┌───────────┬───────────┐ │ │  → source link       │ │
│ │ ADs by    │ ADs by    │ │ │ SB item (collapsed)  │ │
│ │ Agency    │ Aircraft  │ │ │ AD item (collapsed)  │ │
│ │ (doughnut)│ Family    │ │ │ ...                  │ │
│ │           │ (vert bar)│ │ │ [Load More]          │ │
│ └───────────┴───────────┘ │ └──────────────────────┘ │
└───────────────────────────┴──────────────────────────┘
```

### 6.2 KPI Cards

4 cards in a horizontal row:

| Card          | Value       | Subtitle                       |
|---------------|-------------|--------------------------------|
| Total ADs     | Count       | "↑ X new ADs this month"       |
| Total SBs     | Count       | "Referenced + Manual"          |
| Emergency ADs | Count (red) | "↑ X new emergency this month" |
| Manufacturers | 10          | "Tracked"                      |

### 6.3 Charts (Chart.js)

**Chart 1 — AD Issuance Trend:**

-   Type: bar chart
-   X-axis: months
-   Y-axis: AD count
-   Toggle: 6M / 1Y / ALL
-   Colour: `#2196f3`

**Chart 2 — ADs by Manufacturer:**

-   Type: horizontal bar chart
-   All 10 manufacturers shown individually, sorted by count descending
-   Each bar uses the manufacturer's assigned colour
-   **Click interaction:** clicking a bar filters the feed to that manufacturer (toggle on/off), syncs with Manufacturer filter dropdown

**Chart 3 — ADs by Agency:**

-   Type: doughnut chart
-   3 segments: EASA (blue), FAA (orange), CASA (green)
-   Centre label: total AD count
-   **Click interaction:** clicking a segment filters the feed to that agency

**Chart 4 — ADs by Aircraft Family:**

-   Type: vertical bar chart
-   Top 8 families by AD count
-   Bar colour matches the parent manufacturer's colour
-   Click interaction: filters feed to that family

### 6.4 Feed

Scrollable list of AD/SB records, sorted by date descending (newest first).

**Collapsed state:**

-   Agency + AD/SB number + urgency badge (if emergency)
-   Date (DDMMMYYYY format)
-   Subject line
-   Tags: manufacturer, family, AD/SB type

**Expanded state (click to toggle):**

-   All collapsed fields plus:
-   Summary text
-   Applicability details
-   Compliance timeframe
-   Referenced SBs (as clickable links to filter)
-   Source URL link ("View Source at [agency] →")

**Visual coding:**

-   Left border colour: red for emergency, agency colour for standard ADs, gold for SBs
-   Emergency badge: red "EMERGENCY" label
-   SB source label: "REF" (extracted from AD) or "MANUAL" (user-added)

### 6.5 Filter Dropdowns

Multi-select checkboxes (matching Complaints Dashboard pattern):

-   **Type:** AD, SB
-   **Agency:** EASA, FAA, CASA
-   **Manufacturer:** All 10
-   **Family:** Dynamic list based on selected manufacturer(s)
-   **Urgency:** Emergency, Standard, Informational
-   **Date range:** From/To date pickers

Filter count badges shown on each dropdown button. Changing any filter triggers reload of both summary and directives.

### 6.6 Additional Features

-   **Feed search** — debounced full-text search (300ms)
-   **+ Add SB** — modal form for manually adding SB entries (number, manufacturer, family, subject, summary, source URL)
-   **Export Charts** — ZIP download of chart PNGs
-   **Load More** — pagination button at bottom of feed
-   **UPDATE** — triggers SSE-based live fetch with progress indicators

***

## 7. Update Flow

Identical SSE pattern to Complaints Dashboard:

1.  User clicks UPDATE
2.  Dashboard opens `EventSource('/api/update-status')`
3.  Sends `POST /api/update`
4.  Server fetches each agency sequentially:
    -   SSE: `{ type: 'progress', agency: 'easa', status: 'fetching', completed: 0, total: 3 }`
    -   Fetches, parses, deduplicates, classifies
    -   SSE: `{ type: 'progress', agency: 'easa', status: 'complete', newCount: 47 }`
5.  After all agencies: `{ type: 'complete', totalNew: 89, totalArchive: 1685 }`
6.  Dashboard auto-refreshes all visualisations

***

## 8. Constraints and Non-Goals

-   **No OEM portal integration** — SBs are only captured via AD references or manual entry
-   **No PDF parsing** — AD summaries come from the HTML/API text, not from downloading and parsing AD PDFs
-   **No authentication** — local tool, no login required
-   **No database** — JSON file storage only
-   **No npm dependencies** — Node.js built-in modules only
-   **Single-user** — no concurrent access handling required

***

## 9. Success Criteria

1.  Dashboard loads immediately with seed data (no update required)
2.  All 10 manufacturers shown in the ADs by Manufacturer chart with individual bars
3.  Filters work across all five dimensions (type, agency, manufacturer, family, urgency)
4.  Click-to-expand shows summary, applicability, compliance, referenced SBs, and source link
5.  Chart click-to-filter works on manufacturer bar chart, agency doughnut, and family bar chart
6.  UPDATE button fetches live data from EASA, FAA, and CASA with SSE progress
7.  Manual SB entry via modal form
8.  Visual consistency with existing QC dashboard suite (dark theme, gold accents, Arial font)
