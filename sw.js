/* Flappy Crix — offline support.
 *
 * Registered by the game with scope /flappycrix, so it only ever controls the
 * game page; the rest of the site behaves exactly as it did.
 *
 * What it does:
 *   - The game page itself: network first, so an online player always gets
 *     the latest build. Only when the network fails (or takes too long) is the
 *     last good copy served, and that is what makes the game open offline.
 *   - Everything else the game loads from this site (scripts, images,
 *     sounds, the font): kept after first use and served from here, refreshed
 *     in the background. The page tells this worker exactly which files it
 *     loaded, so nothing is hard-coded here that can drift out of date.
 *   - Never touched: other sites, anything under /api, api.json, video, and
 *     partial (range) requests. Live data must always be live.
 *
 * Bump VERSION to throw every cached file away on the next visit.
 */
const VERSION = 'crix-offline-v1';
const SHELL = '/flappycrix';
const NAV_TIMEOUT_MS = 6000;

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(VERSION)
            .then(c => fetch(new Request(SHELL, { cache: 'reload' }))
                .then(async r => (r.ok ? c.put(SHELL, await plain(r)) : null)))
            .catch(() => { /* first visit offline: nothing to do yet */ })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
        await self.clients.claim();
    })());
});

// The page sends the list of files it actually loaded this session
self.addEventListener('message', event => {
    const d = event.data || {};
    if (d.type === 'cache-urls' && Array.isArray(d.urls)) event.waitUntil(cacheUrls(d.urls));
});

async function cacheUrls(urls) {
    const c = await caches.open(VERSION);
    for (const u of urls) {
        try {
            const url = new URL(u, self.location.origin);
            if (url.origin !== self.location.origin || skip(url)) continue;
            if (await c.match(url.href)) continue;
            const r = await fetch(url.href, { credentials: 'same-origin' });
            if (cacheable(r)) await c.put(url.href, r);
        } catch (e) { /* one missing file must not stop the rest */ }
    }
}

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;       // other sites: untouched
    if (skip(url)) return;
    if (req.mode === 'navigate') {
        if (isGame(url.pathname)) event.respondWith(gamePage(req));
        return;
    }
    if (req.headers.has('range')) return;                  // audio/video seeking
    event.respondWith(asset(req));
});

function isGame(path) { return /^\/(flappycrix|game)(\.html)?\/?$/.test(path); }
function skip(url) {
    return url.pathname.startsWith('/api/') || url.pathname === '/api.json' ||
           url.pathname.startsWith('/_vercel/') || url.pathname === '/sw.js' ||
           url.searchParams.has('ping') || /\.mp4$/i.test(url.pathname);
}
function cacheable(r) {
    return r && r.ok && r.type === 'basic' && r.status === 200 && !r.headers.has('content-range');
}
// A response that followed a redirect cannot be handed back for a
// navigation, so the body is re-wrapped without that history.
function plain(r) {
    if (!r.redirected) return r;
    return r.blob().then(b => new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers }));
}

async function gamePage(req) {
    const c = await caches.open(VERSION);
    try {
        const r = await Promise.race([
            fetch(req),
            new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), NAV_TIMEOUT_MS))
        ]);
        if (r && r.ok && r.type === 'basic') c.put(SHELL, await plain(r.clone()));
        return r;
    } catch (e) {
        const cached = await c.match(SHELL);
        if (cached) return cached;
        return fetch(req);               // nothing cached: let the browser say it is offline
    }
}

async function asset(req) {
    const c = await caches.open(VERSION);
    const exact = await c.match(req);
    if (exact) {
        // Served at once; refreshed behind the scenes for next time
        fetch(req).then(r => { if (cacheable(r)) c.put(req, r); }).catch(() => {});
        return exact;
    }
    try {
        const r = await fetch(req);
        if (cacheable(r)) c.put(req, r.clone());
        return r;
    } catch (e) {
        // Offline and this exact version was never cached: an older version
        // of the same file (a different ?v=) beats nothing at all.
        const loose = await c.match(req, { ignoreSearch: true });
        if (loose) return loose;
        throw e;
    }
}
