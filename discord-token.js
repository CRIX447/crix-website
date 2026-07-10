// api/discord-token.js
// Vercel Edge Function — exchanges Discord auth code for access token
// This is the ONLY place the Discord client secret is used (server-side only)
// Deploy this alongside your site on Vercel and set these environment variables:
//   DISCORD_CLIENT_ID     — from Discord Developer Portal
//   DISCORD_CLIENT_SECRET — from Discord Developer Portal
//   DISCORD_REDIRECT_URI  — must match exactly: https://crixgamingvr.com/flappycrix

export default async function handler(req) {
    // Only allow POST
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // CORS — only allow your own domain
    const origin = req.headers.get('origin') || '';
    const allowed = ['https://crixgamingvr.com', 'https://www.crixgamingvr.com'];
    if (!allowed.includes(origin)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
            status: 400,
            headers: corsHeaders(origin)
        });
    }

    const { code } = body;
    if (!code) {
        return new Response(JSON.stringify({ error: 'Missing code' }), {
            status: 400,
            headers: corsHeaders(origin)
        });
    }

    // Read secrets from Vercel environment variables (never exposed to browser)
    const CLIENT_ID = process.env.1521661170438635644;
    const CLIENT_SECRET = process.env.a7drUAm_7CDUwSP8DQfNVCVUKAVeiNgR;
    const REDIRECT_URI = process.env.https://crixgamingvr.com/flappycrix || 'https://crixgamingvr.com/flappycrix';

    if (!CLIENT_ID || !CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: 'Server not configured — set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in Vercel env vars' }), {
            status: 500,
            headers: corsHeaders(origin)
        });
    }

    try {
        // Exchange auth code for access token using client secret (server-side only)
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            })
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok || !tokenData.access_token) {
            return new Response(JSON.stringify({
                error: 'Discord token exchange failed',
                detail: tokenData.error_description || tokenData.error || 'unknown'
            }), {
                status: 400,
                headers: corsHeaders(origin)
            });
        }

        // Fetch Discord user profile using the token
        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const user = await userRes.json();

        if (!user.id) {
            return new Response(JSON.stringify({ error: 'Failed to fetch Discord user' }), {
                status: 500,
                headers: corsHeaders(origin)
            });
        }

        // Return only what the client needs — never return the client secret
        return new Response(JSON.stringify({
            access_token: tokenData.access_token,
            token_type: tokenData.token_type,
            expires_in: tokenData.expires_in,
            user: {
                id: user.id,
                username: user.username,
                global_name: user.global_name,
                avatar: user.avatar,
                email: user.email || null
            }
        }), {
            status: 200,
            headers: corsHeaders(origin)
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: 'Internal error', detail: err.message }), {
            status: 500,
            headers: corsHeaders(origin)
        });
    }
}

function corsHeaders(origin) {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

export const config = { runtime: 'edge' };
