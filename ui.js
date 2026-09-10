/**
 * ui.js — platform and theme manager
 * CRIX STUDIOS
 *
 * One place that decides how the interface behaves, instead of the same
 * checks scattered through game.html.
 *
 * Sets classes on <html>:
 *   plat-desktop  plat-mobile  plat-console  plat-browser
 *   theme-dark    theme-light
 *   input-touch   input-pad    input-mouse
 *
 * Everything else keys off those. Add ui.js before the game script.
 */
(function () {
    'use strict';

    /* ─────────── PLATFORM ─────────── */

    const ua = navigator.userAgent;

    const PLATFORMS = {
        console: {
            test: () => /Xbox|PlayStation|Nintendo|SmartTV|SMART-TV|Tizen|Web0S/i.test(ua),
            input: 'pad',
            // A TV is viewed from across a room, so everything scales up
            scale: 1.35,
            showPrompts: true
        },
        desktop: {
            test: () => !!window.CRIX_DESKTOP?.isDesktop || /Electron/i.test(ua),
            input: 'mouse',
            scale: 1,
            showPrompts: false
        },
        mobile: {
            test: () => !!window.__IS_ANDROID_APP__ ||
                        /Android|iPhone|iPad|iPod/i.test(ua) ||
                        (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)),
            input: 'touch',
            scale: 1,
            showPrompts: false
        },
        browser: {
            test: () => true,          // whatever is left
            input: 'mouse',
            scale: 1,
            showPrompts: false
        }
    };

    // Order matters — console first, because an Xbox user agent also says
    // "Windows", and a phone in the app also matches mobile.
    const ORDER = ['console', 'desktop', 'mobile', 'browser'];
    const name = ORDER.find(k => PLATFORMS[k].test());
    const platform = PLATFORMS[name];

    /* ─────────── BUTTON PROMPTS ───────────
       Consoles expect to be told which button does what. The glyphs differ
       per family, so they are looked up rather than hardcoded. */

    const PAD_GLYPHS = {
        xbox: {
            a: 'Ⓐ', b: 'Ⓑ', x: 'Ⓧ', y: 'Ⓨ',
            start: '☰', back: '⧉', lb: 'LB', rb: 'RB',
            label: 'Xbox'
        },
        playstation: {
            a: '✕', b: '○', x: '□', y: '△',
            start: 'OPTIONS', back: 'SHARE', lb: 'L1', rb: 'R1',
            label: 'PlayStation'
        },
        nintendo: {
            a: 'A', b: 'B', x: 'X', y: 'Y',
            start: '+', back: '−', lb: 'L', rb: 'R',
            label: 'Nintendo'
        },
        generic: {
            a: 'A', b: 'B', x: 'X', y: 'Y',
            start: 'START', back: 'SELECT', lb: 'LB', rb: 'RB',
            label: 'Controller'
        }
    };

    function padFamily() {
        if (/PlayStation/i.test(ua)) return 'playstation';
        if (/Nintendo/i.test(ua)) return 'nintendo';
        if (/Xbox/i.test(ua)) return 'xbox';

        // A connected pad can identify itself even in a browser
        try {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (const p of pads) {
                if (!p) continue;
                const id = (p.id || '').toLowerCase();
                if (id.includes('dualsense') || id.includes('dualshock') || id.includes('playstation'))
                    return 'playstation';
                if (id.includes('nintendo') || id.includes('switch')) return 'nintendo';
                if (id.includes('xbox') || id.includes('xinput')) return 'xbox';
            }
        } catch (e) {}
        return 'generic';
    }

    /* ─────────── THEME ─────────── */

    const THEMES = {
        dark: {
            '--bg': '#0A0A0F',
            '--panel': '#101018',
            '--panel2': '#15151F',
            '--line': 'rgba(255,255,255,.07)',
            '--txt': '#EDEDED',
            '--dim': '#8C8C8C',
            '--canvas-bg': '#0d0d16'
        },
        light: {
            '--bg': '#F4F4F7',
            '--panel': '#FFFFFF',
            '--panel2': '#EDEDF2',
            '--line': 'rgba(0,0,0,.1)',
            '--txt': '#1A1A22',
            '--dim': '#6A6A75',
            '--canvas-bg': '#E8E8EE'
        }
    };

    function applyTheme(which) {
        const t = THEMES[which] || THEMES.dark;
        const root = document.documentElement;
        Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v));
        root.classList.remove('theme-dark', 'theme-light');
        root.classList.add('theme-' + which);
        try { localStorage.setItem('crix_theme', which); } catch (e) {}
        // Colours the phone status bar to match
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = t['--bg'];
    }

    function savedTheme() {
        try {
            const s = localStorage.getItem('crix_theme');
            if (s) return s;
        } catch (e) {}
        // Follow the system if they have never chosen
        return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    /* ─────────── APPLY ─────────── */

    const root = document.documentElement;
    root.classList.add('plat-' + name, 'input-' + platform.input);
    if (platform.showPrompts) root.classList.add('show-prompts');
    if (platform.scale !== 1) root.style.setProperty('--ui-scale', platform.scale);

    applyTheme(savedTheme());

    // A pad plugged in later should switch the interface over
    window.addEventListener('gamepadconnected', () => {
        root.classList.add('input-pad', 'show-prompts');
        CrixUI.family = padFamily();
        CrixUI.refreshPrompts();
    });

    /* ─────────── PUBLIC API ─────────── */

    const CrixUI = {
        platform: name,
        input: platform.input,
        family: padFamily(),
        isConsole: name === 'console',
        isMobile: name === 'mobile',
        isDesktop: name === 'desktop',
        isBrowser: name === 'browser',

        glyph(button) {
            return (PAD_GLYPHS[this.family] || PAD_GLYPHS.generic)[button] || button.toUpperCase();
        },

        // <span data-prompt="a">Play</span> becomes "Ⓐ Play" on a console
        refreshPrompts() {
            const on = root.classList.contains('show-prompts');
            document.querySelectorAll('[data-prompt]').forEach(el => {
                let tag = el.querySelector('.btn-prompt');
                if (!on) { tag?.remove(); return; }
                if (!tag) {
                    tag = document.createElement('span');
                    tag.className = 'btn-prompt';
                    el.prepend(tag);
                }
                tag.textContent = this.glyph(el.dataset.prompt);
            });
        },

        setTheme: applyTheme,
        theme: () => root.classList.contains('theme-light') ? 'light' : 'dark',
        toggleTheme() {
            const next = this.theme() === 'light' ? 'dark' : 'light';
            applyTheme(next);
            return next;
        }
    };

    window.CrixUI = CrixUI;

    document.addEventListener('DOMContentLoaded', () => CrixUI.refreshPrompts());

    console.log(`[UI] ${name} · ${platform.input} · ${CrixUI.family} · ${CrixUI.theme()}`);
})();
