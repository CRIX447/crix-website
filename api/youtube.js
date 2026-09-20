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

// RSS needs no key and no quota — a reliable fallback when the Data API
// fails for any reason (bad key, referrer restriction, quota exhausted).
async function uploadsViaRss(channelId) {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!r.ok) throw new Error(`RSS returned ${r.status}`);
    const xml = await r.text();
    const items = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
        const e = m[1];
        const pick = (tag) => (e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`)) || [,''])[1];
        const id = pick('yt:videoId');
        return {
            snippet: {
                title: pick('title').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"'),
                publishedAt: pick('published'),
                description: '',
                resourceId: { videoId: id },
                thumbnails: {
                    medium:  { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` },
                    default: { url: `https://i.ytimg.com/vi/${id}/default.jpg` }
                }
            }
        };
    });
    return { items, _source: 'rss' };
}

module.exports = async function handler(req, res) {
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

        // If the Data API can't serve uploads, fall back to the public RSS feed
        // rather than showing the user an error.
        if (data.error && (action === 'uploads' || action === 'stats')) {
            const cid = channelId || CHANNEL;
            if (cid) {
                try {
                    const rss = await uploadsViaRss(cid);
                    console.warn('[youtube] Data API failed, served RSS instead:', data.error.message);
                    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
                    return res.status(200).json(rss);
                } catch (rssErr) {
                    console.error('[youtube] RSS fallback also failed:', rssErr.message);
                }
            }
        }

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return res.status(r.status).json(data);
    } catch (e) {
        // Total failure of the Data API — try RSS before giving up
        if (action === 'uploads') {
            const cid = channelId || CHANNEL;
            if (cid) {
                try { return res.status(200).json(await uploadsViaRss(cid)); }
                catch (rssErr) { /* fall through */ }
            }
        }
        return res.status(502).json({ error: 'Upstream request failed', detail: e.message });
    }
}
