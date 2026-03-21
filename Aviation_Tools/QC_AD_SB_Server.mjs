/**
 * QC AD/SB Intelligence Tracker — Server
 * Version 1.0 — skeleton with static file serving and seed data
 *
 * Run with: node QC_AD_SB_Server.mjs
 *
 * This server:
 * 1. Serves the dashboard files on port 3852
 * 2. Provides cached access to AD/SB data, sources, and directive types
 * 3. SSE endpoint for broadcasting update progress to connected clients
 *
 * Tasks 3-6 will add API routes and scraping logic to this skeleton.
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT        = 3852;
const DATA_FILE   = path.join(__dirname, 'QC_AD_SB_data.json');
const SOURCES_FILE = path.join(__dirname, 'QC_AD_SB_sources.json');
const TYPES_FILE  = path.join(__dirname, 'QC_AD_SB_types.json');

// ===== MIME TYPES =====
const MIME = {
    '.html': 'text/html',
    '.json': 'application/json',
    '.js':   'application/javascript',
    '.mjs':  'application/javascript',
    '.css':  'text/css',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon'
};

// ===== SSE CLIENT TRACKING =====
const sseClients = new Set();

// ===== HELPER: HTTPS GET (follows redirects up to 3 levels) =====
function httpsGet(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timeout fetching ' + url));
        }, timeout);

        const req = https.get(url, { headers: { 'User-Agent': 'QC-AD-SB-Tracker/1.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                clearTimeout(timer);
                httpsGet(res.headers.location, timeout).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { clearTimeout(timer); resolve(data); });
        });

        req.on('error', err => { clearTimeout(timer); reject(err); });
    });
}

// ===== HELPER: READ JSON FILE =====
function readJSON(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        return {};
    }
}

// ===== HELPER: WRITE JSON FILE =====
function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ===== IN-MEMORY CACHE: ARCHIVE =====
let archiveCache = null;

function getArchive() {
    if (!archiveCache) archiveCache = readJSON(DATA_FILE);
    return archiveCache;
}

// ===== IN-MEMORY CACHE: TYPES =====
let typesCache = null;

function loadTypes() {
    if (!typesCache) typesCache = readJSON(TYPES_FILE);
    return typesCache;
}

// ===== IN-MEMORY CACHE: SOURCES =====
let sourcesCache = null;

function loadSources() {
    if (!sourcesCache) sourcesCache = readJSON(SOURCES_FILE);
    return sourcesCache;
}

// ===== SSE: BROADCAST TO ALL CONNECTED CLIENTS =====
function broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        client.write(payload);
    }
}

// ===== HELPER: SERVE STATIC FILE =====
function serveFile(filePath, res) {
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*'
        });
        res.end(content);
    });
}

// ===== HELPER: FILTER AND SORT DIRECTIVES =====
function filterDirectives(directives, params) {
    let result = directives.slice();

    if (params.type) {
        const types = params.type.split(',').map(t => t.trim().toLowerCase());
        result = result.filter(d => types.includes((d.type || '').toLowerCase()));
    }

    if (params.agency) {
        const agencies = params.agency.split(',').map(a => a.trim());
        result = result.filter(d => agencies.includes(d.agency));
    }

    if (params.manufacturer) {
        const manufacturers = params.manufacturer.split(',').map(m => m.trim());
        result = result.filter(d => manufacturers.includes(d.manufacturer));
    }

    if (params.family) {
        const families = params.family.split(',').map(f => f.trim().toLowerCase());
        result = result.filter(d => families.includes((d.family || '').toLowerCase()));
    }

    if (params.urgency) {
        const urgencies = params.urgency.split(',').map(u => u.trim());
        result = result.filter(d => urgencies.includes(d.urgency));
    }

    if (params.dateFrom) {
        result = result.filter(d => d.publishDate >= params.dateFrom);
    }

    if (params.dateTo) {
        result = result.filter(d => d.publishDate <= params.dateTo);
    }

    if (params.search) {
        const searchLower = params.search.toLowerCase();
        result = result.filter(d =>
            (d.number + ' ' + d.subject + ' ' + (d.summary || '')).toLowerCase().includes(searchLower)
        );
    }

    result.sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''));

    return result;
}

// ===== HTTP SERVER =====
const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    const url = req.url.split('?')[0];

    // Route: dashboard root
    if (req.method === 'GET' && url === '/') {
        serveFile(path.join(__dirname, 'QC_AD_SB_Dashboard.html'), res);
        return;
    }

    // Route: static assets (logo, scripts, styles, etc.)
    if (req.method === 'GET') {
        const staticPath = path.join(__dirname, url);
        // Guard against directory traversal
        if (staticPath.startsWith(__dirname)) {
            if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
                serveFile(staticPath, res);
                return;
            }
        }
    }

    // Route: GET /api/directives
    if (req.method === 'GET' && url === '/api/directives') {
        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const sp = parsedUrl.searchParams;
            const params = {
                type:         sp.get('type')         || null,
                agency:       sp.get('agency')       || null,
                manufacturer: sp.get('manufacturer') || null,
                family:       sp.get('family')       || null,
                urgency:      sp.get('urgency')      || null,
                dateFrom:     sp.get('dateFrom')     || null,
                dateTo:       sp.get('dateTo')       || null,
                search:       sp.get('search')       || null
            };
            const page  = Math.max(1, parseInt(sp.get('page')  || '1',  10));
            const limit = Math.max(1, parseInt(sp.get('limit') || '50', 10));

            const archive  = getArchive();
            const filtered = filterDirectives(archive.directives || [], params);
            const total    = filtered.length;
            const paginated = filtered.slice((page - 1) * limit, page * limit);

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ total, page, limit, directives: paginated }));
        } catch (err) {
            console.error('[GET /api/directives] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Route: GET /api/summary
    if (req.method === 'GET' && url === '/api/summary') {
        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const sp = parsedUrl.searchParams;
            const params = {
                type:         sp.get('type')         || null,
                agency:       sp.get('agency')       || null,
                manufacturer: sp.get('manufacturer') || null,
                family:       sp.get('family')       || null,
                urgency:      sp.get('urgency')      || null,
                dateFrom:     sp.get('dateFrom')     || null,
                dateTo:       sp.get('dateTo')       || null,
                search:       sp.get('search')       || null
            };

            const archive  = getArchive();
            const filtered = filterDirectives(archive.directives || [], params);
            const types    = loadTypes();

            // Counts
            const totalADs     = filtered.filter(d => d.type === 'AD').length;
            const totalSBs     = filtered.filter(d => d.type === 'SB').length;
            const emergencyADs = filtered.filter(d => d.urgency === 'emergency').length;

            // New this month
            const now        = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
            const newADsThisMonth       = filtered.filter(d => d.type === 'AD'          && d.publishDate >= monthStart).length;
            const newEmergencyThisMonth = filtered.filter(d => d.urgency === 'emergency' && d.publishDate >= monthStart).length;

            // By manufacturer — always include all keys with zero counts
            const byManufacturer = {};
            for (const key of Object.keys(types)) {
                byManufacturer[key] = filtered.filter(d => d.manufacturer === key).length;
            }

            // By agency — always include all 3 with zero counts
            const byAgency = { easa: 0, faa: 0, casa: 0 };
            for (const d of filtered) {
                if (byAgency.hasOwnProperty(d.agency)) byAgency[d.agency]++;
            }

            // By family — top 20 by count
            const familyCounts = {};
            for (const d of filtered) {
                if (d.family) familyCounts[d.family] = (familyCounts[d.family] || 0) + 1;
            }
            const byFamily = Object.fromEntries(
                Object.entries(familyCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)
            );

            // Trend — last 12 months, one entry per month
            const trend = [];
            for (let i = 11; i >= 0; i--) {
                const d         = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthStr  = d.toISOString().slice(0, 7); // "YYYY-MM"
                const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 7);
                const monthDirectives = filtered.filter(dir => dir.publishDate >= monthStr && dir.publishDate < nextMonth);
                trend.push({
                    month:   monthStr,
                    adCount: monthDirectives.filter(dir => dir.type === 'AD').length,
                    sbCount: monthDirectives.filter(dir => dir.type === 'SB').length
                });
            }

            const summary = {
                totalADs, totalSBs, emergencyADs,
                newADsThisMonth, newEmergencyThisMonth,
                byManufacturer, byAgency, byFamily, trend,
                lastUpdate: archive.metadata ? archive.metadata.lastUpdate : null
            };

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(summary));
        } catch (err) {
            console.error('[GET /api/summary] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Default: 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
});

server.listen(PORT, () => {
    console.log(`AD/SB Intelligence Tracker running on http://localhost:${PORT}`);
});
