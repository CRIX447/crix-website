/* cosmetic-art.js — how a worn cosmetic is drawn
 *
 * Shared by the game and the owner console. It lived inside flappycrix.html
 * until the console needed to draw the same hats, and a second copy of these
 * shapes would have started drifting from the first the next time one was
 * nudged — which is exactly the bug that made a hat sit in one place on the
 * bird and another in the locker.
 *
 * Everything here is pure drawing: no image loading, no Firestore, no game
 * state. The caller passes in the image (or null), the fit and the wobble,
 * so the same function serves a canvas in the game, a card in the shop and a
 * preview in the console.
 *
 * COORDINATES. Each shape draws in the bird's own space: the origin is the
 * middle of the sprite and `s` is the bird's size, so the sprite runs from
 * -s/2 to +s/2 on both axes.
 *
 * MEASURED OFF THE PIXELS (800x800 source, sampled row by row):
 *
 *      y = -0.50   the sprite's top edge — and already the crown of the
 *                  character's hood. There is NO headroom above the head.
 *      -0.50..-0.24  the hood: 98-100% dark pixels, about 0.86s wide
 *      -0.22       the face starts; it is lighter from here down
 *      -0.03       the eyes
 *      +0.38       the widest row, the shoulders
 *
 * That top line is the one that matters and the one the first version of
 * this file got wrong. It assumed a hat could perch at -0.40 in clear air.
 * There is no clear air at -0.40: it is the middle of the hood, so every
 * band drew as a bar painted across the character's head. A hat rests its
 * brim at HEAD_TOP and puts its body ABOVE the sprite, in negative space.
 */
(function (root) {
    'use strict';

    // Where a hat meets the head, and how wide the head is there. Every
    // shape measures from these two rather than from its own guesses.
    const HEAD_TOP = -0.455;   // brim line: just inside the crown at -0.50
    const HEAD_W   = 0.88;     // a shade wider than the hood, so it overhangs
    const FACE_CY  = -0.045;   // middle of the face, for the masks

    function hatStroke(g, s, colour, width) {
        g.strokeStyle = colour || 'rgba(12,6,20,.85)';
        g.lineWidth = Math.max(1, s * (width || 0.045));
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
    function hatBlob(g, s, fill, path, strokeColour, strokeWidth) {
        g.fillStyle = fill;
        g.beginPath();
        path();
        g.fill();
        hatStroke(g, s, strokeColour, strokeWidth);
    }
    // A band gets a thin, soft line. The full-weight outline used everywhere
    // else turns a pale band into a bar painted across the head.
    const BAND_LINE = 'rgba(20,12,30,.45)', BAND_W = 0.022;

    /* A band that follows the dome of the hood instead of cutting across it.
       Flat rectangles were what made these read as bars stuck on the face. */
    function domeBand(g, s, y, h, w) {
        const half = (w || HEAD_W) * s / 2, lift = s * 0.055;
        g.moveTo(-half, y * s + h * s);
        g.quadraticCurveTo(0, y * s + h * s - lift, half, y * s + h * s);
        g.lineTo(half, y * s);
        g.quadraticCurveTo(0, y * s - lift, -half, y * s);
        g.closePath();
    }

    /* Gradients cost an allocation each, and a hat is redrawn every frame for
       every player on screen, so the handful in use are kept by shape+size. */
    const _grads = new Map();
    function shade(g, s, key, x0, y0, x1, y1, stops) {
        const id = key + '@' + Math.round(s);
        let gr = _grads.get(id);
        if (!gr) {
            gr = g.createLinearGradient(x0 * s, y0 * s, x1 * s, y1 * s);
            stops.forEach(st => gr.addColorStop(st[0], st[1]));
            _grads.set(id, gr);
            if (_grads.size > 80) _grads.clear();   // sizes change; don't hoard
        }
        return gr;
    }

    /* Rotate a dangling part about the point it hangs from. The pivot is
       where the part meets the hat, so an ear bends at its root and a cap's
       tip swings from the brim, which is how they do it. */
    function swingAbout(g, px, py, ang, draw) {
        if (!ang) { draw(); return; }
        g.save();
        g.translate(px, py);
        g.rotate(ang);
        g.translate(-px, -py);
        draw();
        g.restore();
    }

    /* Each shape takes (context, size, swing). `swing` is radians and is 0
       when the caller has no physics to offer — every shape must look right
       at 0, because the shop cards and the catalogue draw them still. */
    const HAT_SHAPES = {
        // A cone that flops backwards over a roll of fur. The bird faces +x,
        // so the tip goes the other way. The tip and pompom swing.
        santa(g, s, w) {
            const brim = HEAD_TOP;
            swingAbout(g, 0, brim * s, w * 1.15, () => {
                hatBlob(g, s, shade(g, s, 'santa', -0.3, -1.0, 0.3, brim, [
                    [0, '#FF5A66'], [0.55, '#E2242F'], [1, '#A9121B']
                ]), () => {
                    g.moveTo(HEAD_W * s * 0.47, brim * s);
                    g.quadraticCurveTo(s * 0.28, -s * 0.92, -s * 0.30, -s * 0.98);
                    g.quadraticCurveTo(-s * 0.62, -s * 1.00, -s * 0.66, -s * 0.86);
                    g.quadraticCurveTo(-s * 0.52, -s * 0.70, -s * 0.44, brim * s);
                    g.closePath();
                });
                hatBlob(g, s, '#FFFFFF', () => {             // pompom, on the tip
                    g.arc(-s * 0.64, -s * 0.86, s * 0.125, 0, Math.PI * 2);
                });
            });
            hatBlob(g, s, shade(g, s, 'santafur', 0, brim - 0.02, 0, brim + 0.13, [
                [0, '#FFFFFF'], [1, '#D2D8E1']
            ]), () => domeBand(g, s, brim - 0.02, 0.125, HEAD_W + 0.04), BAND_LINE, BAND_W);
        },

        // Antlers, two soft ears and a thin strap. The antlers and the ears
        // swing; the strap does not, because it is buckled on.
        reindeer(g, s, w) {
            const brim = HEAD_TOP;
            swingAbout(g, 0, brim * s, w * 0.9, () => {
                g.save();
                g.strokeStyle = '#7A4E28';
                g.lineCap = 'round';
                g.lineJoin = 'round';
                [-1, 1].forEach(d => {
                    g.lineWidth = s * 0.085;
                    g.beginPath();                                   // main beam
                    g.moveTo(d * s * 0.22, brim * s);
                    g.bezierCurveTo(d * s * 0.40, -s * 0.66,
                                    d * s * 0.28, -s * 0.84,
                                    d * s * 0.36, -s * 1.02);
                    g.stroke();
                    g.lineWidth = s * 0.062;
                    g.beginPath();                                   // lower tine
                    g.moveTo(d * s * 0.335, -s * 0.66);
                    g.quadraticCurveTo(d * s * 0.58, -s * 0.70, d * s * 0.64, -s * 0.86);
                    g.stroke();
                    g.lineWidth = s * 0.055;
                    g.beginPath();                                   // upper tine
                    g.moveTo(d * s * 0.305, -s * 0.85);
                    g.quadraticCurveTo(d * s * 0.14, -s * 0.94, d * s * 0.10, -s * 1.08);
                    g.stroke();
                });
                g.restore();
                [-1, 1].forEach(d => {                       // ears, clear of the face
                    hatBlob(g, s, '#B07A42', () => {
                        g.ellipse(d * s * 0.505, brim * s - s * 0.045,
                                  s * 0.095, s * 0.155, d * 0.62, 0, Math.PI * 2);
                    });
                    g.fillStyle = 'rgba(255,183,201,.8)';
                    g.beginPath();
                    g.ellipse(d * s * 0.505, brim * s - s * 0.045,
                              s * 0.042, s * 0.085, d * 0.62, 0, Math.PI * 2);
                    g.fill();
                });
            });
            hatBlob(g, s, '#6B4526', () => domeBand(g, s, brim, 0.058, HEAD_W - 0.02),
                    BAND_LINE, BAND_W);
            hatBlob(g, s, '#E0B347', () => {                  // little buckle
                hatRect(g, -s * 0.048, brim * s + s * 0.002, s * 0.096, s * 0.052, s * 0.016);
            }, BAND_LINE, BAND_W);
        },

        // Wide brim, a tall cone with a kink near the tip, a buckled band.
        // The cone sways; the brim is pinned to the head.
        witch(g, s, w) {
            const brim = HEAD_TOP;
            swingAbout(g, 0, brim * s, w * 1.25, () => {
                hatBlob(g, s, shade(g, s, 'witch', -0.4, -1.2, 0.35, brim, [
                    [0, '#7A3FB8'], [0.45, '#3A1F5C'], [1, '#1B0E2C']
                ]), () => {
                    g.moveTo(s * 0.30, brim * s);
                    g.quadraticCurveTo(s * 0.20, -s * 0.80, -s * 0.10, -s * 0.98);
                    g.quadraticCurveTo(-s * 0.40, -s * 1.12, -s * 0.50, -s * 1.22);
                    g.quadraticCurveTo(-s * 0.30, -s * 0.94, -s * 0.34, brim * s);
                    g.closePath();
                });
                hatBlob(g, s, '#8B3FD6', () => {              // band round the cone
                    g.moveTo(-s * 0.335, brim * s - s * 0.005);
                    g.lineTo(s * 0.30, brim * s - s * 0.005);
                    g.lineTo(s * 0.275, brim * s - s * 0.145);
                    g.lineTo(-s * 0.315, brim * s - s * 0.145);
                    g.closePath();
                });
                hatBlob(g, s, '#F5D14A', () => {              // buckle
                    hatRect(g, -s * 0.065, brim * s - s * 0.125, s * 0.13, s * 0.10, s * 0.025);
                });
            });
            hatBlob(g, s, shade(g, s, 'witchbrim', 0, brim - 0.07, 0, brim + 0.09, [
                [0, '#331B50'], [1, '#150A24']
            ]), () => {
                g.ellipse(0, brim * s, s * 0.70, s * 0.145, 0, 0, Math.PI * 2);
            });
        },

        // A carved pumpkin worn over the whole head, so it sits over the face
        // and the hood rather than perching above them.
        pumpkin(g, s) {
            const cy = FACE_CY - 0.05, r = s * 0.455;
            hatBlob(g, s, '#3F7A2E', () => {                  // stalk
                g.moveTo(-s * 0.055, cy * s - r * 0.86);
                g.quadraticCurveTo(-s * 0.02, cy * s - r * 1.22, s * 0.075, cy * s - r * 1.26);
                g.quadraticCurveTo(s * 0.015, cy * s - r * 1.08, s * 0.06, cy * s - r * 0.84);
                g.closePath();
            });
            hatBlob(g, s, shade(g, s, 'pump', -0.35, -0.4, 0.35, 0.4, [
                [0, '#FFAE3D'], [0.5, '#F0761A'], [1, '#B8490A']
            ]), () => { g.ellipse(0, cy * s, r, r * 0.86, 0, 0, Math.PI * 2); });
            g.save();                                         // ribs
            g.strokeStyle = 'rgba(150,62,0,.40)';
            g.lineWidth = s * 0.03;
            [-0.52, 0, 0.52].forEach(k => {
                g.beginPath();
                g.moveTo(r * k * 0.9, cy * s - r * 0.86);
                g.quadraticCurveTo(r * k * 1.45, cy * s, r * k * 0.9, cy * s + r * 0.86);
                g.stroke();
            });
            g.restore();
            // The carving glows, which is the whole point of a jack-o'-lantern
            g.save();
            g.fillStyle = '#FFE08A';
            g.shadowColor = 'rgba(255,170,40,.95)';
            g.shadowBlur = s * 0.13;
            [-1, 1].forEach(d => {
                g.beginPath();
                g.moveTo(d * r * 0.16, cy * s - r * 0.02);
                g.lineTo(d * r * 0.58, cy * s - r * 0.24);
                g.lineTo(d * r * 0.54, cy * s + r * 0.16);
                g.closePath();
                g.fill();
            });
            g.beginPath();                                    // nose
            g.moveTo(0, cy * s + r * 0.10);
            g.lineTo(-r * 0.13, cy * s + r * 0.34);
            g.lineTo(r * 0.13, cy * s + r * 0.34);
            g.closePath();
            g.fill();
            g.beginPath();                                    // grin
            g.moveTo(-r * 0.58, cy * s + r * 0.42);
            g.lineTo(-r * 0.32, cy * s + r * 0.64);
            g.lineTo(-r * 0.10, cy * s + r * 0.44);
            g.lineTo(r * 0.14, cy * s + r * 0.66);
            g.lineTo(r * 0.40, cy * s + r * 0.44);
            g.lineTo(r * 0.58, cy * s + r * 0.56);
            g.lineTo(r * 0.28, cy * s + r * 0.76);
            g.lineTo(-r * 0.32, cy * s + r * 0.74);
            g.closePath();
            g.fill();
            g.restore();
        },

        // A bone mask over the face: cranium, cheekbones, sockets, teeth.
        skull(g, s) {
            const cy = FACE_CY - 0.05, r = s * 0.35;
            hatBlob(g, s, shade(g, s, 'skull', -0.3, -0.4, 0.3, 0.3, [
                [0, '#FFFDF7'], [1, '#CFC6B4']
            ]), () => {                                       // cranium + cheeks
                g.moveTo(-r * 0.98, cy * s + r * 0.10);
                g.bezierCurveTo(-r * 1.02, cy * s - r * 0.95,
                                 r * 1.02, cy * s - r * 0.95,
                                 r * 0.98, cy * s + r * 0.10);
                g.bezierCurveTo(r * 0.92, cy * s + r * 0.62,
                                r * 0.50, cy * s + r * 0.70,
                                r * 0.34, cy * s + r * 0.72);
                g.lineTo(-r * 0.34, cy * s + r * 0.72);
                g.bezierCurveTo(-r * 0.50, cy * s + r * 0.70,
                                -r * 0.92, cy * s + r * 0.62,
                                -r * 0.98, cy * s + r * 0.10);
                g.closePath();
            });
            hatBlob(g, s, '#EFE7D6', () => {                  // jaw
                hatRect(g, -r * 0.44, cy * s + r * 0.62, r * 0.88, r * 0.52, r * 0.20);
            });
            g.save();                                         // sockets
            g.fillStyle = '#120D0C';
            [-1, 1].forEach(d => {
                g.beginPath();
                g.ellipse(d * r * 0.44, cy * s - r * 0.20, r * 0.30, r * 0.33,
                          d * 0.22, 0, Math.PI * 2);
                g.fill();
            });
            g.fillStyle = 'rgba(190,60,255,.55)';             // a little life in them
            [-1, 1].forEach(d => {
                g.beginPath();
                g.ellipse(d * r * 0.46, cy * s - r * 0.16, r * 0.13, r * 0.15, 0, 0, Math.PI * 2);
                g.fill();
            });
            g.fillStyle = '#120D0C';
            g.beginPath();                                    // nose
            g.moveTo(0, cy * s + r * 0.14);
            g.lineTo(-r * 0.15, cy * s + r * 0.46);
            g.lineTo(r * 0.15, cy * s + r * 0.46);
            g.closePath();
            g.fill();
            g.restore();
            g.save();                                         // teeth
            g.strokeStyle = '#120D0C';
            g.lineWidth = s * 0.028;
            g.beginPath();
            g.moveTo(-r * 0.44, cy * s + r * 0.80);
            g.lineTo(r * 0.44, cy * s + r * 0.80);
            g.stroke();
            for (let i = -2; i <= 2; i++) {
                g.beginPath();
                g.moveTo(i * r * 0.19, cy * s + r * 0.62);
                g.lineTo(i * r * 0.19, cy * s + r * 1.12);
                g.stroke();
            }
            g.restore();
        },

        // Two long ears on a thin band, each with a pink inner. The ears
        // swing, and they lean apart a little as they go.
        bunny(g, s, w) {
            const brim = HEAD_TOP;
            swingAbout(g, 0, brim * s, w * 1.35, () => {
                [-1, 1].forEach(d => {
                    hatBlob(g, s, shade(g, s, 'bunny', 0, -1.2, 0, brim, [
                        [0, '#FFFFFF'], [1, '#DCD8D2']
                    ]), () => {
                        g.moveTo(d * s * 0.10, brim * s);
                        g.bezierCurveTo(d * s * 0.02, -s * 0.78,
                                        d * s * 0.22, -s * 1.12,
                                        d * s * 0.34, -s * 1.14);
                        g.bezierCurveTo(d * s * 0.46, -s * 1.10,
                                        d * s * 0.36, -s * 0.72,
                                        d * s * 0.28, brim * s);
                        g.closePath();
                    });
                    g.fillStyle = '#FF9EC4';
                    g.beginPath();
                    g.moveTo(d * s * 0.145, brim * s - s * 0.03);
                    g.bezierCurveTo(d * s * 0.085, -s * 0.78,
                                    d * s * 0.235, -s * 1.03,
                                    d * s * 0.315, -s * 1.05);
                    g.bezierCurveTo(d * s * 0.375, -s * 1.00,
                                    d * s * 0.315, -s * 0.74,
                                    d * s * 0.255, brim * s - s * 0.03);
                    g.closePath();
                    g.fill();
                });
            });
            hatBlob(g, s, '#F4F1EC', () => domeBand(g, s, brim, 0.062, HEAD_W - 0.06),
                    BAND_LINE, BAND_W);
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

    // An image hat, resting its bottom edge on the brim line and rising into
    // the clear space above the sprite — the same place the drawn shapes use,
    // so swapping the artwork in does not move the hat.
    function drawHatImage(context, img, size, swing) {
        if (!img || !img.complete || !img.naturalWidth) return;
        const ratio = img.naturalWidth / img.naturalHeight;
        const w = size * 0.96;
        const h = w / ratio;
        const base = HEAD_TOP * size + size * 0.06;   // a little into the hood
        swingAbout(context, 0, base, (swing || 0) * 1.1, () => {
            context.drawImage(img, -w / 2, base - h, w, h);
        });
    }

    const FIT_DEFAULT = { x: 0, y: 0, scale: 1, rot: 0 };

    /* ---- WOBBLE ----
     * A damped spring, one per worn item. The driver is the bird's vertical
     * velocity: fall and the dangly parts stream upward, flap and they whip
     * the other way, then they settle. It is integrated in ticks so it is the
     * same motion at any frame rate, and it is purely cosmetic — nothing here
     * is ever read back by the game or sent over the network.
     */
    const WOB_K = 0.16,      // stiffness
          WOB_D = 0.70,      // damping per tick: overshoots ~18% and is done
                             // in about a quarter-second, which reads as a
                             // hat with some life in it rather than a wobble
                             // that rings on for half a second after landing
          WOB_MAX = 0.52,    // hard stop, so nothing can ever look broken
          WOB_DRIVE = 0.030, // radians per unit of fall speed
          WOB_TARGET = 0.42;

    function makeWobble() { return { a: 0, v: 0 }; }
    function stepWobble(wob, velocity, ticks) {
        if (!wob) return 0;
        // Whole ticks only. The game runs a fixed 60Hz step and passes 1; a
        // preview that has been backgrounded passes more, and is capped so it
        // cannot catch up with one enormous lurch.
        const n = Math.max(0, Math.min(3, Math.round(ticks == null ? 1 : ticks)));
        // Where the part wants to hang, given how fast the bird is moving
        const target = Math.max(-WOB_TARGET, Math.min(WOB_TARGET, (velocity || 0) * WOB_DRIVE));
        for (let i = 0; i < n; i++) {
            wob.v += (target - wob.a) * WOB_K;
            wob.v *= WOB_D;
            wob.a += wob.v;
        }
        if (wob.a > WOB_MAX)  { wob.a = WOB_MAX;  wob.v = 0; }
        if (wob.a < -WOB_MAX) { wob.a = -WOB_MAX; wob.v = 0; }
        return wob.a;
    }

    /* The one entry point for a worn head item.
       `img` is a loaded image or null — artwork wins whenever there is any,
       and the drawn shape stands in until the file exists.
       `fit` offsets are fractions of `size`, not pixels, so a fit made against
       a big preview is the same fit on a 30px bird.
       `swing` is radians from stepWobble, or nothing at all for a still pose. */
    function drawHatOn(context, item, size, img, fit, swing) {
        if (!item) return;
        const f = Object.assign({}, FIT_DEFAULT, fit || {});
        const s = size * (f.scale || 1);
        const w = (item.rigid || !swing) ? 0 : swing;
        context.save();
        context.translate(f.x * size, f.y * size);
        if (f.rot) context.rotate(f.rot * Math.PI / 180);
        if (img) drawHatImage(context, img, s, w);
        else if (item.draw && HAT_SHAPES[item.draw]) HAT_SHAPES[item.draw](context, s, w);
        context.restore();
    }

    /* ---- TRAILS ----
       A trail is a ribbon laid along the points behind the bird, oldest
       first. It used to be drawn as one short see-through round-capped
       stroke per point, each in the next colour of the list: every joint
       overlapped the last and doubled up into a bead, and the colours
       changed every couple of pixels, so a rainbow came out as speckle and
       every trail looked like a caterpillar.

       Now the ribbon is filled as quads between the points' edges, so
       neighbouring pieces meet exactly and nothing overlaps, and each trail
       has a style of its own:
         bands   the colours side by side across the ribbon (rainbow, pastel)
         fire    a hot core in a flame, with sparks that rise off it (ember)
         frost   an icy glow that glints (frost)
         toxic   a green glow that bubbles (toxic)
         void    a dark core in a purple halo, with motes that circle (void)
         ghost   a wisp that thins and drifts (ghost)
         tinsel  a gold ribbon scattered with glitter (tinsel)
       A particle belongs to the point it was born with (flat.seq counts the
       points ever pushed), so sparks ride along with the trail instead of
       flickering from place to place as the oldest point drops off. */
    /* Each layer is filled in a handful of pieces, each a step fainter
       toward the tail. Per point it was ~90 fills a frame for a rainbow,
       which cost a slow TV about six frames a second; five pieces a layer
       is ~30 and the steps are too small to see on a ribbon that narrows. */
    const TRAIL_PIECES = 5;
    function trailFrame(flat) {
        const n = flat.length / 2, P = [];
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            let tx = flat[b * 2] - flat[a * 2], ty = flat[b * 2 + 1] - flat[a * 2 + 1];
            const l = Math.hypot(tx, ty) || 1;
            tx /= l; ty /= l;
            P.push({ x: flat[i * 2], y: flat[i * 2 + 1], nx: -ty, ny: tx, t: n > 1 ? i / (n - 1) : 1 });
        }
        return P;
    }
    // One strip of the ribbon between two offsets from the centre line.
    // Neighbouring pieces share their end points, so they meet exactly.
    function trailStrip(g, P, off0, off1, colour, alpha) {
        g.fillStyle = colour;
        const step = Math.max(1, Math.ceil((P.length - 1) / TRAIL_PIECES));
        for (let s = 0; s < P.length - 1; s += step) {
            const e = Math.min(s + step, P.length - 1);
            const a = alpha((P[s].t + P[e].t) / 2);
            if (a <= 0.01) continue;
            g.globalAlpha = Math.min(1, a);
            g.beginPath();
            for (let i = s; i <= e; i++) { const q = P[i], o = off0(q.t); g.lineTo(q.x + q.nx * o, q.y + q.ny * o); }
            for (let i = e; i >= s; i--) { const q = P[i], o = off1(q.t); g.lineTo(q.x + q.nx * o, q.y + q.ny * o); }
            g.closePath();
            g.fill();
        }
    }
    function trailGlow(g, P, hw, layers) {
        for (const L of layers) trailStrip(g, P, t => -hw(t) * L.w, t => hw(t) * L.w, L.c, t => L.a * Math.pow(t, L.p || 1));
    }
    // A cheap stable pseudo-random number per particle
    function rnd(k) { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

    function drawTrail(context, flat, colours, size, style) {
        if (!flat || flat.length < 4 || !colours || !colours.length) return;
        const P = trailFrame(flat), n = P.length;
        const seq = flat.seq || n, now = (typeof performance !== 'undefined' ? performance.now() : 0);
        const fx = style || (colours.length >= 4 ? 'bands' : 'fire');
        const c = i => colours[Math.min(i, colours.length - 1)];
        const id = i => seq - (n - 1 - i);                    // which point this was, ever

        const g = context;
        g.save();

        if (fx === 'bands') {
            // Full width by the bird, narrowing and fading toward the tail
            const K = colours.length;
            const W = t => size * (0.34 + 0.44 * Math.sqrt(t));
            for (let k = 0; k < K; k++) {
                trailStrip(g, P,
                    t => -W(t) / 2 + W(t) * k / K - 0.3,
                    t => -W(t) / 2 + W(t) * (k + 1) / K + 0.3,
                    colours[k], t => 0.1 + 0.85 * Math.pow(t, 1.4));
            }
        } else {
            const hw = t => size * (0.06 + 0.3 * Math.pow(t, 0.8));   // half-width
            if (fx === 'fire') {
                trailGlow(g, P, hw, [{ c: c(2), w: 1.25, a: .32, p: 1.2 }, { c: c(1), w: .8, a: .8, p: 1.3 },
                                     { c: c(0), w: .38, a: .95, p: 1.6 }]);
                for (let i = 0; i < n; i++) {
                    const k = id(i); if (k % 3) continue;
                    const q = P[i], age = n - 1 - i;
                    g.globalAlpha = Math.max(0, q.t * 1.1 - .1);
                    g.fillStyle = rnd(k) > .5 ? c(0) : c(1);
                    g.beginPath();
                    g.arc(q.x + (rnd(k + 1) - .5) * size * .45 - age * .15,
                          q.y - age * .5 - rnd(k + 2) * size * .25, size * (.035 + .04 * rnd(k + 3)), 0, 7);
                    g.fill();
                }
            } else if (fx === 'frost') {
                trailGlow(g, P, hw, [{ c: c(2), w: 1.3, a: .3 }, { c: c(1), w: .75, a: .7, p: 1.2 },
                                     { c: c(0), w: .32, a: .95, p: 1.5 }]);
                g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(1, size * .04);
                for (let i = 0; i < n; i++) {
                    const k = id(i); if (k % 4) continue;
                    const q = P[i], tw = .5 + .5 * Math.sin(now * .012 + k);
                    const r = size * (.07 + .07 * rnd(k)) * (.5 + tw * .5);
                    const x = q.x + (rnd(k + 1) - .5) * size * .6, y = q.y + (rnd(k + 2) - .5) * size * .6;
                    g.globalAlpha = q.t * tw;
                    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
                }
            } else if (fx === 'toxic') {
                trailGlow(g, P, hw, [{ c: c(2), w: 1.3, a: .4 }, { c: c(1), w: .8, a: .85, p: 1.2 },
                                     { c: c(0), w: .35, a: .9, p: 1.6 }]);
                g.strokeStyle = c(0); g.lineWidth = Math.max(1, size * .035);
                for (let i = 0; i < n; i++) {
                    const k = id(i); if (k % 4) continue;
                    const q = P[i], age = n - 1 - i;
                    g.globalAlpha = q.t * .9;
                    g.beginPath();
                    g.arc(q.x + (rnd(k) - .5) * size * .5, q.y - age * .32 - size * .1,
                          size * (.04 + .06 * (1 - q.t) + .03 * rnd(k + 1)), 0, 7);
                    g.stroke();
                }
            } else if (fx === 'void') {
                trailGlow(g, P, hw, [{ c: c(1), w: 1.45, a: .45 }, { c: c(2), w: .95, a: .95, p: .9 },
                                     { c: c(0), w: .2, a: .55, p: 1.6 }]);
                for (let i = 0; i < n; i++) {
                    const k = id(i); if (k % 3) continue;
                    const q = P[i], ang = now * .004 + k, rr = size * (.28 + .22 * (1 - q.t));
                    g.globalAlpha = q.t * .9;
                    g.fillStyle = rnd(k) > .5 ? c(0) : c(1);
                    g.beginPath(); g.arc(q.x + Math.cos(ang) * rr, q.y + Math.sin(ang) * rr * .6, size * .04, 0, 7); g.fill();
                }
            } else if (fx === 'ghost') {
                // Puffs that grow and drift up as they age, round a thin bright spine
                for (let i = 0; i < n; i++) {
                    const k = id(i); if (k % 2) continue;
                    const q = P[i], age = n - 1 - i;
                    g.globalAlpha = .16 * q.t + .04;
                    g.fillStyle = rnd(k) > .6 ? c(1) : c(0);
                    g.beginPath();
                    g.arc(q.x - age * .2, q.y - age * .3 + (rnd(k) - .5) * size * .2,
                          size * (.14 + .3 * (1 - q.t)), 0, 7);
                    g.fill();
                }
                trailGlow(g, P, hw, [{ c: c(2), w: .7, a: .35, p: 1.5 }, { c: c(0), w: .3, a: .85, p: 2 }]);
            } else if (fx === 'tinsel') {
                trailGlow(g, P, hw, [{ c: c(1), w: 1.1, a: .8, p: 1.2 }, { c: c(0), w: .45, a: .95, p: 1.4 }]);
                for (let i = 0; i < n; i++) {
                    const k = id(i); if (k % 2) continue;
                    const q = P[i], tw = .45 + .55 * Math.abs(Math.sin(now * .01 + k * 1.7));
                    g.globalAlpha = q.t * tw;
                    g.fillStyle = [c(1), c(2), c(3), '#FFFFFF'][k % 4];
                    const x = q.x + (rnd(k) - .5) * size * .7, y = q.y + (rnd(k + 1) - .5) * size * .7;
                    const r = size * (.03 + .03 * rnd(k + 2));
                    g.fillRect(x - r, y - r, r * 2, r * 2);
                }
            }
        }
        g.restore();
    }

    root.CrixArt = {
        HEAD_TOP: HEAD_TOP,
        HEAD_W: HEAD_W,
        FACE_CY: FACE_CY,
        HAT_SHAPES: HAT_SHAPES,
        FIT_DEFAULT: FIT_DEFAULT,
        drawSprite: drawSprite,
        drawHatImage: drawHatImage,
        drawHatOn: drawHatOn,
        drawTrail: drawTrail,
        makeWobble: makeWobble,
        stepWobble: stepWobble
    };
})(typeof window !== 'undefined' ? window : globalThis);
