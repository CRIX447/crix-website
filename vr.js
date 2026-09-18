/**
 * vr.js — Flappy Crix in VR
 * CRIX STUDIOS
 *
 * Loaded on demand from Settings, never at page load: three.js plus the models
 * is about a megabyte, and a phone opening the 2D game should not pay for a
 * mode it cannot run.
 *
 *     const vr = await import('/vr.js');
 *     const session = await vr.start({ equipped, onExit });
 *     session.stop();
 *
 * Everything lives inside start(), so leaving VR tears the scene down rather
 * than leaving a render loop running behind the 2D game.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton }   from 'three/addons/webxr/VRButton.js';

/* ───────────────────────── tuning ─────────────────────────
   Forward speed is deliberately CONSTANT. Acceleration is what the inner ear
   objects to, not motion, so the one thing that must never change while you
   are flying is how fast you are going. */

export const SPEED       = 8.0;    // m/s forward, never varies
const GRAVITY            = -9.5;
const TERMINAL           = -14.0;  // a long drop stays recoverable
const FLAP_MIN_V         = 4.0;
const FLAP_MAX_V         = 8.0;
const HAND_MIN           = 0.85;   // m/s of downward hand speed to register
const HAND_MAX           = 3.20;   // m/s that earns the full impulse
const FLAP_COOLDOWN      = 240;    // ms
const EYE_Y              = 1.6;

/* The world is sized to the 2D game so the two are the same level. At
   2.5 px/frame and 60fps it runs at 150 px/s; against 8 m/s here that is
   18.75 px per metre, so its 170 px gap is 9.1 m and its 300 px pipe spacing
   is 16 m. */
export const PX_PER_M = 18.75;
const FLOOR = 1.2, CEIL = 36.0, START_Y = 14.0;
const PIPE_SPACING = 16.0, PIPE_GAP = 9.1, PIPE_R = 1.5, CAP_H = 0.6, BODY_H = 2.0;
const BODY_R = 0.55;
const PIPE_POOL = 9, BUSH_POOL = 16, BUSH_STEP = 8.0;

/* Lobby. You haul yourself around with your arms, Gorilla Tag style.

   GRAB_REACH is the radius of the sphere around each paw that counts as
   touching something. FLOOR_REACH is separate and much larger, because the
   floor is the one surface you cannot walk up to: standing upright with your
   arms swinging down your hands sit around 0.6 m off it, and an honest 0.1 m
   test meant you had to physically kneel to move at all. */
const LOBBY_R      = 9.0;
const GRAB_REACH   = 0.45;
/* Standing upright with your arms hanging, your hands sit around 0.75 m off
   the floor, and at the bottom of a swing maybe 0.6 m. Anything under about a
   metre means the only way to touch the ground is to physically kneel, which
   is exactly what it felt like. A planted hand that is not moving still adds
   no velocity, so being generous here costs nothing but makes the difference
   between hauling yourself along and crouching to do it. */
const FLOOR_REACH  = 1.00;
const HAND_GRIP    = 1.0;
const LOBBY_GRAV   = -14.0;
const LOBBY_DRAG   = 0.92;
const LOBBY_FRICT  = 0.80;
const LOBBY_MAX_V  = 9.0;

/* Palette lifted from the 2D game's drawPipe and drawBackdrop, so the two
   builds look like the same product rather than cousins. */
const C = {
    pipeDark: 0x076B41, pipeMid: 0x00CC7A, pipeLight: 0x4DE8A8,
    skyTop: 0x12203A, skyLow: 0x1B3352, city: 0x233C5F,
    bush: 0x1E4A2E, ground: 0x2A2A22, cloud: 0x2B3C5E
};

const MODELS = ['pipe_body', 'pipe_cap', 'coin', 'hand_paw', 'monkey',
                'bush_tile', 'sky_dome', 'hat_crown', 'hat_cap', 'hat_bucket'];

/* Cosmetic ids in the 2D game map to the hat models built in Blender. */
const HAT_MODEL = { crown: 'hat_crown', cap: 'hat_cap', bucket: 'hat_bucket' };

/* ───────────────────────── flap detection ─────────────────────────
   A flap is both hands travelling downward at once. One hand is a wave, and
   letting a single hand count meant an arm resting on a chair triggered it.

   Hand height is read in the rig's own space, not the world's: the rig rises
   and falls with the bird, and a hand perfectly still in the room would
   otherwise look like it was moving every frame. */

export class FlapDetector {
    constructor() { this.reset(); }

    reset() {
        this.prev = { l: null, r: null };
        this.vel  = { l: 0, r: 0 };
        this.lastFlapAt = -1e9;
        this.armed = true;
    }

    /** @returns {number} upward impulse in m/s, or 0 for no flap */
    update(leftY, rightY, dt, now) {
        if (dt <= 0) return 0;
        // Light smoothing only: enough to reject controller jitter, not so
        // much that a hard swing is still ramping up by the time it is read.
        const smooth = (was, y, prev) =>
            prev === null ? 0 : was * 0.25 + ((y - prev) / dt) * 0.75;

        if (leftY  !== null) { this.vel.l = smooth(this.vel.l, leftY,  this.prev.l); this.prev.l = leftY; }
        if (rightY !== null) { this.vel.r = smooth(this.vel.r, rightY, this.prev.r); this.prev.r = rightY; }
        if (leftY === null || rightY === null) return 0;

        // The slower hand sets the strength, so a lazy arm cannot ride on an
        // enthusiastic one.
        const down = Math.min(-this.vel.l, -this.vel.r);

        // Re-arm once the hands are no longer really going down. Without this
        // it is a level trigger and one long swing fires every time the
        // cooldown lapses.
        if (down < HAND_MIN * 0.4) this.armed = true;
        if (!this.armed) return 0;
        if (down < HAND_MIN) return 0;
        if (now - this.lastFlapAt < FLAP_COOLDOWN) return 0;

        this.armed = false;
        this.lastFlapAt = now;
        const t = Math.min(1, (down - HAND_MIN) / (HAND_MAX - HAND_MIN));
        return FLAP_MIN_V + t * (FLAP_MAX_V - FLAP_MIN_V);
    }
}

export function supported() {
    return !!(navigator.xr && navigator.xr.isSessionSupported);
}

export async function headsetPresent() {
    if (!supported()) return false;
    try { return await navigator.xr.isSessionSupported('immersive-vr'); }
    catch (e) { return false; }
}

/* ───────────────────────── the mode ───────────────────────── */

export async function start(opts = {}) {
    const equipped = opts.equipped || {};      // { hat, trail, trailColours }
    const onExit   = opts.onExit || (() => {});
    const onScore  = opts.onScore || (() => {});

    /* ---- overlay ---- */
    const host = document.createElement('div');
    host.id = 'vrHost';
    host.innerHTML = `
      <div class="vr-ui" id="vrUi">
        <h2>FLAPPY CRIX VR</h2>
        <p id="vrNote">Loading…</p>
        <div class="vr-bar"><i id="vrBar"></i></div>
        <div id="vrSlot"></div>
        <button class="vr-btn ghost" id="vrFlat" disabled>Try it on this screen</button>
        <label class="vr-check"><input type="checkbox" id="vrComfort" checked> Comfort vignette</label>
        <button class="vr-btn ghost" id="vrQuit">← Back to Flappy Crix</button>
        <ul class="vr-how">
          <li><b>In the lobby</b> — swing your arms at the rock to pull yourself around</li>
          <li><b>Slap the green pad</b> to take off</li>
          <li><b>Both arms down</b> together to flap — harder swing, bigger climb</li>
          <li><b>Left palm to your face</b> for the menu, press it with your right</li>
        </ul>
      </div>
      <div class="vr-crash" id="vrCrash">
        <h2 id="vrCrashScore">0</h2>
        <p id="vrCrashLine"></p>
        <button class="vr-btn" id="vrAgain">Go again</button>
        <button class="vr-btn ghost" id="vrCrashQuit">← Back to Flappy Crix</button>
      </div>`;
    document.body.appendChild(host);

    const style = document.createElement('style');
    style.id = 'vrHostStyle';
    style.textContent = `
      #vrHost { position:fixed; inset:0; z-index:99000; background:#07070C; }
      #vrHost canvas { display:block; }
      .vr-ui, .vr-crash { position:fixed; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:14px; padding:24px; text-align:center;
        background:radial-gradient(120% 130% at 50% 20%, #15152A, #07070C); z-index:2;
        font-family:'Trebuchet MS',system-ui,sans-serif; color:#EDEDED; }
      .vr-crash { background:rgba(7,7,12,.86); display:none; }
      .vr-crash.on { display:flex; }
      .vr-ui.gone { display:none; }
      .vr-ui h2, .vr-crash h2 { margin:0; font-size:clamp(24px,7vw,40px); letter-spacing:1px;
        background:linear-gradient(135deg,#FF6B35,#FF4655); -webkit-background-clip:text;
        background-clip:text; color:transparent; }
      .vr-ui p, .vr-crash p { margin:0; color:#9A9AA6; font-size:13px; max-width:34ch; line-height:1.6; }
      .vr-btn { border:2px solid rgba(255,255,255,.14); border-bottom-width:4px; border-radius:30px;
        padding:11px 26px; font:inherit; font-weight:700; font-size:14px; cursor:pointer; color:#fff;
        background:linear-gradient(135deg,#FF4655,#FF6B35); }
      .vr-btn.ghost { background:rgba(255,255,255,.08); color:#EDEDED; }
      .vr-btn[disabled] { opacity:.5; cursor:default; }
      .vr-bar { width:min(300px,76vw); height:6px; border-radius:6px; background:rgba(255,255,255,.1); overflow:hidden; }
      .vr-bar > i { display:block; height:100%; width:0; background:#00CC7A; transition:width .2s; }
      .vr-check { font-size:12px; color:#9A9AA6; display:flex; align-items:center; gap:7px; cursor:pointer; }
      .vr-check input { accent-color:#FF6B35; width:15px; height:15px; }
      .vr-how { text-align:left; color:#9A9AA6; font-size:12px; line-height:1.8; padding-left:20px;
        margin:0; max-width:38ch; }
      .vr-how b { color:#EDEDED; }
      #vrSlot button { position:static !important; width:auto !important; padding:11px 26px !important;
        border:2px solid rgba(255,255,255,.14) !important; border-bottom-width:4px !important;
        border-radius:30px !important; background:linear-gradient(135deg,#FF4655,#FF6B35) !important;
        color:#fff !important; font:inherit !important; font-weight:700 !important;
        font-size:14px !important; opacity:1 !important; cursor:pointer; }`;
    document.head.appendChild(style);

    const $ = id => document.getElementById(id);
    const ui = $('vrUi'), note = $('vrNote'), bar = $('vrBar'), comfortBox = $('vrComfort');
    try { comfortBox.checked = localStorage.getItem('crix_vr_vignette') !== '0'; } catch (e) {}

    /* ---- sound: the 2D game's own clips, so they cannot drift ---- */
    const SFX_SRC = { flap:'/img/jump.mp3', coin:'/img/coin.mp3', point:'/img/select.mp3',
                      die:'/img/death.mp3', click:'/img/click.mp3', grab:'/img/pop.mp3',
                      start:'/img/levelup.mp3' };
    const SFX = {};
    let soundOn = true;
    try { soundOn = localStorage.getItem('crix_vr_sound') !== '0'; } catch (e) {}
    Object.entries(SFX_SRC).forEach(([k, src]) => {
        // Pooled: one Audio element cannot overlap with itself, and coins in a
        // row is exactly that case.
        SFX[k] = Array.from({ length: 3 }, () => { const a = new Audio(src); a.preload = 'auto'; return a; });
        SFX[k]._i = 0;
    });
    function play(name, vol) {
        if (!soundOn) return;
        const pool = SFX[name]; if (!pool) return;
        const a = pool[pool._i = (pool._i + 1) % pool.length];
        try { a.currentTime = 0; a.volume = vol === undefined ? 0.5 : vol; a.play().catch(() => {}); } catch (e) {}
    }

    /* ---- scene ---- */
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(C.skyLow, 70, 210);

    const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);
    const rig = new THREE.Group();
    rig.add(camera);
    camera.position.y = EYE_Y;
    scene.add(rig);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    host.appendChild(renderer.domElement);

    const onResize = () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    };
    addEventListener('resize', onResize);

    scene.add(new THREE.HemisphereLight(0xBFD4FF, 0x2C3A22, 2.0));
    const sun = new THREE.DirectionalLight(0xFFF3DD, 1.4);
    sun.position.set(6, 14, 4);
    scene.add(sun);

    /* ---- models + textures ---- */
    const M = {};
    const tex = new THREE.TextureLoader();
    function texture(src) {
        const t = tex.load(src);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }

    await (async () => {
        const loader = new GLTFLoader();
        let done = 0;
        await Promise.all(MODELS.map(name => new Promise((res, rej) => {
            loader.load(`/models/${name}.glb`, g => {
                M[name] = g.scene;
                bar.style.width = Math.round((++done / MODELS.length) * 100) + '%';
                res();
            }, undefined, e => rej(new Error(`${name}.glb: ${e.message || e}`)));
        })));
    })();

    const clone = n => M[n].clone(true);

    /* Three-band toon ramp: the 2D art is flat colour with hard steps, and a
       smoothly lit 3D scene reads as a different game. */
    const ramp = (() => {
        const c = document.createElement('canvas');
        c.width = 4; c.height = 1;
        const g = c.getContext('2d');
        const px = g.createImageData(4, 1);
        [[92,92,96],[152,152,158],[216,216,222],[255,255,255]].forEach((v, i) => {
            px.data[i*4] = v[0]; px.data[i*4+1] = v[1]; px.data[i*4+2] = v[2]; px.data[i*4+3] = 255;
        });
        g.putImageData(px, 0, 0);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = t.magFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        return t;
    })();
    const toon = col => new THREE.MeshToonMaterial({ color: col, gradientMap: ramp });

    const MAT = {
        pipe: toon(C.pipeMid), pipeRim: toon(C.pipeLight), pipeDark: toon(C.pipeDark),
        coin: toon(0xFFD24A), bush: toon(C.bush), city: toon(C.city),
        fur: toon(0x7C7C86), furDark: toon(0x33333A), muzzle: toon(0xBFBFC6),
        bandana: toon(0xC9252B), rock: toon(0x5A6B55), gold: toon(0xF2C14E),
        cloth: toon(0x22222A)
    };
    const PIPE_SKIN = { crix_pipe: MAT.pipe, crix_pipe_dark: MAT.pipeDark };
    const FUR_SKIN  = { crix_fur: MAT.fur, crix_fur_dark: MAT.furDark,
                        crix_muzzle: MAT.muzzle, crix_bandana: MAT.bandana,
                        crix_gold: MAT.gold, crix_cloth: MAT.cloth };

    function repaint(root, byName) {
        root.traverse(o => {
            if (!o.isMesh) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const out = mats.map(m => byName[m && m.name] || byName['*'] || m);
            o.material = out.length === 1 ? out[0] : out;
        });
        return root;
    }

    /* ───────────── world ───────────── */

    const pipes = [], bushes = [], coins = [], clouds = [];
    let sky, ground, city, lobby, startPad, ownBody, trail;

    function groundTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        g.fillStyle = '#2A2A22'; g.fillRect(0, 0, 128, 128);
        g.fillStyle = 'rgba(255,255,255,.055)';
        for (let x = -128; x < 256; x += 32) {
            g.beginPath();
            g.moveTo(x, 128); g.lineTo(x + 128, 0); g.lineTo(x + 144, 0); g.lineTo(x + 16, 128);
            g.closePath(); g.fill();
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(26, 26);
        return t;
    }

    function buildHalfPipe(height) {
        const g = new THREE.Group();
        const wall = Math.max(0.05, height - CAP_H);
        const body = repaint(clone('pipe_body'), PIPE_SKIN);
        body.scale.y = wall / BODY_H;
        g.add(body);
        const cap = repaint(clone('pipe_cap'), PIPE_SKIN);
        cap.position.y = wall;
        g.add(cap);
        // the lit lip is what sells the depth in the 2D art, so it is here too
        const rim = new THREE.Mesh(new THREE.TorusGeometry(PIPE_R * 1.16, 0.07, 6, 20), MAT.pipeRim);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = wall + CAP_H - 0.06;
        g.add(rim);
        return g;
    }

    function makePipe() {
        const p = new THREE.Group();
        p.userData.lower = new THREE.Group();
        p.userData.upper = new THREE.Group();
        p.add(p.userData.lower, p.userData.upper);
        p.visible = false;
        scene.add(p);
        pipes.push(p);
        return p;
    }

    function placePipe(p, z, gapCentre) {
        const bottom = gapCentre - PIPE_GAP / 2, top = gapCentre + PIPE_GAP / 2;
        p.userData.lower.clear();
        p.userData.upper.clear();
        p.userData.lower.add(buildHalfPipe(bottom));

        // Turning the piece over puts its geometry in local y = -h..0, so the
        // holder goes at top + h. Hanging it at `top` drops the whole thing
        // through the gap and onto the lower pipe.
        const upH = CEIL - top + 2;
        const up = buildHalfPipe(upH);
        up.rotation.x = Math.PI;
        const holder = new THREE.Group();
        holder.position.y = top + upH;
        holder.add(up);
        p.userData.upper.add(holder);

        p.position.z = z;
        p.visible = true;
        Object.assign(p.userData, { z, bottom, top, scored: false });
    }

    function makeCoin() {
        const c = repaint(clone('coin'), { '*': MAT.coin });
        c.rotation.x = Math.PI / 2;
        const holder = new THREE.Group();
        holder.add(c);
        holder.visible = false;
        holder.userData.spin = c;
        scene.add(holder);
        coins.push(holder);
        return holder;
    }

    function buildWorld() {
        sky = clone('sky_dome');
        const top = new THREE.Color(C.skyTop), low = new THREE.Color(C.skyLow), tmp = new THREE.Color();
        sky.traverse(o => {
            if (!o.isMesh) return;
            const g = o.geometry, pos = g.attributes.position;
            const col = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) {
                const t = Math.min(1, Math.max(0, pos.getY(i) / 100));
                tmp.copy(low).lerp(top, Math.pow(t, 0.7));
                col[i*3] = tmp.r; col[i*3+1] = tmp.g; col[i*3+2] = tmp.b;
            }
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            o.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide,
                                                      fog: false, depthWrite: false });
            o.renderOrder = -1;
        });
        scene.add(sky);

        ground = new THREE.Mesh(new THREE.PlaneGeometry(280, 280),
            new THREE.MeshToonMaterial({ color: 0xFFFFFF, map: groundTexture(), gradientMap: ramp }));
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);

        city = new THREE.Group();
        for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const h = 9 + ((i * 37) % 24);
            const box = new THREE.Mesh(new THREE.BoxGeometry(7, h, 7), MAT.city);
            box.position.set(Math.cos(a) * 124, h / 2, Math.sin(a) * 124);
            city.add(box);
        }
        scene.add(city);

        // The 2D backdrop has clouds, and without them the sky is an empty wall.
        const cloudMat = new THREE.MeshBasicMaterial({ color: C.cloud, fog: false });
        for (let i = 0; i < 14; i++) {
            const g = new THREE.Group();
            for (let k = 0; k < 3; k++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 3, 7, 5), cloudMat);
                s.position.set(k * 5 - 5, Math.random() * 1.6, 0);
                s.scale.y = 0.45;
                g.add(s);
            }
            g.position.set((Math.random() - 0.5) * 180, 34 + Math.random() * 20, (Math.random() - 0.5) * 180);
            g.userData.drift = 0.25 + Math.random() * 0.5;
            scene.add(g);
            clouds.push(g);
        }

        for (let i = 0; i < BUSH_POOL; i++) {
            const b = repaint(clone('bush_tile'), { '*': MAT.bush });
            b.position.x = (i % 2 === 0) ? -13 : 13;
            scene.add(b);
            bushes.push(b);
        }
        for (let i = 0; i < PIPE_POOL; i++) makePipe();
        for (let i = 0; i < PIPE_POOL; i++) makeCoin();
        buildLobby();
    }

    /* ───────────── lobby ─────────────
       Every solid is an axis-aligned box, so one nearest-point test covers
       tops, sides and edges alike. That matters: the first version only
       tested the floor, and the floor is the one surface you cannot walk up
       to — which is why moving meant kneeling. */

    const solids = [];

    function solid(x, y, z, w, h, d) {
        return { minX: x - w/2, maxX: x + w/2, minY: y, maxY: y + h,
                 minZ: z - d/2, maxZ: z + d/2, top: y + h, x, z, hw: w/2, hd: d/2 };
    }

    function buildLobby() {
        lobby = new THREE.Group();

        const base = new THREE.Mesh(new THREE.CylinderGeometry(LOBBY_R, LOBBY_R * 0.82, 1.6, 26), MAT.rock);
        base.position.y = -0.8;
        lobby.add(base);
        const grass = new THREE.Mesh(new THREE.CylinderGeometry(LOBBY_R, LOBBY_R, 0.1, 26), MAT.bush);
        grass.position.y = 0.03;
        lobby.add(grass);

        /* Hand-height things to grab, all round the middle where you spawn.
           You should always be able to reach something without crouching. */
        const spec = [
            // x,    y,   z,    w,   h,   d
            [-3.4,  0,  -1.2,  1.5, 1.15, 1.5],
            [ 3.4,  0,  -1.4,  1.5, 1.30, 1.5],
            [-2.2,  0,   3.2,  1.8, 0.95, 1.4],
            [ 2.6,  0,   3.0,  1.4, 1.40, 1.4],
            [-5.6,  0,   1.0,  1.6, 1.80, 1.6],
            [ 5.6,  0,   0.4,  1.6, 2.10, 1.6],
            [ 0.0,  0,  -5.4,  2.4, 2.60, 2.0],
            [-4.6,  0,  -4.4,  1.6, 1.70, 1.6],
            [ 4.4,  0,  -4.6,  1.6, 2.00, 1.6]
        ];
        spec.forEach(([x, y, z, w, h, d]) => {
            const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.rock);
            b.position.set(x, h / 2, z);
            lobby.add(b);
            solids.push(solid(x, 0, z, w, h, d));
            // a lighter cap so the tops read as standable
            const capTop = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.08, d * 1.04), MAT.bush);
            capTop.position.set(x, h, z);
            lobby.add(capTop);
        });

        /* A ring of hand-height stones around the spawn. Even standing
           perfectly still there is something within arm's reach in every
           direction, which is the whole difference between this feeling like
           Gorilla Tag and feeling like a crouching simulator. */
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.4;
            const x = Math.cos(a) * 2.0, z = 3.4 + Math.sin(a) * 2.0;
            const h = 0.95 + (i % 3) * 0.22;
            const st = new THREE.Mesh(new THREE.BoxGeometry(0.62, h, 0.62), MAT.rock);
            st.position.set(x, h / 2, z);
            st.rotation.y = a;
            lobby.add(st);
            solids.push(solid(x, 0, z, 0.72, h, 0.72));
        }

        // A waist-high rail round the rim: something to pull along even when
        // you have drifted to the edge.
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const x = Math.cos(a) * (LOBBY_R - 0.7), z = Math.sin(a) * (LOBBY_R - 0.7);
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.05, 0.34), MAT.rock);
            post.position.set(x, 0.52, z);
            lobby.add(post);
            solids.push(solid(x, 0, z, 0.34, 1.05, 0.34));
        }

        startPad = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.15, 10), MAT.rock);
        post.position.y = 0.58;
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.13, 22), MAT.pipe);
        face.rotation.x = Math.PI / 2;
        face.position.y = 1.26;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.055, 8, 26), MAT.pipeRim);
        rim.position.y = 1.26;
        startPad.add(post, face, rim);
        startPad.position.set(0, 0, -2.4);
        startPad.userData.hit = new THREE.Vector3(0, 1.26, -2.4);
        lobby.add(startPad);

        lobby.visible = false;
        scene.add(lobby);
    }

    function standingHeight(x, z) {
        let h = (x * x + z * z <= LOBBY_R * LOBBY_R) ? 0 : -1e9;
        for (const b of solids) {
            if (x > b.minX - 0.1 && x < b.maxX + 0.1 && z > b.minZ - 0.1 && z < b.maxZ + 0.1)
                h = Math.max(h, b.top);
        }
        return h;
    }

    const _near = new THREE.Vector3();
    function withinReach(p) {
        for (const b of solids) {
            _near.set(Math.min(Math.max(p.x, b.minX), b.maxX),
                      Math.min(Math.max(p.y, b.minY), b.maxY),
                      Math.min(Math.max(p.z, b.minZ), b.maxZ));
            if (_near.distanceTo(p) <= GRAB_REACH) return true;
        }
        // the floor, with the generous reach a standing arm swing needs
        return (p.x * p.x + p.z * p.z <= LOBBY_R * LOBBY_R) && p.y <= FLOOR_REACH;
    }

    /* ───────────── player ───────────── */

    const VIGNETTE_D = 0.35;
    const hands = [];
    let hudCanvas, hudCtx, hudTex, vignette;
    let menu, menuCanvas, menuCtx, menuTex, menuButtons = [], menuOpen = false;
    const MENU_W = 0.32, MENU_H = 0.25;

    /* The 2D game's trail cosmetics, in 3D: the same colours, streaming out
       behind you. It is the most visible thing you own, so it should come
       across. */
    const TRAIL_N = 26;
    const trailPts = [];

    function buildPlayer() {
        for (let i = 0; i < 2; i++) {
            const src = renderer.xr.getController(i);
            const h = new THREE.Group();
            const paw = repaint(clone('hand_paw'), FUR_SKIN);
            // The paw is modelled reaching along Blender's +Z and the exporter
            // turns Z-up into Y-up, so in the file it reaches straight up. A
            // -90 degree turn about X sends it forward the way a hand points.
            paw.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
            if (i === 1) paw.scale.x = -1;
            h.add(paw);
            h.position.set(i === 0 ? -0.30 : 0.30, EYE_Y - 0.42, -0.30);
            Object.assign(h.userData, { paw, src, prev: new THREE.Vector3().copy(h.position), gripping: false });
            rig.add(h);
            hands.push(h);
            // parented so three.js keeps writing the real pose onto it
            rig.add(src);
            src.visible = false;
            src.addEventListener('connected', () => { src.visible = true; });
            src.addEventListener('disconnected', () => { src.visible = false; });
        }

        ownBody = repaint(clone('monkey'), FUR_SKIN);
        const headNode = ownBody.getObjectByName('head');
        if (headNode) headNode.visible = false;      // your head is the camera
        ownBody.position.y = EYE_Y - 1.32;
        rig.add(ownBody);

        // Whatever hat you have equipped in the 2D game, worn here.
        const hatId = HAT_MODEL[equipped.hat];
        if (hatId && M[hatId]) {
            const hat = repaint(clone(hatId), FUR_SKIN);
            hat.position.set(0, EYE_Y + 0.10, 0);
            hat.scale.setScalar(1.25);
            rig.add(hat);
        }

        // and whatever trail, drawn as a real ribbon through the world
        const cols = equipped.trailColours;
        if (cols && cols.length) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
            geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
            const c3 = new THREE.Color();
            const col = geo.attributes.color;
            for (let i = 0; i < TRAIL_N; i++) {
                c3.set(cols[(TRAIL_N - i) % cols.length]);
                col.setXYZ(i, c3.r, c3.g, c3.b);
            }
            trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, fog: false }));
            trail.frustumCulled = false;
            trail.visible = false;
            scene.add(trail);
        }

        hudCanvas = document.createElement('canvas');
        hudCanvas.width = 512; hudCanvas.height = 128;
        hudCtx = hudCanvas.getContext('2d');
        hudTex = new THREE.CanvasTexture(hudCanvas);
        hudTex.colorSpace = THREE.SRGBColorSpace;
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.205),
            new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthWrite: false }));
        panel.position.set(0, EYE_Y - 0.55, -1.35);
        panel.rotation.x = -0.42;
        rig.add(panel);
        drawHud();

        // wrist menu
        menuCanvas = document.createElement('canvas');
        menuCanvas.width = 320; menuCanvas.height = 246;
        menuCtx = menuCanvas.getContext('2d');
        menuTex = new THREE.CanvasTexture(menuCanvas);
        menuTex.colorSpace = THREE.SRGBColorSpace;
        menu = new THREE.Mesh(new THREE.PlaneGeometry(MENU_W, MENU_H),
            new THREE.MeshBasicMaterial({ map: menuTex, transparent: true, depthWrite: false }));
        menu.position.set(0, 0.07, -0.01);
        menu.rotation.set(-Math.PI / 2, 0, 0);
        menu.visible = false;
        hands[0].add(menu);
        refreshMenu();

        const vc = document.createElement('canvas');
        vc.width = vc.height = 256;
        const g = vc.getContext('2d');
        const rad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
        rad.addColorStop(0.00, 'rgba(0,0,0,0)');
        rad.addColorStop(0.82, 'rgba(0,0,0,0)');
        rad.addColorStop(1.00, 'rgba(0,0,0,0.40)');
        g.fillStyle = rad; g.fillRect(0, 0, 256, 256);
        const vTex = new THREE.CanvasTexture(vc);
        vTex.colorSpace = THREE.SRGBColorSpace;
        vignette = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ map: vTex, transparent: true, depthTest: false, depthWrite: false }));
        vignette.position.z = -VIGNETTE_D;
        vignette.renderOrder = 999;
        camera.add(vignette);
    }

    /* A symmetric frustum has m[0] = 1/tan(fovX/2) and m[5] = 1/tan(fovY/2),
       so the visible half-extent at distance d is d/m. Fitting the plane to
       that keeps the dark ring on screen in a headset as well as a window. */
    function fitVignette(cam) {
        if (!vignette) return;
        const m = cam.projectionMatrix.elements;
        if (!m[0] || !m[5]) return;
        vignette.scale.set(2.05 * VIGNETTE_D / m[0], 2.05 * VIGNETTE_D / m[5], 1);
    }

    function drawHud() {
        if (!hudCtx) return;
        const g = hudCtx;
        g.clearRect(0, 0, 512, 128);
        g.fillStyle = 'rgba(8,8,14,.62)';
        g.beginPath(); g.roundRect(0, 0, 512, 128, 22); g.fill();
        g.textBaseline = 'middle';
        g.fillStyle = '#EDEDED';
        g.font = 'bold 62px Trebuchet MS, sans-serif';
        g.textAlign = 'left';
        g.fillText(state.inLobby ? 'LOBBY' : String(state.score), 30, 66);
        g.font = 'bold 34px Trebuchet MS, sans-serif';
        g.fillStyle = '#FFD24A';
        g.textAlign = 'right';
        g.fillText('🪙 ' + state.coins, 482, 44);
        g.fillStyle = '#9A9AA6';
        g.font = '24px Trebuchet MS, sans-serif';
        g.fillText(state.inLobby ? 'slap the pad to fly' : 'best ' + state.best, 482, 92);
        hudTex.needsUpdate = true;
    }

    function menuItems() {
        return [
            { id: 'resume',  label: state.inLobby ? 'FLY' : (state.dead ? 'RESTART' : 'RESUME') },
            { id: 'restart', label: 'RESTART' },
            { id: 'lobby',   label: 'LOBBY' },
            { id: 'sound',   label: 'SOUND  ' + (soundOn ? 'ON' : 'OFF') },
            { id: 'quit',    label: 'LEAVE VR' }
        ];
    }

    function refreshMenu() {
        if (!menuCtx) return;
        const g = menuCtx, W = 320, H = 246;
        g.clearRect(0, 0, W, H);
        g.fillStyle = 'rgba(10,10,16,.90)';
        g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill();
        g.strokeStyle = '#FF6B35'; g.lineWidth = 3;
        g.beginPath(); g.roundRect(1.5, 1.5, W - 3, H - 3, 18); g.stroke();
        const items = menuItems();
        menuButtons = [];
        const pad = 10, bh = (H - pad * 2 - (items.length - 1) * 6) / items.length;
        items.forEach((it, i) => {
            const y = pad + i * (bh + 6);
            g.fillStyle = i === 0 ? '#FF4655' : 'rgba(255,255,255,.10)';
            g.beginPath(); g.roundRect(pad, y, W - pad * 2, bh, 12); g.fill();
            g.fillStyle = '#EDEDED';
            g.font = 'bold 22px Trebuchet MS, sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(it.label, W / 2, y + bh / 2);
            menuButtons.push({ id: it.id, u0: pad / W, u1: (W - pad) / W, v0: y / H, v1: (y + bh) / H });
        });
        menuTex.needsUpdate = true;
    }

    /* Hoisted: this runs every frame in both eyes, and allocating vectors a
       frame is the kind of churn that shows up as stutter on a Quest. */
    const _mLocal = new THREE.Vector3(), _mWorld = new THREE.Vector3(), _toCam = new THREE.Vector3(),
          _camPos = new THREE.Vector3(), _face = new THREE.Vector3(), _tip = new THREE.Vector3(),
          _q = new THREE.Quaternion();
    let lastPress = 0;

    function updateMenu(now) {
        if (!menu || hands.length < 2) return;
        // A plane's visible side faces +Z. Testing -Z asks whether its BACK is
        // toward you, which is never true while you are looking at it.
        menu.getWorldPosition(_mWorld);
        camera.getWorldPosition(_camPos);
        _toCam.copy(_camPos).sub(_mWorld).normalize();
        _face.set(0, 0, 1).applyQuaternion(menu.getWorldQuaternion(_q));
        const want = _face.dot(_toCam) > 0.55 && _mWorld.distanceTo(_camPos) < 0.9;
        if (want !== menuOpen) { menuOpen = want; menu.visible = want; if (want) refreshMenu(); }
        if (!menuOpen) return;

        hands[1].getWorldPosition(_tip);
        menu.worldToLocal(_mLocal.copy(_tip));
        if (Math.abs(_mLocal.z) > 0.045) return;
        const u = _mLocal.x / MENU_W + 0.5, v = 0.5 - _mLocal.y / MENU_H;
        if (u < 0 || u > 1 || v < 0 || v > 1) return;
        if (now - lastPress < 420) return;
        const hit = menuButtons.find(b => u >= b.u0 && u <= b.u1 && v >= b.v0 && v <= b.v1);
        if (!hit) return;
        lastPress = now;
        play('click', 0.5);
        menuAction(hit.id);
        refreshMenu();
    }

    function menuAction(id) {
        if (id === 'resume')  state.inLobby ? beginFlight() : (state.dead ? reset() : (state.running = true));
        if (id === 'restart') reset();
        if (id === 'lobby')   enterLobby();
        if (id === 'quit')    quit();
        if (id === 'sound')   { soundOn = !soundOn;
            try { localStorage.setItem('crix_vr_sound', soundOn ? '1' : '0'); } catch (e) {} }
    }

    /* ───────────── state + run ───────────── */

    const state = {
        running: false, dead: false, inLobby: true,
        vel: new THREE.Vector3(),
        y: START_Y, vy: 0, z: 0,
        score: 0, coins: 0, best: 0,
        nextPipeZ: -PIPE_SPACING * 2
    };
    const detector = new FlapDetector();

    function showWorld(flying) {
        if (lobby) lobby.visible = !flying;
        // The ground stays on in the lobby too — without it the island ends in
        // a black band where the world simply stops.
        if (ground) ground.position.y = flying ? 0 : -1.55;
        bushes.forEach(b => b.visible = flying);
        if (!flying) {
            pipes.forEach(p => p.visible = false);
            coins.forEach(c => c.visible = false);
        }
        if (trail) { trail.visible = flying; trailPts.length = 0; }
    }

    function enterLobby() {
        Object.assign(state, { inLobby: true, running: false, dead: false });
        state.vel.set(0, 0, 0);
        rig.position.set(0, 0, 3.4);
        rig.rotation.y = 0;
        hands.forEach(h => { h.userData.gripping = false; h.userData.prev.copy(h.position); });
        showWorld(false);
        drawHud();
        $('vrCrash').classList.remove('on');
    }

    function beginFlight() { state.inLobby = false; play('start', 0.6); reset(); }

    function reset() {
        Object.assign(state, { inLobby: false, dead: false, y: START_Y, vy: 0, z: 0,
                               score: 0, coins: 0, nextPipeZ: -PIPE_SPACING * 2 });
        detector.reset();
        showWorld(true);
        pipes.forEach(p => { p.visible = false; p.userData.z = undefined; });
        coins.forEach(c => { c.visible = false; });
        bushes.forEach((b, i) => { b.position.z = -Math.floor(i / 2) * BUSH_STEP; });
        rig.position.set(0, state.y, 0);
        rig.rotation.y = 0;
        for (let i = 0; i < PIPE_POOL; i++) spawnNext();
        drawHud();
        state.running = true;
        $('vrCrash').classList.remove('on');
    }

    function spawnNext() {
        const p = pipes.find(x => !x.visible) ||
                  pipes.reduce((a, b) => (a.userData.z > b.userData.z ? a : b));
        const gap = (PIPE_GAP / 2 + 2) + Math.random() * (CEIL - PIPE_GAP - 4);
        placePipe(p, state.nextPipeZ, gap);
        const c = coins.find(x => !x.visible);
        if (c && Math.random() < 0.72) { c.position.set(0, gap, state.nextPipeZ); c.visible = true; }
        state.nextPipeZ -= PIPE_SPACING;
    }

    function flap(impulse) {
        if (!state.running || state.dead) return;
        // Replacing the velocity outright meant a second flap while already
        // rising did nothing, which made climbing feel like it fought you.
        state.vy = state.vy <= 0 ? impulse : Math.min(state.vy + impulse * 0.55, impulse * 1.3);
        play('flap', 0.35);
    }

    function die(reason) {
        if (state.dead) return;
        state.dead = true;
        state.running = false;
        state.best = Math.max(state.best, state.score);
        play('die', 0.6);
        $('vrCrashScore').textContent = state.score;
        $('vrCrashLine').textContent = reason;
        $('vrCrash').classList.add('on');
        drawHud();
        onScore({ score: state.score, coins: state.coins });
    }

    const _hw = new THREE.Vector3(), _delta = new THREE.Vector3(), _yaw = new THREE.Euler();

    function stepLobby(dt) {
        if (dt <= 0) return;
        let planted = false;
        for (const h of hands) {
            // The paw's position in the rig's own space IS your arm's position
            // relative to your body, which is exactly the quantity we need.
            _yaw.set(0, rig.rotation.y, 0);
            _hw.copy(h.position).applyEuler(_yaw).add(rig.position);
            if (withinReach(_hw)) {
                if (h.userData.gripping) {
                    _delta.copy(h.position).sub(h.userData.prev);
                    const s = Math.sin(rig.rotation.y), c = Math.cos(rig.rotation.y);
                    state.vel.x -= (_delta.x * c - _delta.z * s) / dt * HAND_GRIP;
                    state.vel.y -= _delta.y / dt * HAND_GRIP;
                    state.vel.z -= (_delta.x * s + _delta.z * c) / dt * HAND_GRIP;
                } else play('grab', 0.22);
                h.userData.gripping = true;
                planted = true;
            } else h.userData.gripping = false;
            h.userData.prev.copy(h.position);
        }

        if (sky) sky.position.set(rig.position.x, 0, rig.position.z);
        if (city) city.position.set(rig.position.x, 0, rig.position.z);
        if (ground) ground.position.set(rig.position.x, -1.55, rig.position.z);

        state.vel.y += LOBBY_GRAV * dt;
        const damp = planted ? LOBBY_FRICT : LOBBY_DRAG;
        state.vel.x *= Math.pow(damp, dt * 60);
        state.vel.z *= Math.pow(damp, dt * 60);
        if (state.vel.length() > LOBBY_MAX_V) state.vel.setLength(LOBBY_MAX_V);
        rig.position.addScaledVector(state.vel, dt);

        const floorY = standingHeight(rig.position.x, rig.position.z);
        if (rig.position.y <= floorY) { rig.position.y = floorY; if (state.vel.y < 0) state.vel.y = 0; }
        if (rig.position.y < -14) enterLobby();

        for (const h of hands) {
            _yaw.set(0, rig.rotation.y, 0);
            _hw.copy(h.position).applyEuler(_yaw).add(rig.position);
            if (_hw.distanceTo(startPad.userData.hit) < 0.55) { beginFlight(); return; }
        }
    }

    function step(dt, now) {
        dt = Math.min(dt, 0.05);
        clouds.forEach(c => { c.position.x += c.userData.drift * dt; if (c.position.x > 110) c.position.x = -110; });

        if (state.inLobby) { stepLobby(dt); updateMenu(now); return; }
        updateMenu(now);
        if (!state.running || state.dead) return;

        const ly = hands[0] ? hands[0].position.y : null;
        const ry = hands[1] ? hands[1].position.y : null;
        const impulse = detector.update(ly, ry, dt, now);
        if (impulse > 0) flap(impulse);

        state.vy += GRAVITY * dt;
        if (state.vy < TERMINAL) state.vy = TERMINAL;
        state.y += state.vy * dt;
        state.z -= SPEED * dt;

        if (state.y <= FLOOR) { state.y = FLOOR; return die('You hit the ground.'); }
        if (state.y >= CEIL)  { state.y = CEIL; state.vy = Math.min(state.vy, 0); }
        rig.position.set(0, state.y, state.z);

        if (sky)  { sky.position.z = state.z; }
        if (city) { city.position.z = state.z; }
        if (ground) { ground.position.y = 0; ground.position.z = state.z; }
        bushes.forEach(b => {
            if (b.position.z > state.z + BUSH_STEP * 1.5) b.position.z -= BUSH_POOL / 2 * BUSH_STEP;
        });

        if (trail) {
            trailPts.push(0.35, state.y - 0.25, state.z);
            while (trailPts.length > TRAIL_N * 3) trailPts.splice(0, 3);
            const pos = trail.geometry.attributes.position;
            for (let i = 0; i < TRAIL_N; i++) {
                const k = Math.max(0, trailPts.length - (TRAIL_N - i) * 3);
                pos.setXYZ(i, trailPts[k] ?? 0.35, trailPts[k+1] ?? state.y, trailPts[k+2] ?? state.z);
            }
            pos.needsUpdate = true;
        }

        for (const p of pipes) {
            if (!p.visible) continue;
            const dz = state.z - p.userData.z;
            if (!p.userData.scored && dz < -(PIPE_R + BODY_R)) {
                p.userData.scored = true;
                state.score++;
                play('point', 0.32);
                drawHud();
            }
            if (Math.abs(dz) < PIPE_R + BODY_R) {
                if (state.y < p.userData.bottom + BODY_R || state.y > p.userData.top - BODY_R)
                    return die('You hit a pipe.');
            }
            if (dz < -PIPE_SPACING * 1.2) { p.visible = false; spawnNext(); }
        }

        for (const c of coins) {
            if (!c.visible) continue;
            c.userData.spin.rotation.z += dt * 3.2;
            c.position.y += Math.sin(now / 360) * dt * 0.4;
            if (Math.abs(state.z - c.position.z) < 1.0 && Math.abs(state.y - c.position.y) < 1.3) {
                c.visible = false; state.coins++; play('coin', 0.5); drawHud();
            } else if (c.position.z > state.z + 8) c.visible = false;
        }
    }

    /* ───────────── input off-headset ───────────── */

    function screenAction() {
        if (state.inLobby) return beginFlight();
        if (state.dead) return reset();
        flap((FLAP_MIN_V + FLAP_MAX_V) / 2);
    }
    const onKey = e => { if (e.code === 'Space') { e.preventDefault(); screenAction(); } };
    addEventListener('keydown', onKey);
    renderer.domElement.addEventListener('pointerdown', screenAction);

    function recentre() {
        const base = renderer.xr.getReferenceSpace && renderer.xr.getReferenceSpace();
        if (base && base.getOffsetReferenceSpace) {
            try { renderer.xr.setReferenceSpace(base.getOffsetReferenceSpace(new XRRigidTransform())); }
            catch (e) {}
        }
        detector.reset();
    }

    /* ───────────── lifecycle ───────────── */

    buildWorld();
    buildPlayer();
    hands.forEach(h => {
        const src = h.userData.src;
        src.addEventListener('selectstart', recentre);
        src.addEventListener('squeezestart', recentre);
    });

    function applyComfort() {
        if (vignette) vignette.visible = comfortBox.checked;
        try { localStorage.setItem('crix_vr_vignette', comfortBox.checked ? '1' : '0'); } catch (e) {}
    }
    comfortBox.addEventListener('change', applyComfort);

    function begin(flat) { applyComfort(); ui.classList.add('gone'); enterLobby(); }

    const headset = await headsetPresent();
    if (headset) {
        $('vrSlot').appendChild(VRButton.createButton(renderer));
        note.textContent = 'Headset found. Put it on and press the button.';
    } else {
        note.textContent = supported()
            ? 'No headset on this device — open Flappy Crix in the headset’s own browser.'
            : 'This browser has no WebXR. Try the Quest browser, or Chrome with a headset attached.';
    }
    $('vrFlat').disabled = false;
    $('vrFlat').addEventListener('click', () => begin(true));
    renderer.xr.addEventListener('sessionstart', () => begin(false));
    $('vrAgain').addEventListener('click', () => { play('click', .5); reset(); });

    let stopped = false;
    function quit() {
        if (stopped) return;
        stopped = true;
        renderer.setAnimationLoop(null);
        try { renderer.xr.getSession()?.end(); } catch (e) {}
        removeEventListener('resize', onResize);
        removeEventListener('keydown', onKey);
        scene.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
            mats.forEach(m => { Object.values(m).forEach(v => v && v.isTexture && v.dispose()); m.dispose(); });
        });
        renderer.dispose();
        host.remove();
        style.remove();
        onExit();
    }
    $('vrQuit').addEventListener('click', quit);
    $('vrCrashQuit').addEventListener('click', quit);

    function syncHands() {
        if (!renderer.xr.isPresenting) return;
        for (const h of hands) {
            const src = h.userData.src;
            if (!src || !src.visible) continue;
            h.position.copy(src.position);
            h.quaternion.copy(src.quaternion);
        }
    }

    let last = 0;
    renderer.setAnimationLoop(time => {
        const now = time || performance.now();
        const dt = last ? (now - last) / 1000 : 0;
        last = now;
        syncHands();
        step(dt, now);
        fitVignette(renderer.xr.isPresenting
            ? (renderer.xr.getCamera().cameras[0] || camera) : camera);
        renderer.render(scene, camera);
    });

    const api = { stop: quit, state, detector, FlapDetector, step, stepLobby, reset,
                  enterLobby, beginFlight, flap, withinReach, standingHeight, solids,
                  hands, rig, scene, pipes, coins, menuAction, updateMenu,
                  menuButtons: () => menuButtons, isMenuOpen: () => menuOpen,
                  menuOf: () => menu, trailOf: () => trail, THREE,
                  consts: { SPEED, GRAVITY, TERMINAL, FLAP_MIN_V, FLAP_MAX_V, HAND_MIN, HAND_MAX,
                            PIPE_GAP, PIPE_SPACING, CEIL, FLOOR, GRAB_REACH, FLOOR_REACH, PX_PER_M } };
    window.__vr = api;
    return api;
}
