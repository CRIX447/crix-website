// api/youtube.js
// Vercel Serverless Function — proxies YouTube Data API calls.
//
// WHY: a browser can never hold a secret. Any key in api.json or in page
// source can be read by anyone who opens DevTools. Moving the call here
// means the key lives in a Vercel environment variable and is only ever
// used server-side.
//
// SETUP (Vercel dashboard → Project → Settings → Environment Variables):
//   YOUTUBE_API_KEY   = your key
//   YOUTUBE_CHANNEL_ID = UCjiqZo0vfIZsn8E50TrOV_g
// Then REGENERATE the old key in Google Cloud, since it has been public.
//
// Client calls: /api/youtube?action=stats
//               /api/youtube?action=uploads&channelId=UC...
//               /api/youtube?action=live
//               /api/youtube?action=resolve&handle=@Name

const ALLOWED_ORIGINS = [
    'https://crixgamingvr.com',
    'https://www.crixgamingvr.com'
];

// Only these endpoints can be reached, so the proxy can't be used
// as an open relay for arbitrary Google API calls.
const ACTIONS = {
    stats:   ch => `channels?part=statistics,contentDetails&id=${ch}`,
    resolve: (_, p) => `channels?part=id,statistics,contentDetails&forHandle=${encodeURIComponent(String(p.handle || '').replace(/^@/, ''))}`,
    uploads: (_, p) => `playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(p.playlistId || '')}`,
    live:    ch => `search?part=snippet&channelId=${ch}&eventType=live&type=video`
};

export default async function handler(req, res) {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const KEY = process.env.YOUTUBE_API_KEY;
    const CHANNEL = process.env.YOUTUBE_CHANNEL_ID;
    if (!KEY) {
        return res.status(500).json({ error: 'YOUTUBE_API_KEY not set in Vercel environment variables' });
    }

    const { action, channelId } = req.query;
    const build = ACTIONS[action];
    if (!build) {
        return res.status(400).json({ error: 'Unknown action', allowed: Object.keys(ACTIONS) });
    }

    const path = build(channelId || CHANNEL, req.query);
    const url = `https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`;

    try {
        const r = await fetch(url);
        const data = await r.json();
        // Cache at the edge so repeat visitors don't burn quota
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return res.status(r.status).json(data);
    } catch (e) {
        return res.status(502).json({ error: 'Upstream request failed', detail: e.message });
    }
}
