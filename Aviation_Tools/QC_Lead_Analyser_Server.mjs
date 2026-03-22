/**
 * QC Lead Analyser — Server
 * Version 1.0 — skeleton with static file serving, SSE, and data API
 *
 * Run with: node QC_Lead_Analyser_Server.mjs
 *
 * This server:
 * 1. Serves the dashboard files on port 3849
 * 2. Provides cached access to discover/keep/archive lead data
 * 3. SSE endpoint for broadcasting scan progress to connected clients
 * 4. Body-parsing helper for POST/PUT/DELETE routes (future tasks)
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT         = 3849;
const DATA_FILE    = path.join(__dirname, 'QC_Lead_Analyser_data.json');
const KEEP_FILE    = path.join(__dirname, 'QC_Lead_Analyser_keep.json');
const ARCHIVE_FILE = path.join(__dirname, 'QC_Lead_Analyser_archive.json');

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

        const req = https.get(url, { headers: { 'User-Agent': 'QC-Lead-Analyser/1.0' } }, (res) => {
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

// ===== HELPER: HASH STRING (for deterministic IDs) =====
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
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

// ===== HELPER: PARSE REQUEST BODY (for POST/PUT/DELETE) =====
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

// ===== IN-MEMORY CACHES =====
let discoverCache = null;
let keepCache     = null;
let archiveCache  = null;

function getDiscover() {
    if (!discoverCache) discoverCache = readJSON(DATA_FILE);
    return discoverCache;
}

function getKeep() {
    if (!keepCache) keepCache = readJSON(KEEP_FILE);
    return keepCache;
}

function getArchive() {
    if (!archiveCache) archiveCache = readJSON(ARCHIVE_FILE);
    return archiveCache;
}

// ===== HTTP SERVER =====
const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    const url = req.url.split('?')[0];

    // Route: dashboard root
    if (req.method === 'GET' && url === '/') {
        serveFile(path.join(__dirname, 'QC_Lead_Analyser.html'), res);
        return;
    }

    // Route: branding assets (logo lives one level up)
    if (req.method === 'GET' && url.startsWith('/Branding_Assets/')) {
        const brandPath = path.join(__dirname, '..', url);
        const brandDir  = path.join(__dirname, '..', 'Branding_Assets');
        if (brandPath.startsWith(brandDir) && fs.existsSync(brandPath) && fs.statSync(brandPath).isFile()) {
            serveFile(brandPath, res);
            return;
        }
    }

    // Route: SSE stream
    if (req.method === 'GET' && url === '/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write('data: {"type":"connected"}\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
    }

    // Route: GET /api/discover
    if (req.method === 'GET' && url === '/api/discover') {
        const data = getDiscover();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(data));
        return;
    }

    // Route: GET /api/keep
    if (req.method === 'GET' && url === '/api/keep') {
        const data = getKeep();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(data));
        return;
    }

    // Route: GET /api/archive
    if (req.method === 'GET' && url === '/api/archive') {
        const data = getArchive();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(data));
        return;
    }

    // Route: GET /api/config
    if (req.method === 'GET' && url === '/api/config') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ aiEnabled: !!process.env.ANTHROPIC_API_KEY }));
        return;
    }

    // Route: static assets (scripts, styles, etc.)
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

    // Default: 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
});

server.listen(PORT, () => {
    console.log(`QC Lead Analyser running on http://localhost:${PORT}`);
});
