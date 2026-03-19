# QC Aviation Complaints Intelligence Dashboard

## Overview

Aggregates aviation complaints from social media, professional forums, review platforms, government safety databases, and news feeds. Auto-categorises into six taxonomy categories (Technology, Airframe Manufacturer, Engine Manufacturer, Airline Operations, Regulatory/Compliance, MRO/Maintenance) and flags trending complaint clusters as potential consulting opportunities.

## Quick Start

1. Configure API keys in `QC_Aviation_Complaints_keys.json` (optional — RSS, EASA, Skytrax, and PPRuNe work without keys)
2. Start the server:
   ```bash
   node QC_Aviation_Complaints_Server.mjs
   ```
3. Open `http://localhost:3851` in your browser
4. Press **UPDATE** to fetch complaints from all enabled sources

## Data Sources

| Source | Default Status | API Key Required | Notes |
|--------|---------------|-----------------|-------|
| Aviation News RSS | Enabled | No | FlightGlobal, AeroTime, ch-aviation, Aviation Week, Simple Flying, Australian Aviation, Airways |
| EASA ADs | Enabled | No | Airworthiness Directives RSS feed |
| Skytrax | Enabled | No | Airline review scraping (ratings ≤ 3) |
| PPRuNe | Enabled | No | Forum thread scraping |
| Reddit | Enabled | Yes (free) | Requires app registration at reddit.com/prefs/apps |
| YouTube | Disabled | Yes (free) | YouTube Data API v3 key |
| X / Twitter | Disabled | Yes (paid ~$100/mo) | API v2 Basic tier |
| FAA SDR | Stub | N/A | Manual CSV download — use Manual Add |
| NASA ASRS | Disabled | N/A | Manual CSV download — use Manual Add |
| TripAdvisor | Disabled | No | Fragile scraping — use cautiously |
| Airliners.net | Disabled | No | Fragile scraping — use cautiously |

## Configuration Files

| File | Purpose |
|------|---------|
| `QC_Aviation_Complaints_sources.json` | Enable/disable sources, configure URLs, keywords, rate limits |
| `QC_Aviation_Complaints_categories.json` | Tune auto-categorisation keyword weights, entity lists, airline-to-region mappings |
| `QC_Aviation_Complaints_keys.json` | API keys for Reddit, Twitter, YouTube (**not committed to git**) |
| `QC_Aviation_Complaints_data.json` | Master complaint archive (auto-managed) |

## Features

- **Command Centre layout** — KPI cards, trend charts, category breakdown, manufacturer heatmap, complaint feed
- **Auto-categorisation** — keyword-weighted scoring across 6 taxonomy categories with manual override
- **Entity extraction** — identifies manufacturers, airlines, aircraft types in complaint text
- **Region assignment** — auto-assigns APAC/EMEA/Americas/Middle East/Africa based on airline entities and source
- **Cluster detection** — groups complaints by entity, flags trending topics and consulting opportunities
- **Filtering** — by region, category, source, date range, and full-text search
- **Export Charts** — downloads Chart.js visualisations as PNG images for PowerPoint
- **Export PDF** — generates a DOCX report via pandoc with embedded charts and analysis

## Export Requirements

- **Chart PNGs:** No additional requirements — uses built-in Chart.js export
- **PDF/DOCX report:** Requires [pandoc](https://pandoc.org/installing.html) installed. Uses `../Document_Publishing_Tools/reference_arial.docx` as the reference template if available.

## Port

Runs on port **3851** (alongside existing QC tools: 3847, 3848, 3850).

## Architecture

```
QC_Aviation_Complaints_Server.mjs (Node.js, port 3851)
├── /                    → Serves dashboard HTML
├── /api/update          → POST: triggers source fetching + categorisation
├── /api/update-status   → GET (SSE): streams progress during update
├── /api/complaints      → GET: filtered/paginated complaint data
├── /api/summary         → GET: aggregated stats, trends, clusters
├── /api/recategorise    → POST: manual category override
├── /api/manual-add      → POST: add complaint manually
└── /api/export-pdf      → POST: generate DOCX report via pandoc
```
