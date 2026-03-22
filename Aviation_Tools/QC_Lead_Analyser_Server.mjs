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

// ===== RSS FEED SOURCES =====
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

// ===== RSS/ATOM XML PARSER =====
function parseRSSItems(xml) {
    const items = [];
    const rssItems = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || [];
    for (const raw of rssItems) {
        const title = extractTag(raw, 'title');
        const link = extractTag(raw, 'link') || extractAttr(raw, 'link', 'href');
        const description = extractTag(raw, 'description');
        const pubDate = extractTag(raw, 'pubDate') || extractTag(raw, 'dc:date');
        if (title) {
            items.push({ title: stripCDATA(title), link: stripCDATA(link || ''), description: stripCDATA(description || ''), pubDate });
        }
    }
    if (items.length === 0) {
        const atomEntries = xml.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi) || [];
        for (const raw of atomEntries) {
            const title = extractTag(raw, 'title');
            const link = extractAttr(raw, 'link', 'href');
            const summary = extractTag(raw, 'summary') || extractTag(raw, 'content');
            const updated = extractTag(raw, 'updated') || extractTag(raw, 'published');
            if (title) {
                items.push({ title: stripCDATA(title), link: link || '', description: stripCDATA(summary || ''), pubDate: updated });
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

// ===== SEVEN-REGION KEYWORD MAP =====
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

// ===== CLASSIFY ARTICLE BY REGION =====
function classifyRegion(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    for (const [region, keywords] of Object.entries(REGION_MAP)) {
        for (const kw of keywords) {
            if (text.includes(kw.toLowerCase())) {
                return region;
            }
        }
    }
    return null;
}

// ===== SERVICE LINE KEYWORDS =====
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

function isRelevant(title, description) {
    return Object.keys(matchServiceLines(title, description)).length > 0;
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
