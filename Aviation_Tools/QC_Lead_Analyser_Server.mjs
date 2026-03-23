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
        const data = JSON.parse(raw);
        if (!data.leads) data.leads = [];
        return data;
    } catch (err) {
        return { leads: [] };
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

// ===== ENTITY NAME EXTRACTION =====
function extractEntityName(title) {
    const patterns = [
        /^([A-Z][A-Za-z\s]+(?:Air(?:lines?|ways)?|Aviation|Aerospace))/,
        /^([A-Z][A-Za-z\s]{2,30})\s+(?:launch|receiv|secur|commence|begin|start|plan|announc|get|gain|grant|order|sign|acquir)/i,
        /new (?:airline|carrier)\s+([A-Z][A-Za-z\s]+?)(?:\s+(?:launch|to|plan|set|receiv))/i,
    ];
    for (const re of patterns) {
        const m = title.match(re);
        if (m) return m[1].trim();
    }
    return title.split(/\s+/).slice(0, 5).join(' ');
}

// ===== RULE-BASED GRADING =====
function gradeLead(keywordHits) {
    const serviceCount = Object.keys(keywordHits).length;
    const totalHits = Object.values(keywordHits).reduce((a, b) => a + b, 0);
    const criticalServices = ['Airline Startup', 'Simulators', 'Auditing'];
    const hasCriticalStrong = criticalServices.some(s => (keywordHits[s] || 0) >= 2);

    if (serviceCount >= 3 || (serviceCount >= 1 && hasCriticalStrong && totalHits >= 3)) {
        return { grade: 'GREEN', gradeLabel: 'Good Fit' };
    }
    if (serviceCount >= 1) {
        return { grade: 'YELLOW', gradeLabel: 'Possible Fit' };
    }
    return { grade: 'AMBER', gradeLabel: 'Poor Fit' };
}

// ===== REASONING GENERATOR =====
function generateReasoning(entity, keywordHits, grade) {
    const services = Object.keys(keywordHits);
    if (services.length === 0) {
        return `Tangential match for ${entity}. Limited direct consulting opportunity identified.`;
    }
    const serviceList = services.join(', ');
    if (grade === 'GREEN') {
        return `Strong fit across ${services.length} service lines: ${serviceList}. Multiple consulting opportunities identified.`;
    }
    if (grade === 'YELLOW') {
        return `Possible fit for ${serviceList}. Further assessment recommended to confirm consulting opportunity.`;
    }
    return `Weak match for ${serviceList}. Limited or tangential consulting opportunity.`;
}

// ===== TENDERS HTML PARSER =====
function parseTenderItems(html) {
    const items = [];
    const titlePattern = /<a[^>]+href="([^"]*)"[^>]*>([^<]*(?:aviation|airline|flight|airport|pilot|training|simulator|consulting)[^<]*)<\/a>/gi;
    let match;
    while ((match = titlePattern.exec(html)) !== null) {
        const link = match[1].startsWith('http') ? match[1] : 'https://www.tendersontime.com' + match[1];
        items.push({
            title: match[2].trim(),
            link,
            description: match[2].trim(),
            pubDate: new Date().toISOString(),
        });
    }
    if (items.length === 0) {
        const listPattern = /<h[2-4][^>]*>([^<]*(?:aviation|airline|flight|airport|pilot|training|simulator|consulting)[^<]*)<\/h[2-4]>/gi;
        while ((match = listPattern.exec(html)) !== null) {
            items.push({
                title: match[1].trim(),
                link: 'https://www.tendersontime.com/searchrfp/global-aviation-consultancy-rfp-733/',
                description: match[1].trim(),
                pubDate: new Date().toISOString(),
            });
        }
    }
    return items;
}

// ===== DEDUPLICATION =====
function isDuplicate(leadId, title, allStores) {
    const normTitle = title.toLowerCase().trim().substring(0, 40);
    for (const store of allStores) {
        for (const lead of (store.leads || [])) {
            if (lead.id === leadId) return true;
            if (normTitle.length > 20 && lead.headline &&
                lead.headline.toLowerCase().trim().substring(0, 40) === normTitle) return true;
        }
    }
    return false;
}

// ===== SCAN ORCHESTRATOR =====
let scanCache = { timestamp: 0, regionKey: '', results: null };
const SCAN_CACHE_MS = 10 * 60 * 1000;

async function runScan(requestedRegions) {
    const regionKey = requestedRegions.slice().sort().join(',');
    if (Date.now() - scanCache.timestamp < SCAN_CACHE_MS && scanCache.regionKey === regionKey && scanCache.results) {
        broadcastSSE({ stage: 'complete', cached: true, ...scanCache.results });
        return scanCache.results;
    }

    const data = readJSON(DATA_FILE);
    const keep = readJSON(KEEP_FILE);
    const archive = readJSON(ARCHIVE_FILE);
    const allStores = [data, keep, archive];
    const failedSources = [];
    let totalScanned = 0;
    const newLeads = [];

    const total = RSS_FEEDS.length + 1;
    let completed = 0;

    const feedPromises = RSS_FEEDS.map(feed =>
        httpsGet(feed.url, 15000)
            .then(xml => ({ feed, xml, error: null }))
            .catch(err => ({ feed, xml: null, error: err }))
    );

    const feedResults = await Promise.all(feedPromises);

    for (const { feed, xml, error } of feedResults) {
        completed++;
        broadcastSSE({ stage: 'fetching', source: feed.name, progress: completed / total });

        if (error) {
            console.error(`[scan] ${feed.name} failed:`, error.message);
            failedSources.push(feed.name);
            continue;
        }

        const items = parseRSSItems(xml);
        totalScanned += items.length;

        let dbgNoRegion = 0, dbgWrongRegion = 0, dbgNotRelevant = 0;
        for (const item of items) {
            const region = classifyRegion(item.title, item.description);
            if (!region) { dbgNoRegion++; continue; }
            if (!requestedRegions.includes(region)) { dbgWrongRegion++; continue; }
            if (!isRelevant(item.title, item.description)) { dbgNotRelevant++; continue; }

            const id = 'lead_' + hashString((item.link || '') + item.title);
            if (isDuplicate(id, item.title, allStores)) continue;

            const entity = extractEntityName(item.title);
            const keywordHits = matchServiceLines(item.title, item.description);
            const { grade, gradeLabel } = gradeLead(keywordHits);
            const reasoning = generateReasoning(entity, keywordHits, grade);

            newLeads.push({
                id, entity,
                headline: item.title,
                description: stripCDATA(item.description || '').substring(0, 500),
                sourceUrl: item.link || '',
                source: feed.name,
                publishDate: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                fetchDate: new Date().toISOString(),
                region, grade, gradeLabel, reasoning,
                matchedServices: Object.keys(keywordHits),
                assessmentSource: 'rule-based',
                keywordHits,
            });
        }
        console.log(`[scan] ${feed.name}: ${items.length} items, noRegion=${dbgNoRegion}, wrongRegion=${dbgWrongRegion}, notRelevant=${dbgNotRelevant}`);
    }

    // Fetch TendersOnTime
    broadcastSSE({ stage: 'fetching', source: 'TendersOnTime', progress: completed / total });
    try {
        const html = await httpsGet(TENDER_URL, 15000);
        const tenderItems = parseTenderItems(html);
        totalScanned += tenderItems.length;

        for (const item of tenderItems) {
            const region = classifyRegion(item.title, item.description);
            if (!region || !requestedRegions.includes(region)) continue;

            const id = 'lead_' + hashString((item.link || '') + item.title);
            if (isDuplicate(id, item.title, allStores)) continue;

            const entity = extractEntityName(item.title);
            const keywordHits = matchServiceLines(item.title, item.description);
            const { grade, gradeLabel } = gradeLead(keywordHits);
            const reasoning = generateReasoning(entity, keywordHits, grade);

            newLeads.push({
                id, entity,
                headline: item.title,
                description: item.description.substring(0, 500),
                sourceUrl: item.link,
                source: 'TendersOnTime',
                publishDate: new Date().toISOString().slice(0, 10),
                fetchDate: new Date().toISOString(),
                region, grade, gradeLabel, reasoning,
                matchedServices: Object.keys(keywordHits),
                assessmentSource: 'rule-based',
                keywordHits,
            });
        }
    } catch (err) {
        console.error('[scan] TendersOnTime failed:', err.message);
        failedSources.push('TendersOnTime');
    }
    completed++;

    data.leads.push(...newLeads);
    data.lastScanDate = new Date().toISOString();
    data.scanStats = { totalScanned, matchedLeads: data.leads.length };
    writeJSON(DATA_FILE, data);
    discoverCache = data;

    const result = { newLeads: newLeads.length, totalLeads: data.leads.length, failedSources };
    scanCache = { timestamp: Date.now(), regionKey, results: result };

    broadcastSSE({ stage: 'complete', ...result });
    console.log(`[scan] Complete: ${newLeads.length} new leads, ${data.leads.length} total`);
    return result;
}

// ===== CLAUDE API CALL =====
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

function callClaudeAPI(systemPrompt, userPrompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        });

        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.content && parsed.content[0]) {
                        resolve(parsed.content[0].text);
                    } else {
                        reject(new Error('Unexpected API response: ' + data.substring(0, 200)));
                    }
                } catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
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

    // Route: POST /api/scan — trigger feed scan
    if (req.method === 'POST' && url === '/api/scan') {
        const body = await parseBody(req);
        const regions = body.regions || Object.keys(REGION_MAP);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'started' }));
        runScan(regions).catch(err => {
            console.error('[scan] Fatal:', err.message);
            broadcastSSE({ stage: 'error', message: err.message });
        });
        return;
    }

    // Route: POST /api/ai-assess — AI deep assessment of a lead
    if (req.method === 'POST' && url === '/api/ai-assess') {
        if (!ANTHROPIC_API_KEY) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }));
            return;
        }

        const body = await parseBody(req);
        const { leadId } = body;

        const data = readJSON(DATA_FILE);
        const keep = readJSON(KEEP_FILE);
        let lead = (data.leads || []).find(l => l.id === leadId) || (keep.leads || []).find(l => l.id === leadId);

        if (!lead) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Lead not found' }));
            return;
        }

        const systemPrompt = `You are an aviation business development analyst for QC Aviation Group Pty Ltd, a flight operations consultancy. Assess the following news item as a potential business lead.

QC Aviation offers these services:
1. Airline Startup (domestic and international)
2. Aircraft Entry Into Service
3. Sourcing Aircraft (business jet and airline types)
4. Airline Flight Training Consulting
5. Flight Operations Management Consulting
6. Flight Training Simulators (assessment, validation, installation)
7. Airline Route Analysis
8. Flight Operations Technology Consulting
9. Auditing (internal, regulatory compliance, IOSA compliance)
10. Flight Operations Manual Suite (construction, assessment, amendment)

Respond with JSON only:
{
  "grade": "GREEN|YELLOW|AMBER",
  "gradeLabel": "Good Fit|Possible Fit|Poor Fit",
  "reasoning": "2-3 sentence explanation",
  "matchedServices": ["service name", ...]
}`;

        const userPrompt = `Title: ${lead.headline}\nSource: ${lead.source}\nDate: ${lead.publishDate}\nDescription: ${lead.description}`;

        try {
            let responseText = await callClaudeAPI(systemPrompt, userPrompt);
            // Strip markdown code fences if present
            responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
            const assessment = JSON.parse(responseText);

            lead.grade = assessment.grade;
            lead.gradeLabel = assessment.gradeLabel;
            lead.reasoning = assessment.reasoning;
            lead.matchedServices = assessment.matchedServices;
            lead.assessmentSource = 'ai-assessed';

            if ((data.leads || []).find(l => l.id === leadId)) { writeJSON(DATA_FILE, data); discoverCache = data; }
            if ((keep.leads || []).find(l => l.id === leadId)) { writeJSON(KEEP_FILE, keep); keepCache = keep; }

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true, lead }));
        } catch (err) {
            console.error('[ai-assess] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Route: POST /api/keep — move lead from Discover to Keep
    if (req.method === 'POST' && url === '/api/keep') {
        const body = await parseBody(req);
        const { leadId } = body;
        const data = readJSON(DATA_FILE);
        const idx = (data.leads || []).findIndex(l => l.id === leadId);
        if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Lead not found in Discover' }));
            return;
        }
        const lead = data.leads.splice(idx, 1)[0];
        // Best-effort website extraction — use sourceUrl if it looks like an entity domain (not a news site)
        const newsSites = ['aerotime', 'aviationweek', 'flightglobal', 'ch-aviation', 'simpleflying', 'aviationbusinessme', 'australianaviation', 'airwaysmag', 'casa.gov', 'easa.europa', 'tendersontime'];
        let website = '';
        try {
            const domain = new URL(lead.sourceUrl).hostname.toLowerCase();
            if (!newsSites.some(ns => domain.includes(ns))) website = lead.sourceUrl;
        } catch (_) {}
        Object.assign(lead, {
            keptDate: new Date().toISOString(),
            website,
            contactName: '', contactEmail: '', contactPhone: '', linkedin: '', notes: '',
            recentUpdates: [],
        });
        const keep = readJSON(KEEP_FILE);
        if (!keep.leads) keep.leads = [];
        keep.leads.push(lead);
        writeJSON(DATA_FILE, data);
        writeJSON(KEEP_FILE, keep);
        discoverCache = data;
        keepCache = keep;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(lead));
        return;
    }

    // Route: POST /api/archive — move lead to Archive
    if (req.method === 'POST' && url === '/api/archive') {
        const body = await parseBody(req);
        const { leadId, notes } = body;
        const data = readJSON(DATA_FILE);
        const keep = readJSON(KEEP_FILE);
        let lead = null;
        let source = null;
        const dIdx = (data.leads || []).findIndex(l => l.id === leadId);
        if (dIdx !== -1) {
            lead = data.leads.splice(dIdx, 1)[0];
            source = 'discover';
        } else {
            const kIdx = (keep.leads || []).findIndex(l => l.id === leadId);
            if (kIdx !== -1) {
                lead = keep.leads.splice(kIdx, 1)[0];
                source = 'keep';
            }
        }
        if (!lead) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Lead not found' }));
            return;
        }
        lead.archiveDate = new Date().toISOString();
        lead.archiveNotes = notes || '';
        const archive = readJSON(ARCHIVE_FILE);
        if (!archive.leads) archive.leads = [];
        archive.leads.push(lead);
        if (source === 'discover') { writeJSON(DATA_FILE, data); discoverCache = data; }
        if (source === 'keep') { writeJSON(KEEP_FILE, keep); keepCache = keep; }
        writeJSON(ARCHIVE_FILE, archive);
        archiveCache = archive;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Route: PUT /api/keep/:id — update Keep lead editable fields
    const keepMatch = url.match(/^\/api\/keep\/(.+)$/);
    if (req.method === 'PUT' && keepMatch) {
        const leadId = decodeURIComponent(keepMatch[1]);
        const body = await parseBody(req);
        const keep = readJSON(KEEP_FILE);
        const lead = (keep.leads || []).find(l => l.id === leadId);
        if (!lead) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Lead not found in Keep' }));
            return;
        }
        const editable = ['website', 'contactName', 'contactEmail', 'contactPhone', 'linkedin', 'notes'];
        for (const field of editable) {
            if (body[field] !== undefined) lead[field] = body[field];
        }
        writeJSON(KEEP_FILE, keep);
        keepCache = keep;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(lead));
        return;
    }

    // Route: POST /api/restore — restore archived lead to Keep
    if (req.method === 'POST' && url === '/api/restore') {
        const body = await parseBody(req);
        const { leadId } = body;
        const archive = readJSON(ARCHIVE_FILE);
        const idx = (archive.leads || []).findIndex(l => l.id === leadId);
        if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Lead not found in Archive' }));
            return;
        }
        const lead = archive.leads.splice(idx, 1)[0];
        delete lead.archiveDate;
        delete lead.archiveNotes;
        Object.assign(lead, {
            keptDate: new Date().toISOString(),
            website: lead.website || '',
            contactName: lead.contactName || '', contactEmail: lead.contactEmail || '',
            contactPhone: lead.contactPhone || '', linkedin: lead.linkedin || '',
            notes: lead.notes || '', recentUpdates: lead.recentUpdates || [],
        });
        const keep = readJSON(KEEP_FILE);
        if (!keep.leads) keep.leads = [];
        keep.leads.push(lead);
        writeJSON(ARCHIVE_FILE, archive);
        writeJSON(KEEP_FILE, keep);
        archiveCache = archive;
        keepCache = keep;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Route: DELETE /api/archive/:id — permanently delete archived lead
    const archiveMatch = url.match(/^\/api\/archive\/(.+)$/);
    if (req.method === 'DELETE' && archiveMatch) {
        const leadId = decodeURIComponent(archiveMatch[1]);
        const archive = readJSON(ARCHIVE_FILE);
        const idx = (archive.leads || []).findIndex(l => l.id === leadId);
        if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Lead not found in Archive' }));
            return;
        }
        archive.leads.splice(idx, 1);
        writeJSON(ARCHIVE_FILE, archive);
        archiveCache = archive;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Route: POST /api/keep/update — re-scan feeds for kept entity updates
    if (req.method === 'POST' && url === '/api/keep/update') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'started' }));

        (async () => {
            try {
                const keep = readJSON(KEEP_FILE);
                if (!keep.leads || keep.leads.length === 0) {
                    broadcastSSE({ stage: 'complete', message: 'No kept leads to update' });
                    return;
                }
                const entityNames = keep.leads.map(l => l.entity.toLowerCase());
                const total = RSS_FEEDS.length;
                let completed = 0;
                let updatesFound = 0;

                const feedPromises = RSS_FEEDS.map(feed =>
                    httpsGet(feed.url, 15000)
                        .then(xml => ({ feed, xml, error: null }))
                        .catch(err => ({ feed, xml: null, error: err }))
                );
                const feedResults = await Promise.all(feedPromises);

                for (const { feed, xml, error } of feedResults) {
                    completed++;
                    broadcastSSE({ stage: 'fetching', source: feed.name, progress: completed / total });
                    if (error || !xml) continue;

                    const items = parseRSSItems(xml);
                    for (const item of items) {
                        const text = (item.title + ' ' + item.description).toLowerCase();
                        for (const lead of keep.leads) {
                            if (text.includes(lead.entity.toLowerCase())) {
                                if (!lead.recentUpdates) lead.recentUpdates = [];
                                const url = item.link || '';
                                if (lead.recentUpdates.some(u => u.url === url)) continue;
                                lead.recentUpdates.push({
                                    date: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                                    headline: item.title,
                                    source: feed.name,
                                    url,
                                });
                                updatesFound++;
                            }
                        }
                    }
                }

                writeJSON(KEEP_FILE, keep);
                keepCache = keep;
                broadcastSSE({ stage: 'complete', updatesFound });
                console.log(`[keep-update] Complete: ${updatesFound} updates found`);
            } catch (err) {
                console.error('[keep-update] Error:', err.message);
                broadcastSSE({ stage: 'error', message: err.message });
            }
        })();
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

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other process first or use a different port.`);
    } else {
        console.error('Server error:', err.message);
    }
    process.exit(1);
});

server.listen(PORT, () => {
    console.log(`QC Lead Analyser running on http://localhost:${PORT}`);
});
