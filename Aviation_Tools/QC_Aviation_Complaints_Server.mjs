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
