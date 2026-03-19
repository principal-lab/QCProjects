/**
 * QC Aviation Complaints Intelligence Dashboard — Server
 * Version 1.0 — skeleton with API stubs
 *
 * Run with: node QC_Aviation_Complaints_Server.mjs
 *
 * This server:
 * 1. Serves the dashboard files on port 3851
 * 2. GET  /api/complaints      — paginated complaints query
 * 3. GET  /api/summary         — aggregated summary statistics
 * 4. GET  /api/update-status   — Server-Sent Events stream for update progress
 * 5. POST /api/update          — trigger a fresh data fetch cycle
 * 6. POST /api/recategorise    — re-run categorisation engine on stored data
 * 7. POST /api/export-pdf      — export current view to PDF (not yet implemented)
 * 8. POST /api/manual-add      — manually add a complaint record
 *
 * Tasks 3-6 will implement the real logic inside the stubs below.
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3851;
const DATA_FILE       = path.join(__dirname, 'QC_Aviation_Complaints_data.json');
const CATEGORIES_FILE = path.join(__dirname, 'QC_Aviation_Complaints_categories.json');
const SOURCES_FILE    = path.join(__dirname, 'QC_Aviation_Complaints_sources.json');
const KEYS_FILE       = path.join(__dirname, 'QC_Aviation_Complaints_keys.json');

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

        const req = https.get(url, { headers: { 'User-Agent': 'QC-Aviation-Complaints/1.0' } }, (res) => {
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

// ===== HELPER: HTTP GET (non-HTTPS URLs) =====
function httpGet(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timeout fetching ' + url));
        }, timeout);

        const req = http.get(url, { headers: { 'User-Agent': 'QC-Aviation-Complaints/1.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                clearTimeout(timer);
                httpGet(res.headers.location, timeout).then(resolve).catch(reject);
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
        return { metadata: {}, posts: [] };
    }
}

// ===== HELPER: WRITE JSON FILE =====
function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ===== HELPER: PARSE REQUEST BODY =====
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

// ===== RSS PARSING HELPERS =====
// Lightweight XML parser — extracts <item> or <entry> elements
function parseRSSItems(xml) {
    const items = [];

    // Try RSS 2.0 <item> format
    const rssItems = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || [];
    for (const raw of rssItems) {
        const title       = extractTag(raw, 'title');
        const link        = extractTag(raw, 'link') || extractAttr(raw, 'link', 'href');
        const description = extractTag(raw, 'description');
        const pubDate     = extractTag(raw, 'pubDate') || extractTag(raw, 'dc:date');
        if (title) {
            items.push({
                title:       stripCDATA(title),
                link:        stripCDATA(link || ''),
                description: stripCDATA(description || ''),
                pubDate
            });
        }
    }

    // Try Atom <entry> format if no RSS items found
    if (items.length === 0) {
        const atomEntries = xml.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi) || [];
        for (const raw of atomEntries) {
            const title   = extractTag(raw, 'title');
            const link    = extractAttr(raw, 'link', 'href');
            const summary = extractTag(raw, 'summary') || extractTag(raw, 'content');
            const updated = extractTag(raw, 'updated') || extractTag(raw, 'published');
            if (title) {
                items.push({
                    title:       stripCDATA(title),
                    link:        link || '',
                    description: stripCDATA(summary || ''),
                    pubDate:     updated
                });
            }
        }
    }

    return items;
}

function extractTag(xml, tag) {
    const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : null;
}

function extractAttr(xml, tag, attr) {
    const re = new RegExp('<' + tag + '[^>]*' + attr + '=["\']([^"\']*)["\']', 'i');
    const m = xml.match(re);
    return m ? m[1] : null;
}

function stripCDATA(text) {
    return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
}

function stripHTML(html) {
    return (html || '').replace(/<[^>]+>/g, '').trim();
}

// ===== HELPER: SIMPLE NUMERIC HASH (for deduplication IDs) =====
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

// ===== HELPER: SLEEP =====
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== CATEGORISATION ENGINE =====

// Module-level cache for categories config
let categoriesCache = null;

/**
 * loadCategories() — reads CATEGORIES_FILE and caches the result.
 * Returns the parsed config object. Subsequent calls return the cached value.
 */
function loadCategories() {
    if (categoriesCache) return categoriesCache;
    const raw = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    categoriesCache = JSON.parse(raw);
    return categoriesCache;
}

/**
 * categorisePost(post, config) — keyword-weighted scoring across all 6 categories.
 * Returns array of category keys where total keyword weight >= scoringThreshold.
 * Falls back to ["uncategorised"] if nothing scores above threshold.
 */
function categorisePost(post, config) {
    const text = ((post.title || '') + ' ' + (post.body || '')).toLowerCase();
    const threshold = config.scoringThreshold || 15;
    const matched = [];

    for (const [categoryKey, categoryDef] of Object.entries(config.categories)) {
        let score = 0;
        for (const [keyword, weight] of Object.entries(categoryDef.keywords)) {
            if (text.includes(keyword.toLowerCase())) {
                score += weight;
            }
        }
        if (score >= threshold) {
            matched.push(categoryKey);
        }
    }

    return matched.length > 0 ? matched : ['uncategorised'];
}

/**
 * extractEntities(post, config) — scans post text for known airframe OEMs,
 * engine OEMs, aircraft types, and airline names. Returns a deduplicated array
 * of matched entity strings using the original case from config.
 */
function extractEntities(post, config) {
    const text = ((post.title || '') + ' ' + (post.body || '')).toLowerCase();
    const found = new Set();

    for (const oem of (config.entities.airframe_oems || [])) {
        if (text.includes(oem.toLowerCase())) {
            found.add(oem);
        }
    }

    for (const oem of (config.entities.engine_oems || [])) {
        if (text.includes(oem.toLowerCase())) {
            found.add(oem);
        }
    }

    for (const type of (config.entities.aircraft_types || [])) {
        if (text.includes(type.toLowerCase())) {
            found.add(type);
        }
    }

    for (const airline of Object.keys(config.entities.airlines || {})) {
        if (text.includes(airline.toLowerCase())) {
            found.add(airline);
        }
    }

    return Array.from(found);
}

/**
 * assignRegion(post, config) — region priority chain:
 *   1. Check post.entities for airline names present in config.entities.airlines → return that airline's region
 *   2. Check post text for regionSources keywords → return matched region
 *   3. Fallback → "global"
 */
function assignRegion(post, config) {
    const airlinesMap = config.entities.airlines || {};

    // Priority 1: entity-based airline region
    if (Array.isArray(post.entities)) {
        for (const entity of post.entities) {
            if (airlinesMap[entity] !== undefined) {
                return airlinesMap[entity];
            }
        }
    }

    // Priority 2: text-based regionSources keyword scan
    const text = ((post.title || '') + ' ' + (post.body || '')).toLowerCase();
    for (const [keyword, region] of Object.entries(config.regionSources || {})) {
        if (text.includes(keyword.toLowerCase())) {
            return region;
        }
    }

    // Fallback
    return 'global';
}

/**
 * processPost(rawPost, config) — orchestrator that enriches a raw post with
 * entities, autoCategories, region, manualCategories, sentiment, and fetchDate.
 * Returns the enriched post object.
 */
function processPost(rawPost, config) {
    rawPost.entities         = extractEntities(rawPost, config);
    rawPost.autoCategories   = categorisePost(rawPost, config);
    rawPost.region           = assignRegion(rawPost, config);
    rawPost.manualCategories = null;
    rawPost.sentiment        = 'negative'; // Default for complaints
    rawPost.fetchDate        = new Date().toISOString();
    return rawPost;
}

// ===== SSE BROADCAST =====
function sendSSE(data) {
    const payload = 'data: ' + JSON.stringify(data) + '\n\n';
    for (const client of sseClients) {
        client.write(payload);
    }
}

// ===== SERVE STATIC FILE =====
function serveFile(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
            return;
        }
        res.writeHead(200, {
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });
        res.end(content);
    });
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

    // ---- GET / — serve dashboard HTML ----
    if (req.method === 'GET' && url === '/') {
        serveFile(path.join(__dirname, 'QC_Aviation_Complaints_Dashboard.html'), res);
        return;
    }

    // ---- GET /api/complaints — paginated complaints list (stub) ----
    if (req.method === 'GET' && url === '/api/complaints') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ total: 0, page: 1, limit: 50, posts: [] }));
        return;
    }

    // ---- GET /api/summary — aggregated summary statistics (stub) ----
    if (req.method === 'GET' && url === '/api/summary') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({}));
        return;
    }

    // ---- GET /api/update-status — SSE stream for update progress ----
    if (req.method === 'GET' && url === '/api/update-status') {
        res.writeHead(200, {
            'Content-Type':                'text/event-stream',
            'Cache-Control':               'no-cache',
            'Connection':                  'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write('data: {"status":"connected"}\n\n');

        sseClients.add(res);

        req.on('close', () => {
            sseClients.delete(res);
        });
        return;
    }

    // ---- POST /api/update — trigger data fetch cycle (stub) ----
    if (req.method === 'POST' && url === '/api/update') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    // ---- POST /api/recategorise — re-run categorisation engine (stub) ----
    if (req.method === 'POST' && url === '/api/recategorise') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    // ---- POST /api/export-pdf — export to PDF (not yet implemented) ----
    if (req.method === 'POST' && url === '/api/export-pdf') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'not implemented' }));
        return;
    }

    // ---- POST /api/manual-add — manually add a complaint record (stub) ----
    if (req.method === 'POST' && url === '/api/manual-add') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    // ---- Static file serving ----
    let filePath = url;
    if (filePath === '' || filePath === '/') {
        filePath = '/QC_Aviation_Complaints_Dashboard.html';
    }

    const fullPath = path.join(__dirname, filePath);

    // Path traversal guard
    if (!fullPath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (filePath.includes('Branding_Assets')) {
        const parentPath = path.join(__dirname, '..', filePath);
        serveFile(parentPath, res);
        return;
    }

    serveFile(fullPath, res);
});

server.listen(PORT, () => {
    console.log('');
    console.log('QC Aviation Complaints Intelligence Dashboard Server v1.0');
    console.log('===========================================================');
    console.log('Server running at http://localhost:' + PORT);
    console.log('Dashboard:    http://localhost:' + PORT + '/QC_Aviation_Complaints_Dashboard.html');
    console.log('');
    console.log('Endpoints:');
    console.log('  GET  /api/complaints    — Paginated complaints query');
    console.log('  GET  /api/summary       — Aggregated summary statistics');
    console.log('  GET  /api/update-status — SSE stream for update progress');
    console.log('  POST /api/update        — Trigger data fetch cycle');
    console.log('  POST /api/recategorise  — Re-run categorisation engine');
    console.log('  POST /api/export-pdf    — Export to PDF (not yet implemented)');
    console.log('  POST /api/manual-add    — Manually add a complaint record');
    console.log('');
    console.log('Press Ctrl+C to stop.');
});

// ===== CATEGORISATION TEST BLOCK =====
if (process.argv.includes('--test-categorise')) {
    const config = loadCategories();

    const samplePost = {
        title: 'Third PW1100G engine failure on IndiGo A320neo',
        body:  'Pratt & Whitney needs to address the reliability issues with the geared turbofan. Multiple AOG situations reported.'
    };

    const enriched = processPost(samplePost, config);

    console.log('');
    console.log('===== CATEGORISATION TEST =====');
    console.log('Post:');
    console.log('  Title:', enriched.title);
    console.log('  Body: ', enriched.body);
    console.log('');
    console.log('Results:');
    console.log('  autoCategories:  ', JSON.stringify(enriched.autoCategories));
    console.log('  entities:        ', JSON.stringify(enriched.entities));
    console.log('  region:          ', enriched.region);
    console.log('  manualCategories:', enriched.manualCategories);
    console.log('  sentiment:       ', enriched.sentiment);
    console.log('  fetchDate:       ', enriched.fetchDate);
    console.log('');

    // Validate expected outcomes
    // Note: mro_maintenance scores 10 (AOG only) which is below the threshold of 15,
    // so only engine_manufacturer fires on this post.
    const expectCategories = ['engine_manufacturer'];
    const expectEntities   = ['Pratt & Whitney', 'IndiGo', 'A320neo'];
    const expectRegion     = 'apac';

    let pass = true;

    for (const cat of expectCategories) {
        if (!enriched.autoCategories.includes(cat)) {
            console.log('FAIL: expected autoCategory "' + cat + '" not found');
            pass = false;
        }
    }

    for (const ent of expectEntities) {
        if (!enriched.entities.includes(ent)) {
            console.log('FAIL: expected entity "' + ent + '" not found');
            pass = false;
        }
    }

    if (enriched.region !== expectRegion) {
        console.log('FAIL: expected region "' + expectRegion + '", got "' + enriched.region + '"');
        pass = false;
    }

    if (pass) {
        console.log('All validation checks PASSED.');
    }

    process.exit(0);
}
