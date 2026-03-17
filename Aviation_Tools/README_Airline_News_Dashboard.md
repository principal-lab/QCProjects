# QC Aviation — Airline Regional News Intelligence Dashboard

**Version:** 1.0 — 17MAR2026 **Author:** QC Aviation Pty Ltd

***

## Files

| File                                  | Purpose                                          |
|---------------------------------------|--------------------------------------------------|
| `QC_Airline_News_Dashboard.html`      | Dashboard (single self-contained file)           |
| `../Branding_Assets/QC_Logo_Small_241206.png` | QC Aviation logo (shared across tools)  |

***

## 1. Overview

The Airline Regional News Intelligence Dashboard aggregates real-time airline news from Google News RSS feeds across seven geographic regions. News is displayed on an interactive Leaflet map with a filterable feed panel, category tagging, and a full curation system for bookmarking, annotating, and exporting items of interest.

The dashboard also integrates with the Aircraft Market Dashboard via shared localStorage, allowing order-related news items to be pushed directly into the Market Dashboard's order database.

***

## 2. Running the Dashboard

The dashboard is a standalone HTML file. Simply double-click `QC_Airline_News_Dashboard.html` to open it in your default browser.

**Requirements:**

- Active internet connection (for RSS feeds, map tiles, and Leaflet CDN)
- Modern browser (Chrome, Edge, Firefox, or Safari)
- No server or build step required

**Note:** Unlike the Aircraft Market Dashboard, this dashboard does not use `fetch()` for local files and can be opened directly via the `file://` protocol.

***

## 3. Page Layout

### Header

- QC Aviation logo and title
- **Last refreshed** timestamp
- **Auto-refresh** dropdown (Off / 5 min / 15 min / 30 min)
- **Refresh** button — manually re-fetches feeds
- **Saved** button — opens the curation sidebar
- **Market Dashboard** button — opens the Aircraft Market Dashboard in a new tab

### Map Panel (upper section)

- Interactive Leaflet map with dark CartoDB tiles
- Seven colour-coded region polygons
- Hover a region to see its name and article count
- Click a region to load its news feed
- **All Regions** button (top-right of map) loads news from all seven regions

### Feed Panel (lower section)

- **Filter bar** with category toggle buttons and region indicator
- **News items** displayed in a scrollable list, newest first
- Each item shows: date, headline (linked to source), source name, region badge, category badges, and a bookmark star

***

## 4. Regions

| Region       | Colour  | Coverage                                                                 |
|--------------|---------|--------------------------------------------------------------------------|
| Australia    | Blue    | Qantas, Jetstar, Virgin Australia, Rex, Bonza                           |
| Oceania      | Teal    | Air New Zealand, Fiji Airways, Solomon Airlines, Pacific carriers        |
| SE Asia      | Gold    | Singapore Airlines, Cathay Pacific, AirAsia, Scoot, Hong Kong carriers  |
| East Asia    | Magenta | Air China, ANA, JAL, Korean Air, COMAC, Taiwan carriers                 |
| Central Asia | Cyan    | Air Astana, Uzbekistan Airways, FlyArystan                              |
| Middle East  | Orange  | Emirates, Qatar Airways, Etihad, Saudia, flynas                         |
| Europe       | Purple  | Ryanair, easyJet, Lufthansa, British Airways, Wizz Air                  |

***

## 5. Category Filters

News items are automatically tagged by keyword matching against headlines. Click any category button to toggle it on or off.

| Category           | Colour  | Example Keywords                                                |
|--------------------|---------|-----------------------------------------------------------------|
| Operations         | Blue    | fleet, maintenance, crew, pilot, schedule, capacity, codeshare  |
| Orders             | Green   | order, firm order, purchase, agreement, LOI, MOU, delivery      |
| Route Intelligence | Gold    | route, destination, frequency, hub, network, nonstop, inaugural |
| New Airlines       | Magenta | startup, new airline, AOC, first flight, maiden, commence       |
| Disruptions        | Red     | cancel, delay, suspend, ground, strike, disruption, emergency   |

Items may match multiple categories. Items matching no keywords remain visible at all times.

***

## 6. Using the Dashboard

### Browsing News

1. Click a **region polygon** on the map, or click **All Regions**
2. News items load in the feed panel below, sorted newest first
3. Use the **category buttons** in the toolbar to filter by topic
4. Click any **headline** to open the full article in a new tab
5. Click **Refresh** to re-fetch the latest headlines

### Bookmarking Items

There are three ways to bookmark a news item:

- **Star icon** — hover over a feed item and click the star on the right
- **Right-click** — right-click any feed item and select **Bookmark**
- **Context menu** — the right-click menu also allows adding tags and notes in one step (the item is auto-bookmarked first)

### Right-Click Context Menu

Right-click any news item in the feed to access:

| Action                          | Description                                              |
|---------------------------------|----------------------------------------------------------|
| **Bookmark**                    | Save the item to your bookmarks                          |
| **Add Tags**                    | Add comma-separated tags (auto-bookmarks if needed)      |
| **Add Notes**                   | Add a free-text note (auto-bookmarks if needed)          |
| **Push to Market Dashboard Orders** | Open the order form to push to the Market Dashboard |
| **Open Article**                | Open the source article in a new tab                     |

### Curation Sidebar

Click the **Saved** button in the header to open the curation sidebar. The sidebar provides:

- **Search** — filter saved items by keyword (searches titles and notes)
- **Region filter** — show only items from a specific region
- **Category filter** — show only items tagged with a specific category
- **Tag filter** — show only items with a specific user-defined tag
- **Edit** — click **Tags** or **Notes** on any saved item to update them
- **Push to Orders** — appears on items tagged with the Orders category
- **Delete** — remove individual bookmarks
- **Export CSV** — download all bookmarks as a CSV file
- **Export JSON** — download all bookmarks as a JSON file (re-importable)
- **Clear All** — delete all bookmarks (with confirmation)

### Auto-Refresh

Use the dropdown next to the Refresh button to set automatic feed refreshing:

| Setting | Behaviour                                         |
|---------|---------------------------------------------------|
| Off     | Manual refresh only (default)                     |
| 5 min   | Re-fetches feeds for the current selection every 5 minutes  |
| 15 min  | Re-fetches every 15 minutes                       |
| 30 min  | Re-fetches every 30 minutes                       |

The selected interval is saved in your browser and persists between sessions. A pulsing green border on the dropdown indicates auto-refresh is active.

***

## 7. Push to Market Dashboard Orders

When you spot an order-related headline, you can push it directly to the Aircraft Market Dashboard's order database:

1. **Right-click** the news item and select **Push to Market Dashboard Orders**
2. The form auto-populates fields by parsing the headline (OEM, aircraft type, quantity)
3. Review and edit the fields as needed:
   - Date (DDMMMYYYY)
   - Airline / Lessor
   - OEM (Airbus, Boeing, Embraer, COMAC, ATR)
   - Aircraft Type
   - Quantity
   - Status (Order / Cancellation)
   - Estimated Value (US$B)
   - Notes
4. Click **Push Order** to save

The order is written to `localStorage` under the key `qc_dashboard_local_orders`. When you next open the Aircraft Market Dashboard and click **Update**, the order will appear in the Orders table.

***

## 8. Cross-Dashboard Integration

| Direction                         | How                                                               |
|-----------------------------------|-------------------------------------------------------------------|
| News Dashboard → Market Dashboard | **Market Dashboard** button in header; **Push to Orders** action  |
| Market Dashboard → News Dashboard | Link in the **News Watch** tab's "About" section                  |

Both dashboards share order data via the `qc_dashboard_local_orders` localStorage key. Orders pushed from the News Dashboard appear automatically in the Market Dashboard after clicking Update.

***

## 9. Data Persistence

All user data is stored in the browser's `localStorage`. Nothing is sent to a server.

| localStorage Key          | Contents                                              |
|---------------------------|-------------------------------------------------------|
| `qc_news_bookmarks`      | Array of bookmark objects (title, link, tags, notes)  |
| `qc_news_tags`           | Array of previously used tag strings                  |
| `qc_news_autorefresh`    | Selected auto-refresh interval                        |
| `qc_dashboard_local_orders` | Shared order records (read by Market Dashboard)    |

**Important:** Clearing your browser data will delete all bookmarks and settings. Use **Export CSV** or **Export JSON** to back up your bookmarks.

***

## 10. Troubleshooting

| Problem                          | Cause                                    | Fix                                                   |
|----------------------------------|------------------------------------------|-------------------------------------------------------|
| Map shows grey tiles             | No internet or map tile CDN unavailable  | Check internet connection; refresh the page            |
| No news items load               | CORS proxy temporarily unavailable       | Click **Refresh**; try again in a few minutes          |
| "Unable to load news" message    | All feeds failed for the selected region | Check internet; click **Refresh**                      |
| Logo not showing                 | File opened from a different directory   | Open from the `Aviation_Tools` folder                  |
| Bookmarks disappeared            | Browser data cleared                     | Restore from a previously exported CSV or JSON file    |
| Pushed order not in Market Dashboard | Market Dashboard not refreshed        | Open Market Dashboard and click **Update**             |
| Category badges missing          | Headline does not match any keywords     | This is normal — not all headlines match categories    |
| Auto-refresh not working         | Dropdown set to Off                      | Select 5, 15, or 30 min from the dropdown             |

***

## 11. Technical Details

**Architecture:** Single monolithic HTML file with embedded CSS and JavaScript. No build step, no dependencies to install.

**External CDN dependencies:**

- Leaflet 1.9.4 (map rendering) — `unpkg.com`
- CartoDB Dark Matter tiles (map background) — `basemaps.cartocdn.com`

**RSS feeds:** Google News RSS via `api.allorigins.win` CORS proxy. One feed per region using aviation-specific search terms.

**Feed processing pipeline:**

1. Fetch RSS XML via CORS proxy
2. Parse with `DOMParser`
3. Extract title, link, publication date, and source
4. Deduplicate by normalised title (first 60 alphanumeric characters)
5. Sort by date descending, cap at 100 items per region
6. Cache results per region until manual or auto-refresh

***

## 12. Version History

| Version | Date      | Changes                                                                                                     |
|---------|-----------|-------------------------------------------------------------------------------------------------------------|
| 1.0     | 17MAR2026 | Initial release. 7-region map, RSS feeds, category filters, curation system, push-to-orders, cross-dashboard integration. |

***

*QC Aviation Pty Ltd — Aviation Consulting | Fleet Advisory | Market Intelligence*
