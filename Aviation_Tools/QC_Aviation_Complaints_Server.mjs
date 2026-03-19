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

// ===== SOURCE FETCHERS =====

/**
 * httpsPost(url, body, headers) — performs an HTTPS POST and returns the response body.
 * Used by fetchReddit for OAuth token acquisition.
 */
function httpsPost(url, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const postData = Buffer.from(body, 'utf8');
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            method:   'POST',
            headers:  Object.assign({
                'Content-Type':   'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }, extraHeaders)
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * fetchRSS(sourceConfig) — fetches and parses RSS feeds defined in sourceConfig.feeds.
 * Filters items by sourceConfig.keywords and normalises to the standard post schema.
 * Returns an array of normalised post objects (up to maxPostsPerFetch total).
 */
async function fetchRSS(sourceConfig) {
    const results = [];
    const keywords = (sourceConfig.keywords || []).map(k => k.toLowerCase());
    const maxPosts = sourceConfig.maxPostsPerFetch || 20;

    for (const feed of (sourceConfig.feeds || [])) {
        if (results.length >= maxPosts) break;

        let xml = '';
        try {
            xml = await httpsGet(feed.url);
        } catch (err) {
            console.warn('[RSS] Failed to fetch feed:', feed.url, '-', err.message);
            continue;
        }

        const items = parseRSSItems(xml);

        for (const item of items) {
            if (results.length >= maxPosts) break;

            // Keyword filter — match any keyword against title + description
            const searchText = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
            const matches = keywords.length === 0 || keywords.some(kw => searchText.includes(kw));
            if (!matches) continue;

            // Parse date with fallback to current date for invalid values
            let dateStr;
            try {
                const d = new Date(item.pubDate);
                dateStr = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
            } catch (_) {
                dateStr = new Date().toISOString();
            }

            const feedName = feed.name || feed.label || feed.url;
            results.push({
                id:           'rss_' + hashString(item.link || item.title),
                source:       'rss',
                sourceDetail: feedName,
                author:       feedName,
                date:         dateStr,
                title:        item.title,
                body:         stripHTML(item.description),
                url:          item.link
            });
        }
    }

    return results;
}

/**
 * fetchReddit(sourceConfig, keys) — authenticates with the Reddit OAuth API
 * and fetches recent posts from each subreddit in sourceConfig.subreddits.
 * Filters by keywords and normalises to the standard post schema.
 * Returns an array of normalised post objects (up to maxPostsPerFetch total).
 */
async function fetchReddit(sourceConfig, keys) {
    if (!keys || !keys.reddit || !keys.reddit.clientId) {
        console.warn('[Reddit] No clientId configured in keys.json — skipping Reddit source.');
        return [];
    }

    const { clientId, clientSecret, userAgent } = keys.reddit;
    const ua = userAgent || 'QC-Aviation-Complaints/1.0';

    // Acquire OAuth access token using client credentials grant
    let accessToken;
    try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenResponse = await httpsPost(
            'https://www.reddit.com/api/v1/access_token',
            'grant_type=client_credentials',
            {
                'Authorization': 'Basic ' + credentials,
                'User-Agent':    ua
            }
        );
        const tokenData = JSON.parse(tokenResponse);
        accessToken = tokenData.access_token;
        if (!accessToken) {
            console.warn('[Reddit] Token acquisition failed:', tokenData.error || 'unknown error');
            return [];
        }
    } catch (err) {
        console.warn('[Reddit] Token request error:', err.message);
        return [];
    }

    const results = [];
    const keywords = (sourceConfig.keywords || []).map(k => k.toLowerCase());
    const maxPosts = sourceConfig.maxPostsPerFetch || 25;
    const rateLimitMs = sourceConfig.rateLimitMs || 1000;

    for (const subreddit of (sourceConfig.subreddits || [])) {
        if (results.length >= maxPosts) break;

        try {
            const feedUrl = `https://oauth.reddit.com/r/${subreddit}/new.json?limit=25`;
            const rawResponse = await httpsGet(feedUrl.replace('https://', 'https://'));

            // httpsGet uses default User-Agent — for Reddit OAuth we need a custom one.
            // Re-fetch with correct headers using a manual HTTPS call.
            const redditResponse = await new Promise((resolve, reject) => {
                const parsed = new URL(feedUrl);
                const options = {
                    hostname: parsed.hostname,
                    path:     parsed.pathname + parsed.search,
                    method:   'GET',
                    headers:  {
                        'Authorization': 'Bearer ' + accessToken,
                        'User-Agent':    ua
                    }
                };
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                });
                req.on('error', reject);
                req.end();
            });

            const parsed = JSON.parse(redditResponse);
            const posts = (parsed.data && parsed.data.children) ? parsed.data.children : [];

            for (const post of posts) {
                if (results.length >= maxPosts) break;
                const d = post.data || {};

                // Keyword filter
                const searchText = ((d.title || '') + ' ' + (d.selftext || '')).toLowerCase();
                const matches = keywords.length === 0 || keywords.some(kw => searchText.includes(kw));
                if (!matches) continue;

                results.push({
                    id:           'reddit_' + d.id,
                    source:       'reddit',
                    sourceDetail: 'r/' + subreddit,
                    author:       d.author,
                    date:         new Date(d.created_utc * 1000).toISOString(),
                    title:        d.title,
                    body:         d.selftext || '',
                    url:          'https://reddit.com' + d.permalink
                });
            }
        } catch (err) {
            console.warn('[Reddit] Failed to fetch r/' + subreddit + ':', err.message);
        }

        await sleep(rateLimitMs);
    }

    return results;
}

/**
 * fetchEASA(sourceConfig) — fetches the EASA Airworthiness Directives RSS feed.
 * All ADs are included — no keyword filtering applied (all ADs are relevant).
 * Returns an array of normalised post objects (up to maxPostsPerFetch total).
 */
async function fetchEASA(sourceConfig) {
    const results = [];
    const maxPosts = sourceConfig.maxPostsPerFetch || 30;

    // Use the adList endpoint URL, or fall back to the rss property if present
    const feedUrl = (sourceConfig.endpoints && sourceConfig.endpoints.adList)
        ? sourceConfig.endpoints.adList
        : (sourceConfig.url || sourceConfig.baseUrl);

    if (!feedUrl) {
        console.warn('[EASA] No feed URL configured — skipping EASA source.');
        return [];
    }

    let xml = '';
    try {
        xml = await httpsGet(feedUrl);
    } catch (err) {
        console.warn('[EASA] Failed to fetch AD feed:', err.message);
        return [];
    }

    const items = parseRSSItems(xml);

    for (const item of items) {
        if (results.length >= maxPosts) break;

        let dateStr;
        try {
            const d = new Date(item.pubDate);
            dateStr = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch (_) {
            dateStr = new Date().toISOString();
        }

        results.push({
            id:           'easa_' + hashString(item.link),
            source:       'easa',
            sourceDetail: 'EASA Airworthiness Directives',
            author:       'EASA',
            date:         dateStr,
            title:        item.title,
            body:         stripHTML(item.description),
            url:          item.link
        });
    }

    return results;
}

/**
 * fetchSkytrax(sourceConfig) — scrapes Skytrax airline review pages.
 * Extracts reviews using regex patterns and filters for low-rated (<=3) reviews.
 * Each airline in sourceConfig.airlines is fetched separately with rate-limit delays.
 * Returns an array of normalised post objects (up to maxPostsPerFetch total).
 */
async function fetchSkytrax(sourceConfig) {
    const results = [];
    const maxPosts = sourceConfig.maxPostsPerFetch || 20;
    const rateLimitMs = sourceConfig.rateLimitMs || 3000;

    // Build the airlines list — config may supply an explicit array, or we derive
    // slugs from the reviews endpoint path.
    const airlines = sourceConfig.airlines || [];
    const baseUrl = sourceConfig.baseUrl || 'https://www.airlinequality.com';

    // If no airlines list configured, attempt to use a small default set of
    // commonly reviewed carriers so the fetcher is functional out-of-box.
    const targets = airlines.length > 0 ? airlines : [
        'ryanair',
        'emirates',
        'british-airways'
    ];

    for (const airline of targets) {
        if (results.length >= maxPosts) break;

        try {
            const reviewUrl = `${baseUrl}/airline-reviews/${airline}/`;
            const html = await httpsGet(reviewUrl);

            // Extract review components using regex — best-effort HTML scraping
            const titleRe  = /<h2[^>]*class="[^"]*text_header[^"]*"[^>]*>([\s\S]*?)<\/h2>/gi;
            const bodyRe   = /<div[^>]*class="[^"]*text_content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
            const ratingRe = /<span[^>]*itemprop="ratingValue"[^>]*>([\s\S]*?)<\/span>/gi;
            const dateRe   = /<time[^>]*datetime="([^"]*)"[^>]*>/gi;

            const titles  = [];
            const bodies  = [];
            const ratings = [];
            const dates   = [];

            let m;
            while ((m = titleRe.exec(html))  !== null) titles.push(stripHTML(m[1]));
            while ((m = bodyRe.exec(html))   !== null) bodies.push(stripHTML(m[1]));
            while ((m = ratingRe.exec(html)) !== null) ratings.push(parseFloat(m[1]));
            while ((m = dateRe.exec(html))   !== null) dates.push(m[1]);

            const reviewCount = Math.max(titles.length, ratings.length);

            for (let i = 0; i < reviewCount; i++) {
                if (results.length >= maxPosts) break;

                const rating = ratings[i] !== undefined ? ratings[i] : null;

                // Filter: only complaints (rating <= 3); if no rating, include anyway
                if (rating !== null && rating > 3) continue;

                const title = titles[i] || `${airline} review`;
                const body  = bodies[i] || '';
                let dateStr;
                try {
                    const d = new Date(dates[i] || '');
                    dateStr = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
                } catch (_) {
                    dateStr = new Date().toISOString();
                }

                const uid = hashString(airline + '_' + i + '_' + title);
                results.push({
                    id:           'skytrax_' + uid,
                    source:       'skytrax',
                    sourceDetail: airline,
                    author:       'Skytrax reviewer',
                    date:         dateStr,
                    title:        title,
                    body:         body,
                    url:          reviewUrl
                });
            }
        } catch (err) {
            console.warn('[Skytrax] Failed to fetch reviews for airline:', airline, '-', err.message);
            // Individual airline failures do not block others
        }

        await sleep(rateLimitMs);
    }

    return results;
}

/**
 * fetchPPRuNe(sourceConfig) — scrapes Professional Pilots Rumour Network (PPRuNe) forums.
 * Extracts thread titles and URLs from forum index pages using regex.
 * Returns an array of normalised post objects (up to maxPostsPerFetch total).
 */
async function fetchPPRuNe(sourceConfig) {
    const results = [];
    const forums = sourceConfig.forums || [];
    const maxPosts = sourceConfig.maxPostsPerFetch || 20;
    const rateLimitMs = sourceConfig.rateLimitMs || 4000;

    // Distribute the post budget evenly across forums
    const perForum = forums.length > 0 ? Math.ceil(maxPosts / forums.length) : maxPosts;

    for (const forum of forums) {
        if (results.length >= maxPosts) break;

        try {
            const html = await httpsGet(forum.url);
            const forumName = forum.name || forum.label || forum.url;

            // Extract thread titles and links — best-effort regex for vBulletin-style markup
            const threadRe = /<a[^>]+href="([^"]*)"[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            // Fallback: look for thread title links more broadly
            const fallbackRe = /<td[^>]*class="[^"]*alt[12][^"]*"[^>]*>[\s\S]*?<a[^>]+href="(\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

            const threads = [];
            let m;
            while ((m = threadRe.exec(html)) !== null) {
                const url   = m[1].startsWith('http') ? m[1] : sourceConfig.baseUrl + m[1];
                const title = stripHTML(m[2]).trim();
                if (title) threads.push({ url, title });
            }

            // Try fallback pattern if primary found nothing
            if (threads.length === 0) {
                while ((m = fallbackRe.exec(html)) !== null) {
                    const url   = m[1].startsWith('http') ? m[1] : (sourceConfig.baseUrl || 'https://www.pprune.org') + m[1];
                    const title = stripHTML(m[2]).trim();
                    if (title) threads.push({ url, title });
                }
            }

            const limit = Math.min(perForum, threads.length, maxPosts - results.length);

            for (let i = 0; i < limit; i++) {
                const thread = threads[i];
                results.push({
                    id:           'pprune_' + hashString(thread.url),
                    source:       'pprune',
                    sourceDetail: forumName,
                    author:       'PPRuNe member',
                    date:         new Date().toISOString(), // Thread dates require deeper parsing
                    title:        thread.title,
                    body:         '',
                    url:          thread.url
                });
            }
        } catch (err) {
            console.warn('[PPRuNe] Failed to fetch forum:', forum.url, '-', err.message);
            // Individual forum failures do not block others
        }

        await sleep(rateLimitMs);
    }

    return results;
}

/**
 * fetchYouTube(sourceConfig, keys) — queries YouTube Data API v3 for recent videos
 * on configured channels, then fetches comments and filters by keywords.
 * Requires a YouTube Data API key in keys.youtube.apiKey.
 * Returns an array of normalised post objects (up to maxPostsPerFetch total).
 */
async function fetchYouTube(sourceConfig, keys) {
    if (!keys || !keys.youtube || !keys.youtube.apiKey) {
        console.warn('[YouTube] No API key configured in keys.json — skipping YouTube source.');
        return [];
    }

    const apiKey = keys.youtube.apiKey;
    const results = [];
    const keywords = (sourceConfig.keywords || []).map(k => k.toLowerCase());
    const maxPosts = sourceConfig.maxPostsPerFetch || 10;
    const channels = sourceConfig.channels || [];

    for (const channelId of channels) {
        if (results.length >= maxPosts) break;

        try {
            // Search for recent videos on this channel
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet&order=date&maxResults=5&type=video`;
            const searchRaw = await httpsGet(searchUrl);
            const searchData = JSON.parse(searchRaw);

            const videos = (searchData.items || []);

            for (const video of videos) {
                if (results.length >= maxPosts) break;

                const videoId = video.id && video.id.videoId;
                if (!videoId) continue;

                // Fetch comments for this video
                try {
                    const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?key=${apiKey}&videoId=${videoId}&part=snippet&maxResults=50`;
                    const commentsRaw = await httpsGet(commentsUrl);
                    const commentsData = JSON.parse(commentsRaw);

                    for (const thread of (commentsData.items || [])) {
                        if (results.length >= maxPosts) break;

                        const comment = thread.snippet && thread.snippet.topLevelComment;
                        if (!comment) continue;
                        const snip = comment.snippet || {};

                        const commentText = (snip.textDisplay || snip.textOriginal || '').toLowerCase();
                        const matches = keywords.length === 0 || keywords.some(kw => commentText.includes(kw));
                        if (!matches) continue;

                        let dateStr;
                        try {
                            const d = new Date(snip.publishedAt || '');
                            dateStr = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
                        } catch (_) {
                            dateStr = new Date().toISOString();
                        }

                        results.push({
                            id:           'youtube_' + hashString(comment.id || commentText),
                            source:       'youtube',
                            sourceDetail: channelId,
                            author:       snip.authorDisplayName || 'YouTube user',
                            date:         dateStr,
                            title:        (video.snippet && video.snippet.title) || 'YouTube comment',
                            body:         stripHTML(snip.textDisplay || snip.textOriginal || ''),
                            url:          `https://www.youtube.com/watch?v=${videoId}`
                        });
                    }
                } catch (err) {
                    console.warn('[YouTube] Failed to fetch comments for video:', videoId, '-', err.message);
                }
            }
        } catch (err) {
            console.warn('[YouTube] Failed to fetch videos for channel:', channelId, '-', err.message);
        }
    }

    return results;
}

/**
 * fetchTwitter(sourceConfig, keys) — queries Twitter/X API v2 recent tweet search.
 * Requires paid API access ($100/month Basic tier).
 * Requires a Twitter Bearer Token in keys.twitter.bearerToken.
 * Returns an array of normalised post objects (up to maxPostsPerFetch total).
 */
async function fetchTwitter(sourceConfig, keys) {
    if (!keys || !keys.twitter || !keys.twitter.bearerToken) {
        console.warn('[Twitter] No bearerToken configured in keys.json — skipping Twitter source.');
        return [];
    }

    const bearerToken = keys.twitter.bearerToken;
    const keywords = sourceConfig.keywords || [];
    const maxPosts = sourceConfig.maxPostsPerFetch || 50;
    const results = [];

    // Build query by joining keywords with OR
    const query = keywords.map(k => `"${k}"`).join(' OR ') + ' lang:en';

    try {
        const searchUrl = new URL('https://api.twitter.com/2/tweets/search/recent');
        searchUrl.searchParams.set('query', query);
        searchUrl.searchParams.set('max_results', String(Math.min(maxPosts, 100)));
        searchUrl.searchParams.set('tweet.fields', 'created_at,author_id,text');
        searchUrl.searchParams.set('expansions', 'author_id');
        searchUrl.searchParams.set('user.fields', 'username');

        const twitterResponse = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.twitter.com',
                path:     searchUrl.pathname + searchUrl.search,
                method:   'GET',
                headers:  {
                    'Authorization': 'Bearer ' + bearerToken,
                    'User-Agent':    'QC-Aviation-Complaints/1.0'
                }
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            req.end();
        });

        const twitterData = JSON.parse(twitterResponse);

        // Build a username lookup map from the includes block
        const usersMap = {};
        if (twitterData.includes && twitterData.includes.users) {
            for (const user of twitterData.includes.users) {
                usersMap[user.id] = user.username;
            }
        }

        for (const tweet of (twitterData.data || [])) {
            if (results.length >= maxPosts) break;

            let dateStr;
            try {
                const d = new Date(tweet.created_at || '');
                dateStr = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
            } catch (_) {
                dateStr = new Date().toISOString();
            }

            const username = usersMap[tweet.author_id] || tweet.author_id;
            results.push({
                id:           'twitter_' + tweet.id,
                source:       'twitter',
                sourceDetail: 'Twitter/X search',
                author:       '@' + username,
                date:         dateStr,
                title:        (tweet.text || '').slice(0, 100),
                body:         tweet.text || '',
                url:          `https://twitter.com/i/web/status/${tweet.id}`
            });
        }
    } catch (err) {
        console.warn('[Twitter] Failed to fetch tweets:', err.message);
    }

    return results;
}

/**
 * fetchFAASDR(sourceConfig) — FAA Service Difficulty Reports (SDR) stub.
 * Automated fetching is not yet implemented — records must be added manually
 * via the /api/manual-add endpoint.
 * Returns an empty array.
 */
async function fetchFAASDR(sourceConfig) {
    console.log('[FAA SDR] Automated fetching not yet implemented — use Manual Add.');
    return [];
}

// ===== SOURCE FETCHER REGISTRY =====
const SOURCE_FETCHERS = {
    reddit:  fetchReddit,
    rss:     fetchRSS,
    easa:    fetchEASA,
    skytrax: fetchSkytrax,
    pprune:  fetchPPRuNe,
    youtube: fetchYouTube,
    twitter: fetchTwitter,
    faa_sdr: fetchFAASDR
};

// ===== UPDATE ORCHESTRATOR =====
let updateInProgress = false;

async function runUpdate() {
    if (updateInProgress) {
        sendSSE({ type: 'error', message: 'Update already in progress' });
        return;
    }
    updateInProgress = true;

    try {
        const sourcesRaw = readJSON(SOURCES_FILE);
        // Unwrap the "sources" wrapper if present
        const sourcesConfig = sourcesRaw.sources || sourcesRaw;
        const keys = readJSON(KEYS_FILE);
        const config = loadCategories();
        const archive = readJSON(DATA_FILE);

        // Get enabled sources that have a fetcher
        const enabledSources = Object.entries(sourcesConfig)
            .filter(([key, src]) => src.enabled && SOURCE_FETCHERS[key]);

        const total = enabledSources.length;
        let completed = 0;
        let totalNewPosts = 0;
        const activeSources = [];

        for (const [sourceKey, sourceConfig] of enabledSources) {
            sendSSE({ type: 'progress', source: sourceKey, status: 'fetching', completed, total });

            try {
                const fetcher = SOURCE_FETCHERS[sourceKey];
                // Fetchers that need keys get them as second arg
                const fetchPromise = ['reddit', 'twitter', 'youtube'].includes(sourceKey)
                    ? fetcher(sourceConfig, keys)
                    : fetcher(sourceConfig);
                // Per-source timeout: 30 seconds max
                const rawPosts = await Promise.race([
                    fetchPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Source timeout (30s)')), 30000))
                ]);

                let newForSource = 0;
                const existingIds = new Set(archive.posts.map(p => p.id));

                for (const rawPost of rawPosts) {
                    if (existingIds.has(rawPost.id)) continue; // deduplicate

                    const enrichedPost = processPost(rawPost, config);
                    archive.posts.push(enrichedPost);
                    existingIds.add(rawPost.id);
                    newForSource++;
                }

                if (newForSource > 0) activeSources.push(sourceKey);
                totalNewPosts += newForSource;
                completed++;

                sendSSE({ type: 'progress', source: sourceKey, status: 'complete', newPosts: newForSource, completed, total });
            } catch (err) {
                completed++;
                console.error(`[${sourceKey}] Error:`, err.message);
                sendSSE({ type: 'progress', source: sourceKey, status: 'error', error: err.message, completed, total });
            }
        }

        // Update metadata
        archive.metadata.lastUpdate = new Date().toISOString();
        archive.metadata.totalPosts = archive.posts.length;
        archive.metadata.sources = activeSources.join(', ');

        // Yearly archive split: if posts > 10000, move oldest complete year
        if (archive.posts.length > 10000) {
            // Sort by date
            archive.posts.sort((a, b) => new Date(a.date) - new Date(b.date));
            const currentYear = new Date().getFullYear();
            const oldPosts = archive.posts.filter(p => new Date(p.date).getFullYear() < currentYear);
            if (oldPosts.length > 0) {
                const oldestYear = new Date(oldPosts[0].date).getFullYear();
                const yearPosts = archive.posts.filter(p => new Date(p.date).getFullYear() === oldestYear);
                const archiveFile = path.join(__dirname, `QC_Aviation_Complaints_archive_${oldestYear}.json`);

                // Read existing archive file if it exists, merge
                let yearArchive = { posts: [] };
                try { yearArchive = JSON.parse(fs.readFileSync(archiveFile, 'utf8')); } catch {}
                yearArchive.posts.push(...yearPosts);
                writeJSON(archiveFile, yearArchive);

                // Remove archived posts from main file
                archive.posts = archive.posts.filter(p => new Date(p.date).getFullYear() !== oldestYear);
                archive.metadata.totalPosts = archive.posts.length;
            }
        }

        writeJSON(DATA_FILE, archive);
        sendSSE({ type: 'complete', totalNew: totalNewPosts, totalArchive: archive.posts.length });

    } catch (err) {
        console.error('Update cycle error:', err);
        sendSSE({ type: 'error', message: err.message });
    } finally {
        updateInProgress = false;
    }
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

// ===== EXPORT: PDF / DOCX GENERATION =====

// POST /api/export-pdf
// Receives: { filters, days, charts: { trends: base64, categories: base64 } }
// Generates markdown report, converts via pandoc, returns DOCX

async function handleExportPDF(req, res) {
    try {
        const body = await parseBody(req);
        const { filters = {}, days = 30, charts = {} } = body;

        // Load data
        const archive = readJSON(DATA_FILE);
        const config = loadCategories();

        // Filter posts (same logic as /api/complaints)
        let posts = [...archive.posts];
        if (filters.region && filters.region.length) {
            const regions = Array.isArray(filters.region) ? filters.region : filters.region.split(',');
            posts = posts.filter(p => regions.includes(p.region) || p.region === 'global');
        }
        if (filters.category && filters.category.length) {
            const cats = Array.isArray(filters.category) ? filters.category : filters.category.split(',');
            posts = posts.filter(p => {
                const pc = p.manualCategories || p.autoCategories || [];
                return pc.some(c => cats.includes(c));
            });
        }
        if (filters.dateFrom) posts = posts.filter(p => p.date >= filters.dateFrom);
        if (filters.dateTo) posts = posts.filter(p => p.date <= filters.dateTo);

        // Date formatting
        const now = new Date();
        const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const dateStr = String(now.getDate()).padStart(2,'0') + months[now.getMonth()] + now.getFullYear();

        // Calculate summary stats for the report
        const periodStart = new Date(now - days * 86400000);
        const periodPosts = posts.filter(p => new Date(p.date) >= periodStart);

        // Category counts
        const catCounts = {};
        const categories = ['technology', 'airframe_manufacturer', 'engine_manufacturer', 'airline_operations', 'regulatory', 'mro_maintenance'];
        const catLabels = { technology: 'Technology', airframe_manufacturer: 'Airframe Manufacturer', engine_manufacturer: 'Engine Manufacturer', airline_operations: 'Airline Operations', regulatory: 'Regulatory / Compliance', mro_maintenance: 'MRO / Maintenance' };
        categories.forEach(c => { catCounts[c] = periodPosts.filter(p => (p.manualCategories || p.autoCategories || []).includes(c)).length; });

        // Top entities
        const entityCounts = {};
        periodPosts.forEach(p => (p.entities || []).forEach(e => { entityCounts[e] = (entityCounts[e] || 0) + 1; }));
        const topEntities = Object.entries(entityCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);

        // Save chart images as temp files
        const tmpDir = path.join(__dirname, '.tmp_export');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const chartFiles = {};
        for (const [key, base64] of Object.entries(charts)) {
            if (!base64) continue;
            const data = base64.replace(/^data:image\/png;base64,/, '');
            const filePath = path.join(tmpDir, `${key}.png`);
            fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
            chartFiles[key] = filePath;
        }

        // Generate markdown
        let md = `---\ntitle: "Aviation Complaints Intelligence Report"\ndate: "${dateStr}"\n---\n\n`;
        md += `# Aviation Complaints Intelligence Report\n\n`;
        md += `**Report Date:** ${dateStr}\n\n`;
        md += `**Period:** Last ${days} days (${periodPosts.length} complaints)\n\n`;
        md += `**Total Archive:** ${archive.posts.length} complaints\n\n`;

        md += `## Executive Summary\n\n`;
        md += `This report analyses ${periodPosts.length} aviation industry complaints collected over the past ${days} days from multiple open-source intelligence channels.\n\n`;

        if (topEntities.length > 0) {
            md += `**Most discussed entities:**\n\n`;
            topEntities.slice(0, 5).forEach(([entity, count]) => {
                md += `- **${entity}** — ${count} mentions\n`;
            });
            md += '\n';
        }

        md += `## Acronyms\n\n`;
        md += `| Acronym | Definition |\n|---------|------------|\n`;
        md += `| AD | Airworthiness Directive |\n`;
        md += `| AOG | Aircraft on Ground |\n`;
        md += `| EASA | European Union Aviation Safety Agency |\n`;
        md += `| FAA | Federal Aviation Administration |\n`;
        md += `| MRO | Maintenance, Repair and Overhaul |\n`;
        md += `| OEM | Original Equipment Manufacturer |\n`;
        md += `| SDR | Service Difficulty Report |\n\n`;

        // Embed trend chart if available
        if (chartFiles.trends) {
            md += `## Complaint Trends\n\n`;
            md += `![Complaint Trends](${chartFiles.trends})\n\n`;
        }

        md += `## Category Analysis\n\n`;
        categories.forEach(cat => {
            if (catCounts[cat] > 0) {
                md += `### ${catLabels[cat]}\n\n`;
                md += `**${catCounts[cat]} complaints** in the past ${days} days.\n\n`;
                // Include top 3 example posts
                const examples = periodPosts.filter(p => (p.manualCategories || p.autoCategories || []).includes(cat)).slice(0, 3);
                examples.forEach(p => {
                    md += `> *"${(p.title || '').substring(0, 120)}"* — ${p.sourceDetail || p.source}\n\n`;
                });
            }
        });

        // Embed category chart
        if (chartFiles.categories) {
            md += `## Category Breakdown\n\n`;
            md += `![Category Breakdown](${chartFiles.categories})\n\n`;
        }

        md += `## Manufacturer Analysis\n\n`;
        if (topEntities.length > 0) {
            md += `| Entity | Mentions | Primary Category |\n|--------|----------|------------------|\n`;
            topEntities.forEach(([entity, count]) => {
                // Find most common category for this entity
                const entPosts = periodPosts.filter(p => (p.entities || []).includes(entity));
                const entCats = {};
                entPosts.forEach(p => (p.manualCategories || p.autoCategories || []).forEach(c => { entCats[c] = (entCats[c] || 0) + 1; }));
                const topCat = Object.entries(entCats).sort((a,b) => b[1] - a[1])[0];
                md += `| ${entity} | ${count} | ${topCat ? catLabels[topCat[0]] || topCat[0] : 'N/A'} |\n`;
            });
            md += '\n';
        }

        md += `## Regional Analysis\n\n`;
        const regionLabels = { apac: 'Asia-Pacific', emea: 'Europe, Middle East & Africa', americas: 'Americas', middle_east: 'Middle East', africa: 'Africa', global: 'Global' };
        const regionCounts = {};
        periodPosts.forEach(p => { regionCounts[p.region] = (regionCounts[p.region] || 0) + 1; });
        Object.entries(regionCounts).sort((a,b) => b[1] - a[1]).forEach(([region, count]) => {
            md += `- **${regionLabels[region] || region}:** ${count} complaints\n`;
        });
        md += '\n';

        md += `## Consulting Opportunities\n\n`;
        // Entities with significant complaint volume
        const opportunities = topEntities.filter(([_, count]) => count >= 5);
        if (opportunities.length > 0) {
            opportunities.forEach(([entity, count]) => {
                md += `### ${entity} (${count} complaints)\n\n`;
                const entPosts = periodPosts.filter(p => (p.entities || []).includes(entity)).slice(0, 2);
                entPosts.forEach(p => {
                    md += `> *"${(p.title || '').substring(0, 150)}"*\n\n`;
                });
            });
        } else {
            md += `No entities with sufficient complaint volume (5+) detected in this period.\n\n`;
        }

        md += `## References\n\nData sourced from: Reddit, aviation news RSS feeds, EASA Airworthiness Directives, Skytrax airline reviews, PPRuNe forums, YouTube comments, and manual entries.\n\n`;

        // Write markdown to temp file
        const mdFile = path.join(tmpDir, 'report.md');
        fs.writeFileSync(mdFile, md, 'utf8');

        // Try pandoc conversion
        const refDoc = path.join(__dirname, '..', 'Document_Publishing_Tools', 'reference_arial.docx');
        const outFile = path.join(tmpDir, 'report.docx');

        const pandocCmd = fs.existsSync(refDoc)
            ? `pandoc "${mdFile}" -o "${outFile}" --reference-doc="${refDoc}"`
            : `pandoc "${mdFile}" -o "${outFile}"`;

        await new Promise((resolve, reject) => {
            exec(pandocCmd, (err, stdout, stderr) => {
                if (err) reject(new Error('Pandoc failed: ' + (stderr || err.message)));
                else resolve();
            });
        });

        // Read and return DOCX
        const docx = fs.readFileSync(outFile);
        res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="QC_Aviation_Complaints_Report_${dateStr}.docx"`,
            'Content-Length': docx.length
        });
        res.end(docx);

        // Cleanup temp files
        try {
            fs.readdirSync(tmpDir).forEach(f => fs.unlinkSync(path.join(tmpDir, f)));
            fs.rmdirSync(tmpDir);
        } catch {}

    } catch (err) {
        console.error('Export PDF error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
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

    // ---- GET /api/complaints — paginated complaints list ----
    if (req.method === 'GET' && url === '/api/complaints') {
        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const sp = parsedUrl.searchParams;

            const filterCategory = sp.get('category') || null;
            const filterRegion   = sp.get('region')   || null;
            const filterSource   = sp.get('source')   || null;
            const filterDateFrom = sp.get('dateFrom') || null;
            const filterDateTo   = sp.get('dateTo')   || null;
            const filterSearch   = sp.get('search')   || null;
            const page           = Math.max(1, parseInt(sp.get('page')  || '1',  10));
            const limit          = Math.max(1, parseInt(sp.get('limit') || '50', 10));

            // Load main archive
            const archive = readJSON(DATA_FILE);
            let posts = Array.isArray(archive.posts) ? [...archive.posts] : [];

            // Merge yearly archive files
            try {
                const archiveFiles = fs.readdirSync(__dirname)
                    .filter(f => /^QC_Aviation_Complaints_archive_\d+\.json$/.test(f));
                for (const archiveFile of archiveFiles) {
                    const yearData = readJSON(path.join(__dirname, archiveFile));
                    if (Array.isArray(yearData.posts)) {
                        posts.push(...yearData.posts);
                    }
                }
            } catch (archiveErr) {
                console.warn('[complaints] Failed to read archive files:', archiveErr.message);
            }

            // Apply filters
            if (filterCategory) {
                posts = posts.filter(p => {
                    const cats = p.manualCategories || p.autoCategories || [];
                    return Array.isArray(cats) && cats.includes(filterCategory);
                });
            }

            if (filterRegion) {
                posts = posts.filter(p => p.region === filterRegion || p.region === 'global');
            }

            if (filterSource) {
                posts = posts.filter(p => p.source === filterSource);
            }

            if (filterDateFrom) {
                posts = posts.filter(p => p.date >= filterDateFrom);
            }

            if (filterDateTo) {
                posts = posts.filter(p => p.date <= filterDateTo);
            }

            if (filterSearch) {
                const searchLower = filterSearch.toLowerCase();
                posts = posts.filter(p => {
                    const text = ((p.title || '') + ' ' + (p.body || '')).toLowerCase();
                    return text.includes(searchLower);
                });
            }

            // Sort newest first
            posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            const total = posts.length;
            const paginated = posts.slice((page - 1) * limit, page * limit);

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ total, page, limit, posts: paginated }));
        } catch (err) {
            console.error('[GET /api/complaints] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ---- GET /api/summary — aggregated summary statistics ----
    if (req.method === 'GET' && url === '/api/summary') {
        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const sp = parsedUrl.searchParams;

            const days         = Math.max(1, parseInt(sp.get('days') || '30', 10));
            const filterRegion = sp.get('region') || null;

            // Load main archive
            const archive = readJSON(DATA_FILE);
            let allPosts = Array.isArray(archive.posts) ? [...archive.posts] : [];

            // Merge yearly archive files
            try {
                const archiveFiles = fs.readdirSync(__dirname)
                    .filter(f => /^QC_Aviation_Complaints_archive_\d+\.json$/.test(f));
                for (const archiveFile of archiveFiles) {
                    const yearData = readJSON(path.join(__dirname, archiveFile));
                    if (Array.isArray(yearData.posts)) {
                        allPosts.push(...yearData.posts);
                    }
                }
            } catch (archiveErr) {
                console.warn('[summary] Failed to read archive files:', archiveErr.message);
            }

            // Apply region filter
            if (filterRegion) {
                allPosts = allPosts.filter(p => p.region === filterRegion || p.region === 'global');
            }

            // Date windows
            const now        = new Date();
            const dateFrom   = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const prevDateTo = new Date(dateFrom.getTime());
            const prevDateFrom = new Date(dateFrom.getTime() - days * 24 * 60 * 60 * 1000);

            const currentPosts  = allPosts.filter(p => p.date >= dateFrom.toISOString() && p.date <= now.toISOString());
            const previousPosts = allPosts.filter(p => p.date >= prevDateFrom.toISOString() && p.date < prevDateTo.toISOString());

            // Category breakdown
            const CATEGORIES = ['technology', 'airframe_manufacturer', 'engine_manufacturer', 'airline_operations', 'regulatory', 'mro_maintenance'];

            const categoryBreakdown = {};
            for (const cat of CATEGORIES) {
                const currentCount  = currentPosts.filter(p => {
                    const cats = p.manualCategories || p.autoCategories || [];
                    return Array.isArray(cats) && cats.includes(cat);
                }).length;
                const previousCount = previousPosts.filter(p => {
                    const cats = p.manualCategories || p.autoCategories || [];
                    return Array.isArray(cats) && cats.includes(cat);
                }).length;
                const growth = previousCount === 0 ? 0 : Math.round((currentCount - previousCount) / previousCount * 100);
                categoryBreakdown[cat] = { count: currentCount, growth };
            }

            // Trend data — one entry per day in the current period
            const trendData = [];
            for (let i = 0; i < days; i++) {
                const dayStart = new Date(dateFrom.getTime() + i * 24 * 60 * 60 * 1000);
                const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
                const dayStr   = dayStart.toISOString().slice(0, 10);
                const dayPosts = currentPosts.filter(p => p.date >= dayStart.toISOString() && p.date < dayEnd.toISOString());

                const entry = { date: dayStr };
                for (const cat of CATEGORIES) {
                    entry[cat] = dayPosts.filter(p => {
                        const cats = p.manualCategories || p.autoCategories || [];
                        return Array.isArray(cats) && cats.includes(cat);
                    }).length;
                }
                trendData.push(entry);
            }

            // Manufacturer breakdown
            let config;
            try {
                config = loadCategories();
            } catch (_) {
                config = { entities: { airframe_oems: [], engine_oems: [] } };
            }

            const knownManufacturers = [
                ...(config.entities.airframe_oems || []),
                ...(config.entities.engine_oems   || [])
            ];

            const manufacturers = {};
            for (const post of currentPosts) {
                const postEntities = post.entities || [];
                const postCats = post.manualCategories || post.autoCategories || [];
                for (const mfr of knownManufacturers) {
                    if (postEntities.includes(mfr)) {
                        if (!manufacturers[mfr]) {
                            manufacturers[mfr] = {};
                            for (const cat of CATEGORIES) manufacturers[mfr][cat] = 0;
                        }
                        for (const cat of CATEGORIES) {
                            if (Array.isArray(postCats) && postCats.includes(cat)) {
                                manufacturers[mfr][cat]++;
                            }
                        }
                    }
                }
            }

            // Remove manufacturers with zero appearances
            for (const mfr of Object.keys(manufacturers)) {
                const total = CATEGORIES.reduce((sum, cat) => sum + manufacturers[mfr][cat], 0);
                if (total === 0) delete manufacturers[mfr];
            }

            // Cluster detection — group by primary entity, 5+ posts
            const entityGroups = {};
            for (const post of currentPosts) {
                const primaryEntity = (post.entities && post.entities[0]) || null;
                if (!primaryEntity) continue;
                if (!entityGroups[primaryEntity]) entityGroups[primaryEntity] = [];
                entityGroups[primaryEntity].push(post);
            }

            const clusters = [];
            for (const [entity, posts] of Object.entries(entityGroups)) {
                if (posts.length < 5) continue;

                const prevCount = previousPosts.filter(p =>
                    p.entities && p.entities[0] === entity
                ).length;

                const growth = prevCount === 0 ? 0 : Math.round((posts.length - prevCount) / prevCount * 100);

                // Most common category
                const catCounts = {};
                for (const p of posts) {
                    const cats = p.manualCategories || p.autoCategories || [];
                    for (const cat of (Array.isArray(cats) ? cats : [])) {
                        catCounts[cat] = (catCounts[cat] || 0) + 1;
                    }
                }
                const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 1);

                // Most frequent source
                const srcCounts = {};
                for (const p of posts) {
                    srcCounts[p.source] = (srcCounts[p.source] || 0) + 1;
                }
                const topSource = Object.entries(srcCounts).sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || 'unknown';

                clusters.push({
                    name:         entity + ' Issues',
                    entity,
                    count:        posts.length,
                    growth,
                    categories:   topCat,
                    topSource,
                    isOpportunity: growth > 20
                });
            }
            clusters.sort((a, b) => b.count - a.count);

            // Region counts
            const regionKeys = ['apac', 'emea', 'americas', 'middle_east', 'africa', 'global'];
            const regionCounts = {};
            for (const rk of regionKeys) regionCounts[rk] = 0;
            for (const post of currentPosts) {
                if (regionCounts.hasOwnProperty(post.region)) {
                    regionCounts[post.region]++;
                }
            }

            // newSinceLastUpdate
            const lastUpdate = (archive.metadata && archive.metadata.lastUpdate) || null;
            const newSinceLastUpdate = lastUpdate
                ? allPosts.filter(p => p.fetchDate === lastUpdate).length
                : 0;

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
                totalPosts:         (archive.metadata && archive.metadata.totalPosts) || allPosts.length,
                lastUpdate,
                period:             { days, from: dateFrom.toISOString(), to: now.toISOString() },
                newSinceLastUpdate,
                categoryBreakdown,
                trendData,
                manufacturers,
                clusters,
                regionCounts
            }));
        } catch (err) {
            console.error('[GET /api/summary] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
        }
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
        res.write('data: {"type":"connected"}\n\n');

        sseClients.add(res);

        req.on('close', () => {
            sseClients.delete(res);
        });
        return;
    }

    // ---- POST /api/update — trigger data fetch cycle ----
    if (req.method === 'POST' && url === '/api/update') {
        if (updateInProgress) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ status: 'already_running' }));
            return;
        }
        runUpdate(); // fire-and-forget — progress streamed via SSE
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'started' }));
        return;
    }

    // ---- POST /api/recategorise — update manual categories for a single post ----
    if (req.method === 'POST' && url === '/api/recategorise') {
        try {
            const body = await parseBody(req);
            const { postId, categories } = body;

            if (!postId) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'postId is required' }));
                return;
            }

            const archive = readJSON(DATA_FILE);
            const post = (archive.posts || []).find(p => p.id === postId);

            if (!post) {
                res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Post not found', postId }));
                return;
            }

            post.manualCategories = Array.isArray(categories) ? categories : null;
            writeJSON(DATA_FILE, archive);

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ status: 'ok', postId, categories: post.manualCategories }));
        } catch (err) {
            console.error('[POST /api/recategorise] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ---- POST /api/export-pdf — generate DOCX report via pandoc ----
    if (req.method === 'POST' && url === '/api/export-pdf') {
        await handleExportPDF(req, res);
        return;
    }

    // ---- POST /api/manual-add — manually add a complaint record ----
    if (req.method === 'POST' && url === '/api/manual-add') {
        try {
            const body = await parseBody(req);
            const { source, title, body: postBody, url: postUrl, categories, region } = body;

            const config = loadCategories();
            const postObj = {
                source:       source || 'manual',
                title:        title  || '',
                body:         postBody || ''
            };

            const now = new Date().toISOString();
            const newPost = {
                id:               `manual_${Date.now()}_${hashString(title || '')}`,
                source:           source || 'manual',
                sourceDetail:     source || 'Manual Entry',
                author:           'Manual Entry',
                date:             now,
                title:            title  || '',
                body:             postBody || '',
                url:              postUrl || '',
                autoCategories:   categorisePost(postObj, config),
                manualCategories: (Array.isArray(categories) && categories.length > 0) ? categories : null,
                sentiment:        'negative',
                region:           region || 'global',
                entities:         extractEntities(postObj, config),
                fetchDate:        now
            };

            const archive = readJSON(DATA_FILE);
            if (!Array.isArray(archive.posts)) archive.posts = [];
            archive.posts.push(newPost);
            archive.metadata = archive.metadata || {};
            archive.metadata.totalPosts = archive.posts.length;
            archive.metadata.lastUpdate = now;
            writeJSON(DATA_FILE, archive);

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ status: 'ok', post: newPost }));
        } catch (err) {
            console.error('[POST /api/manual-add] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
        }
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
