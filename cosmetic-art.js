/* cosmetic-art.js — how a worn cosmetic is drawn
 *
 * Shared by the game and the owner console. It lived inside flappycrix.html
 * until the console needed to draw the same hats, and a second copy of these
 * shapes would have started drifting from the first the next time one was
 * nudged — which is exactly the bug that made a hat sit in one place on the
 * bird and another in the locker.
 *
 * Everything here is pure drawing: no image loading, no Firestore, no game
 * state. The caller passes in the image (or null) and the fit, so the same
 * function serves a canvas in the game, a card in the shop and a preview in
 * the console.
 *
 * COORDINATES. Each shape draws in the bird's own space: the origin is the
 * middle of the sprite and `s` is the bird's size, so the art runs from -s/2
 * to +s/2 on both axes. The sprite is a close-up of the character's face, not
 * a small bird with room above its head — measured off the pixels, the face
 * runs from about -0.22s to +0.5s and the eyes sit near y = -0.03s. A hat
 * perches around y = -0.40s where the crown is; a mask is centred near y = 0,
 * over the face.
 */
(function (root) {
    'use strict';

    function hatStroke(g, s) {
        g.strokeStyle = 'rgba(12,6,20,.85)';
        g.lineWidth = Math.max(1, s * 0.05);
        g.lineJoin = 'round';
        g.stroke();
    }
    // roundRect only arrived in Chrome 99 and Safari 16.4. Calling it on
    // anything older throws, and this runs inside the draw loop, so it
    // would take out the whole frame rather than one hat.
    function hatRect(g, x, y, w, h, r) {
        if (typeof g.roundRect === 'function') { g.roundRect(x, y, w, h, r); return; }
        g.moveTo(x + r, y);
        g.arcTo(x + w, y,     x + w, y + h, r);
        g.arcTo(x + w, y + h, x,     y + h, r);
        g.arcTo(x,     y + h, x,     y,     r);
        g.arcTo(x,     y,     x + w, y,     r);
        g.closePath();
    }
    function hatBlob(g, s, fill, path) {
        g.fillStyle = fill;
        g.beginPath();
        path();
        g.fill();
        hatStroke(g, s);
    }

    const HAT_SHAPES = {
        // A cone that flops backwards, a fur band across the brow and a
        // pompom where the tip lands. The bird faces +x, so the tip goes
        // the other way.
        santa(g, s) {
            const top = -s * 0.40, tipX = -s * 0.60, tipY = -s * 0.70;
            hatBlob(g, s, '#E8323F', () => {          // the cap, flopping back
                g.moveTo(s * 0.36, top);
                g.quadraticCurveTo(s * 0.10, -s * 0.78, tipX, tipY);
                g.quadraticCurveTo(-s * 0.18, -s * 0.50, -s * 0.38, top);
                g.closePath();
            });
            hatBlob(g, s, '#FFFFFF', () => {          // fur band across the brow
                hatRect(g, -s * 0.44, top - s * 0.06, s * 0.86, s * 0.17, s * 0.085);
            });
            hatBlob(g, s, '#FFFFFF', () => {          // pompom, on the tip
                g.arc(tipX, tipY, s * 0.12, 0, Math.PI * 2);
            });
        },

        // A band, two soft ears and a pair of antlers with one prong each.
        reindeer(g, s) {
            const top = -s * 0.42;
            g.save();
            g.strokeStyle = '#6B4423';
            g.lineCap = 'round';
            g.lineWidth = s * 0.075;
            [-1, 1].forEach(d => {
                g.beginPath();
                g.moveTo(d * s * 0.20, top);
                g.quadraticCurveTo(d * s * 0.30, top - s * 0.28, d * s * 0.24, top - s * 0.48);
                g.stroke();
                g.beginPath();                                   // outward prong
                g.moveTo(d * s * 0.27, top - s * 0.24);
                g.lineTo(d * s * 0.46, top - s * 0.36);
                g.stroke();
                g.beginPath();                                   // inward prong
                g.moveTo(d * s * 0.26, top - s * 0.38);
                g.lineTo(d * s * 0.12, top - s * 0.50);
                g.stroke();
            });
            g.restore();
            [-1, 1].forEach(d => hatBlob(g, s, '#8B5A2B', () => {
                g.ellipse(d * s * 0.34, top - s * 0.06, s * 0.10, s * 0.15, d * 0.4, 0, Math.PI * 2);
            }));
            hatBlob(g, s, '#5A3A1E', () => {
                hatRect(g, -s * 0.40, top - s * 0.04, s * 0.80, s * 0.11, s * 0.055);
            });
        },

        // Wide brim, tall cone with a bend near the tip, and a band.
        witch(g, s) {
            const top = -s * 0.40;
            hatBlob(g, s, '#1E0F2E', () => {
                g.ellipse(0, top, s * 0.62, s * 0.15, 0, 0, Math.PI * 2);
            });
            hatBlob(g, s, '#2E1A46', () => {
                g.moveTo(-s * 0.30, top);
                g.quadraticCurveTo(-s * 0.26, -s * 0.80, -s * 0.50, -s * 0.94);
                g.quadraticCurveTo(-s * 0.16, -s * 0.84, s * 0.30, top);
                g.closePath();
            });
            hatBlob(g, s, '#8B3FD6', () => {
                hatRect(g, -s * 0.32, top - s * 0.15, s * 0.63, s * 0.13, s * 0.05);
            });
        },

        // A carved pumpkin worn over the head, so it is centred on the
        // head rather than perched above it.
        pumpkin(g, s) {
            const cy = s * 0.04, r = s * 0.36;
            hatBlob(g, s, '#2E7D32', () => {
                hatRect(g, -s * 0.05, cy - r - s * 0.16, s * 0.11, s * 0.20, s * 0.05);
            });
            hatBlob(g, s, '#F07F16', () => { g.ellipse(0, cy, r, r * 0.92, 0, 0, Math.PI * 2); });
            g.save();                                    // ribs
            g.strokeStyle = 'rgba(160,70,0,.45)';
            g.lineWidth = s * 0.035;
            [-0.46, 0.46].forEach(k => {
                g.beginPath();
                g.moveTo(r * k, cy - r * 0.82);
                g.quadraticCurveTo(r * k * 1.5, cy, r * k, cy + r * 0.82);
                g.stroke();
            });
            g.restore();
            g.fillStyle = '#2A1200';                      // the carving
            [-1, 1].forEach(d => {
                g.beginPath();
                g.moveTo(d * r * 0.18, cy - r * 0.05);
                g.lineTo(d * r * 0.62, cy - r * 0.20);
                g.lineTo(d * r * 0.56, cy + r * 0.20);
                g.closePath();
                g.fill();
            });
            g.beginPath();
            g.moveTo(-r * 0.60, cy + r * 0.34);
            g.lineTo(-r * 0.30, cy + r * 0.62);
            g.lineTo(-r * 0.08, cy + r * 0.36);
            g.lineTo(r * 0.16, cy + r * 0.64);
            g.lineTo(r * 0.44, cy + r * 0.36);
            g.lineTo(r * 0.60, cy + r * 0.52);
            g.lineTo(r * 0.30, cy + r * 0.74);
            g.lineTo(-r * 0.34, cy + r * 0.72);
            g.closePath();
            g.fill();
        },

        // A bone mask over the face: cranium, sockets, nose, teeth.
        skull(g, s) {
            const cy = -s * 0.04, r = s * 0.30;
            hatBlob(g, s, '#F2EDE4', () => {
                g.ellipse(0, cy - r * 0.10, r, r * 0.95, 0, 0, Math.PI * 2);
            });
            hatBlob(g, s, '#F2EDE4', () => {                      // jaw
                hatRect(g, -r * 0.46, cy + r * 0.52, r * 0.92, r * 0.52, r * 0.18);
            });
            g.fillStyle = '#17110F';
            [-1, 1].forEach(d => {
                g.beginPath();
                g.ellipse(d * r * 0.42, cy - r * 0.14, r * 0.26, r * 0.30, d * 0.2, 0, Math.PI * 2);
                g.fill();
            });
            g.beginPath();                                        // nose
            g.moveTo(0, cy + r * 0.12);
            g.lineTo(-r * 0.14, cy + r * 0.42);
            g.lineTo(r * 0.14, cy + r * 0.42);
            g.closePath();
            g.fill();
            g.save();                                             // teeth
            g.strokeStyle = '#17110F';
            g.lineWidth = s * 0.035;
            for (let i = -2; i <= 2; i++) {
                g.beginPath();
                g.moveTo(i * r * 0.20, cy + r * 0.56);
                g.lineTo(i * r * 0.20, cy + r * 1.00);
                g.stroke();
            }
            g.restore();
        },

        // Two long ears on a band, each with a pink inner.
        bunny(g, s) {
            const top = -s * 0.42;
            [-1, 1].forEach(d => {
                hatBlob(g, s, '#FFFFFF', () => {
                    g.ellipse(d * s * 0.20, top - s * 0.32, s * 0.13, s * 0.36,
                              d * 0.26, 0, Math.PI * 2);
                });
                g.fillStyle = '#FF9EC4';
                g.beginPath();
                g.ellipse(d * s * 0.21, top - s * 0.31, s * 0.06, s * 0.24,
                          d * 0.26, 0, Math.PI * 2);
                g.fill();
            });
            hatBlob(g, s, '#FFFFFF', () => {
                hatRect(g, -s * 0.38, top - s * 0.04, s * 0.76, s * 0.11, s * 0.055);
            });
        }
    };

    // A sprite centred on (cx, cy) inside a box, keeping its aspect ratio.
    function drawSprite(context, img, cx, cy, boxSize) {
        if (!img || !img.complete || !img.naturalWidth) return false;
        const ratio = img.naturalWidth / img.naturalHeight;
        let w = boxSize, h = boxSize;
        if (ratio > 1) h = boxSize / ratio;   // wider than tall
        else if (ratio < 1) w = boxSize * ratio;
        context.drawImage(img, cx - w / 2, cy - h / 2, w, h);
        return true;
    }

    // An image hat, hung off the top of the head.
    function drawHatImage(context, img, size) {
        if (!img || !img.complete || !img.naturalWidth) return;
        const ratio = img.naturalWidth / img.naturalHeight;
        const w = size * 0.86;
        const h = w / ratio;
        // Overlap the head by about a fifth of the hat's height
        const y = -size * 0.42 - h * 0.55;
        context.drawImage(img, -w / 2, y, w, h);
    }

    const FIT_DEFAULT = { x: 0, y: 0, scale: 1, rot: 0 };

    /* The one entry point for a worn head item.
       `img` is a loaded image or null — artwork wins whenever there is any,
       and the drawn shape stands in until the file exists.
       `fit` offsets are fractions of `size`, not pixels, so a fit made against
       a big preview is the same fit on a 30px bird. */
    function drawHatOn(context, item, size, img, fit) {
        if (!item) return;
        const f = Object.assign({}, FIT_DEFAULT, fit || {});
        const s = size * (f.scale || 1);
        context.save();
        context.translate(f.x * size, f.y * size);
        if (f.rot) context.rotate(f.rot * Math.PI / 180);
        if (img) drawHatImage(context, img, s);
        else if (item.draw && HAT_SHAPES[item.draw]) HAT_SHAPES[item.draw](context, s);
        context.restore();
    }

    // A trail: a fading, narrowing streak through the points behind the bird.
    function drawTrail(context, flat, colours, size) {
        if (!flat || flat.length < 4 || !colours || !colours.length) return;
        const n = flat.length / 2;
        context.save();
        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (let i = 1; i < n; i++) {
            const t = i / n;                       // 0 oldest -> 1 newest
            context.globalAlpha = t * t * 0.7;     // fade out fast at the tail
            context.lineWidth = Math.max(1, size * 0.5 * t);
            context.strokeStyle = colours[(n - i) % colours.length];
            context.beginPath();
            context.moveTo(flat[(i - 1) * 2], flat[(i - 1) * 2 + 1]);
            context.lineTo(flat[i * 2], flat[i * 2 + 1]);
            context.stroke();
        }
        context.restore();
    }

    root.CrixArt = {
        HAT_SHAPES: HAT_SHAPES,
        FIT_DEFAULT: FIT_DEFAULT,
        drawSprite: drawSprite,
        drawHatImage: drawHatImage,
        drawHatOn: drawHatOn,
        drawTrail: drawTrail
    };
})(typeof window !== 'undefined' ? window : globalThis);
