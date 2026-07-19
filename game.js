'use strict';
/* ============================================================
   PACMAN REDUX — an original-code homage to the 1980 classic.
   All graphics are drawn with canvas primitives and all audio
   is synthesized with the Web Audio API. No original assets.
   Desktop: arrow keys / WASD.  Mobile: joystick widget or swipe.
   ============================================================ */

//////////////////////// CONSTANTS ////////////////////////////

const T = 16;                       // tile size (px, logical)
const COLS = 28, ROWS = 31;
const YOFF = 3 * T;                 // 3 header rows (score area)
const W = COLS * T;                 // 448
const H = (ROWS + 5) * T;           // 576 (3 header + 31 maze + 2 footer)
const BASE = 75.757575 * (T / 8) / 60;  // px/frame at "100%" arcade speed

const TOUCH_DEVICE = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const STOP = 0, UP = 1, LEFT = 2, DOWN = 3, RIGHT = 4;
const DIRS = {
  [STOP]: { x: 0, y: 0 }, [UP]: { x: 0, y: -1 }, [LEFT]: { x: -1, y: 0 },
  [DOWN]: { x: 0, y: 1 }, [RIGHT]: { x: 1, y: 0 }
};
const OPP = { [STOP]: STOP, [UP]: DOWN, [DOWN]: UP, [LEFT]: RIGHT, [RIGHT]: LEFT };

const COL_MAZE   = '#2121ff';
const COL_MAZE_W = '#f8f8ff';
const COL_DOOR   = '#ffb8de';
const COL_DOT    = '#ffb8ae';
const COL_PAC    = '#ffe100';
const COL_TEXT   = '#ffffff';
const COL_FRIGHT = '#2121ff';

// 28x31 playfield. '#'=wall '.'=dot 'o'=energizer ' '=open '='=ghost door
const MAZE_SRC = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '######.##### ## #####.######',
  '######.##          ##.######',
  '######.## ###==### ##.######',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '######.## ######## ##.######',
  '######.##          ##.######',
  '######.## ######## ##.######',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################'
];

const TUNNEL_ROW = 14;
const HOUSE_X = 14 * T;                      // door / house center x = 224
const DOOR_Y  = 11 * T + T / 2 + YOFF;       // row-11 corridor center = 232
const HOUSE_Y = 14 * T + T / 2 + YOFF;       // in-house resting y     = 280
const FRUIT_X = HOUSE_X, FRUIT_Y = 17 * T + T / 2 + YOFF;
const NO_UP_TILES = [[12, 11], [15, 11], [12, 23], [15, 23]];

const FRUITS = [
  { name: 'cherry',     pts: 100 },
  { name: 'strawberry', pts: 300 },
  { name: 'orange',     pts: 500 },
  { name: 'apple',      pts: 700 },
  { name: 'melon',      pts: 1000 },
  { name: 'rocket',     pts: 2000 },
  { name: 'bell',       pts: 3000 },
  { name: 'key',        pts: 5000 }
];
function fruitIndex(L) {
  if (L === 1) return 0; if (L === 2) return 1;
  if (L <= 4) return 2;  if (L <= 6) return 3;
  if (L <= 8) return 4;  if (L <= 10) return 5;
  if (L <= 12) return 6; return 7;
}

//////////////////////// LEVEL TABLES /////////////////////////

function speedSpec(L) {
  if (L === 1)  return { pac: .80, pacF: .90, ghost: .75, fright: .50, tunnel: .40 };
  if (L <= 4)   return { pac: .90, pacF: .95, ghost: .85, fright: .55, tunnel: .45 };
  if (L <= 20)  return { pac: 1.0, pacF: 1.0, ghost: .95, fright: .60, tunnel: .50 };
  return          { pac: .90, pacF: .90, ghost: .95, fright: .60, tunnel: .50 };
}
function frightSpec(L) {
  const t = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1, 0, 0];
  const f = [5, 5, 5, 5, 5, 5, 5, 5, 3, 5, 5, 3, 3, 5, 3, 3, 0, 3, 0, 0];
  const i = Math.min(L - 1, 19);
  return { time: t[i], flashes: f[i] };
}
function elroyDots(L) {
  const t = [20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 80, 80, 80, 100, 100, 100, 100, 120];
  return t[Math.min(L - 1, 18)];
}
function modeDurations(L) {
  if (L === 1) return [7, 20, 7, 20, 5, 20, 5, Infinity];
  if (L <= 4)  return [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity];
  return         [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity];
}
function houseDotLimit(L, name) {
  if (name === 'pinky') return 0;
  if (name === 'inky')  return L === 1 ? 30 : 0;
  return L === 1 ? 60 : (L === 2 ? 50 : 0);   // clyde
}

//////////////////////// CANVAS / SCALING /////////////////////

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let SCALE = 1;

function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H) * 0.98;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.style.width = (W * s) + 'px';
  cv.style.height = (H * s) + 'px';
  cv.width = Math.round(W * s * dpr);
  cv.height = Math.round(H * s * dpr);
  SCALE = s * dpr;
}
addEventListener('resize', resize);
resize();

//////////////////////// MAZE DATA ////////////////////////////

const grid = MAZE_SRC.map(row => row.split(''));
let dots = [];        // dots[r][c] = '.' | 'o' | null
let dotsTotal = 0, dotsLeft = 0;

function resetDots() {
  dots = []; dotsTotal = 0;
  for (let r = 0; r < ROWS; r++) {
    dots.push([]);
    for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      dots[r][c] = (ch === '.' || ch === 'o') ? ch : null;
      if (dots[r][c]) dotsTotal++;
    }
  }
  dotsLeft = dotsTotal;
}

function tileChar(c, r) {
  if (r === TUNNEL_ROW && (c < -2 || c > COLS + 1)) return ' ';
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) {
    return (r === TUNNEL_ROW) ? ' ' : '#';
  }
  return grid[r][c];
}
function passable(c, r) {
  const ch = tileChar(c, r);
  return ch !== '#' && ch !== '=';
}
function isWallForArt(c, r) {
  if (r === TUNNEL_ROW && (c < 0 || c >= COLS)) return false;
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
  return grid[r][c] === '#';
}
function inTunnelZone(x, y) {
  const r = Math.floor((y - YOFF) / T);
  const c = Math.floor(x / T);
  return r === TUNNEL_ROW && (c <= 5 || c >= 22);
}

// Pre-rendered maze wall art (normal + white flash variant)
function buildMazeImage(white) {
  const MS = 2, INSET = 3;
  const cw = W * MS, ch = ROWS * T * MS;
  const blob = document.createElement('canvas');
  blob.width = cw; blob.height = ch;
  const b = blob.getContext('2d');
  b.scale(MS, MS);
  b.fillStyle = '#fff';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] !== '#') continue;
    const x0 = c * T + (isWallForArt(c - 1, r) ? 0 : INSET);
    const x1 = (c + 1) * T - (isWallForArt(c + 1, r) ? 0 : INSET);
    const y0 = r * T + (isWallForArt(c, r - 1) ? 0 : INSET);
    const y1 = (r + 1) * T - (isWallForArt(c, r + 1) ? 0 : INSET);
    b.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  // tint the blob
  const tinted = document.createElement('canvas');
  tinted.width = cw; tinted.height = ch;
  const tc = tinted.getContext('2d');
  tc.drawImage(blob, 0, 0);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = white ? COL_MAZE_W : COL_MAZE;
  tc.fillRect(0, 0, cw, ch);
  // dilate tinted blob, then punch out the interior -> wall outlines
  const img = document.createElement('canvas');
  img.width = cw; img.height = ch;
  const g = img.getContext('2d');
  const R = 1.6 * MS;
  const offs = [[R, 0], [-R, 0], [0, R], [0, -R],
                [R * .72, R * .72], [-R * .72, R * .72], [R * .72, -R * .72], [-R * .72, -R * .72]];
  for (const [ox, oy] of offs) g.drawImage(tinted, ox, oy);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(blob, 0, 0);
  g.globalCompositeOperation = 'source-over';
  // ghost-house door
  g.fillStyle = COL_DOOR;
  g.fillRect(13 * T * MS, (12 * T + 6) * MS, 2 * T * MS, 3 * MS);
  return img;
}
const mazeImg = buildMazeImage(false);
const mazeImgWhite = buildMazeImage(true);

//////////////////////// AUDIO ////////////////////////////////

let AC = null, master = null, muted = false;
let engine = null;          // continuous siren/fright/eyes loop
let wakaFlip = false;

function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(AC.destination);
}
function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 1;
  document.getElementById('mute').innerHTML = m ? '&#128263;' : '&#128266;';
}
function blip(f0, f1, dur, type, vol, when = 0, curve = 0) {
  if (!AC || muted) return;
  const t0 = AC.currentTime + when;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (curve) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + .02);
}
function sWaka() {
  wakaFlip = !wakaFlip;
  if (wakaFlip) blip(480, 200, .07, 'square', .16);
  else blip(200, 480, .07, 'square', .16);
}
function sEnergizer() { blip(180, 90, .18, 'square', .2, 0, 1); }
function sEatGhost()  { blip(140, 950, .3, 'square', .22, 0, 1); }
function sFruit()     { blip(500, 90, .16, 'square', .22, 0, 1); blip(700, 120, .14, 'square', .12, .05, 1); }
function sExtraLife() { for (let i = 0; i < 5; i++) blip(1320, 1320, .09, 'square', .16, i * .12); }
function sDeath() {
  if (!AC || muted) return;
  const seq = [620, 540, 460, 380, 300, 230];
  seq.forEach((f, i) => {
    blip(f, f * .62, .16, 'square', .18, i * .17, 1);
    blip(f * 1.5, f * .8, .16, 'triangle', .1, i * .17, 1);
  });
  blip(140, 40, .22, 'square', .25, seq.length * .17 + .05, 1);
  blip(140, 40, .22, 'square', .25, seq.length * .17 + .32, 1);
}
// Original-composed chip-tune intro jingle (evokes the era, copies nothing)
function sJingle() {
  if (!AC || muted) return;
  const A4=440, Cs5=554.37, E5=659.26, A5=880, F5=698.46, D5=587.33, Bb4=466.16, Bb5=932.33,
        G5=783.99, Gs5=830.61, Fs5=739.99, A2=110, A3=220, Bb2=116.54, Bb3=233.08,
        E3=164.81, F3=174.61, G3=196;
  let t = 0; const M = .125;
  const mel = [
    [A4,M],[A5,M],[E5,M],[Cs5,M],[A5,M],[E5,M],[Cs5,M*2],
    [Bb4,M],[Bb5,M],[F5,M],[D5,M],[Bb5,M],[F5,M],[D5,M*2],
    [E5,M*.8],[F5,M*.8],[Fs5,M*.8],[G5,M*.8],[Gs5,M*.8],[A5,M*2.6]
  ];
  for (const [f, d] of mel) { blip(f, f, d * .92, 'square', .13, t); t += d; }
  t = 0;
  const bass = [
    [A2,M*2],[A3,M*2],[A2,M*2],[A3,M*2],
    [Bb2,M*2],[Bb3,M*2],[Bb2,M*2],[Bb3,M*2],
    [E3,M*.8],[F3,M*.8],[G3,M*.8],[G3,M*.8],[A3,M*.8],[A3,M*2.6]
  ];
  for (const [f, d] of bass) { blip(f, f, d * .95, 'triangle', .17, t); t += d; }
}
function ensureEngine() {
  if (!AC || engine) return;
  const o = AC.createOscillator(), g = AC.createGain();
  const lfo = AC.createOscillator(), lg = AC.createGain();
  o.type = 'triangle'; o.frequency.value = 300;
  lfo.type = 'triangle'; lfo.frequency.value = .9;
  lg.gain.value = 60;
  lfo.connect(lg); lg.connect(o.frequency);
  g.gain.value = 0;
  o.connect(g); g.connect(master);
  o.start(); lfo.start();
  engine = { o, g, lfo, lg };
}
function updateEngine() {
  if (!AC) return;
  ensureEngine();
  const now = AC.currentTime;
  let vol = 0, base = 300, lfoF = .9, depth = 60;
  if (state === 'play' && !paused) {
    const eyes = ghosts.some(g => g.state === 'eyes' || g.state === 'enter');
    if (eyes) { vol = .05; base = 950; lfoF = 6.5; depth = 260; }
    else if (frightT > 0) { vol = .07; base = 190; lfoF = 5; depth = 110; }
    else {
      const prog = 1 - dotsLeft / dotsTotal;
      vol = .06; base = 300 + prog * 260; lfoF = .85 + prog * .8; depth = 65;
    }
  }
  engine.g.gain.setTargetAtTime(muted ? 0 : vol, now, .05);
  engine.o.frequency.setTargetAtTime(base, now, .08);
  engine.lfo.frequency.setTargetAtTime(lfoF, now, .08);
  engine.lg.gain.setTargetAtTime(depth, now, .08);
}

//////////////////////// INPUT ////////////////////////////////

let desiredDir = STOP;

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase()) || e.key.startsWith('Arrow'))
    e.preventDefault();
  initAudio();
  if (k === 'arrowup' || k === 'w') desiredDir = UP;
  else if (k === 'arrowdown' || k === 's') desiredDir = DOWN;
  else if (k === 'arrowleft' || k === 'a') desiredDir = LEFT;
  else if (k === 'arrowright' || k === 'd') desiredDir = RIGHT;
  else if (k === 'm') setMuted(!muted);
  else if (k === 'p' && state === 'play') paused = !paused;
  else if (k === 'enter' && (state === 'attract' || state === 'gameover')) startGame();
});

document.getElementById('mute').addEventListener('pointerdown', e => {
  e.stopPropagation(); initAudio(); setMuted(!muted);
});

// tap to start + swipe steering on the canvas
let swipe = null;
cv.addEventListener('touchstart', e => {
  e.preventDefault(); initAudio();
  if (state === 'attract' || state === 'gameover') { startGame(); return; }
  const t = e.changedTouches[0];
  swipe = { x: t.clientX, y: t.clientY };
}, { passive: false });
cv.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
  desiredDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP);
  swipe = { x: t.clientX, y: t.clientY };
}, { passive: false });
cv.addEventListener('mousedown', () => {
  initAudio();
  if (state === 'attract' || state === 'gameover') startGame();
});

// joystick widget (touch devices only) — shown only during gameplay
let setTouchVisible = () => {};
if (TOUCH_DEVICE) {
  const wrap = document.createElement('div'); wrap.id = 'touch';
  wrap.innerHTML = '<div id="stick"><div id="knob"></div></div>';
  document.body.appendChild(wrap);
  const stick = wrap.querySelector('#stick'), knob = wrap.querySelector('#knob');
  let sid = null, touchShown = false;
  setTouchVisible = show => {
    if (show === touchShown) return;
    touchShown = show;
    wrap.style.display = show ? 'block' : 'none';
    if (!show) jEnd();
  };
  function jMove(t) {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const max = r.width * .3, len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, max / len);
    knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    // small dead-zone so direction flips fast on short thumb moves
    if (len > r.width * .07)
      desiredDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP);
  }
  function jEnd() { sid = null; knob.style.transform = 'translate(-50%,-50%)'; }
  stick.addEventListener('touchstart', e => {
    e.preventDefault(); initAudio();
    sid = e.changedTouches[0].identifier; jMove(e.changedTouches[0]);
  }, { passive: false });
  stick.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === sid) jMove(t);
  }, { passive: false });
  stick.addEventListener('touchend', jEnd);
  stick.addEventListener('touchcancel', jEnd);
}

addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') paused = true;
});

//////////////////////// GAME STATE ///////////////////////////

let state = 'attract';    // attract | ready | play | eatpause | dying | complete | flash | gameover
let paused = false;
let level = 1, score = 0, lives = 3, extraAwarded = false;
let high = parseInt(localStorage.getItem('pacman-redux-high') || '0', 10);
let spec = speedSpec(1), fright = frightSpec(1), modes = modeDurations(1);
let modeIndex = 0, modeTimer = 0;         // scatter/chase schedule
let frightT = 0, ghostChain = 0;
let stateT = 0;                           // generic timer for the current state
let readyLong = true;
let dotsEatenLevel = 0;
let fruitT = 0, fruitShown = [];
let lastDotT = 0;
let globalDotMode = false, globalDotCount = 0;
let clydeWasOut = false;
let popups = [];                          // {x,y,text,t,color}
let eatVictim = null;
let attractT = 0;
let frame = 0;

const pac = { x: 0, y: 0, dir: STOP, anim: 0, freeze: 0, deadT: 0 };

function makeGhost(name, color, scatterC, scatterR, startX, order) {
  return {
    name, color, scatterC, scatterR, order,
    startX, x: startX, y: HOUSE_Y, dir: LEFT,
    state: 'house', fright: false, dotCount: 0, bob: 1
  };
}
const blinky = makeGhost('blinky', '#ff0000', 25, -3, HOUSE_X, 0);
const pinky  = makeGhost('pinky',  '#ffb8ff', 2, -3, HOUSE_X, 1);
const inky   = makeGhost('inky',   '#00ffff', COLS - 1, ROWS + 1, 12 * T, 2);
const clyde  = makeGhost('clyde',  '#ffb852', 0, ROWS + 1, 16 * T, 3);
const ghosts = [blinky, pinky, inky, clyde];

function tileOf(e) {
  return { c: Math.floor(e.x / T), r: Math.floor((e.y - YOFF) / T) };
}

function resetActors() {
  pac.x = HOUSE_X; pac.y = 23 * T + T / 2 + YOFF;
  pac.dir = STOP; desiredDir = LEFT; pac.anim = 0; pac.freeze = 0;
  for (const g of ghosts) {
    g.x = g.startX; g.fright = false; g.bob = g.order % 2 ? 1 : -1;
    if (g === blinky) { g.y = DOOR_Y; g.state = 'normal'; g.dir = LEFT; }
    else { g.y = HOUSE_Y; g.state = 'house'; g.dir = UP; }
  }
  frightT = 0; ghostChain = 0; lastDotT = 0;
  modeIndex = 0; modeTimer = modes[0];
  clydeWasOut = false;
  popups = []; eatVictim = null;
}

function startLevel(L) {
  level = L;
  spec = speedSpec(L); fright = frightSpec(L); modes = modeDurations(L);
  resetDots();
  dotsEatenLevel = 0; fruitT = 0;
  globalDotMode = false; globalDotCount = 0;
  for (const g of ghosts) g.dotCount = 0;
  resetActors();
}

function startGame() {
  score = 0; lives = 3; extraAwarded = false;
  fruitShown = [];
  startLevel(1);
  state = 'ready'; stateT = 3.6; readyLong = true;
  sJingle();
}

function addScore(n) {
  score += n;
  if (score > high) { high = score; localStorage.setItem('pacman-redux-high', String(high)); }
  if (!extraAwarded && score >= 10000) {
    extraAwarded = true; lives++; sExtraLife();
    popups.push({ x: W / 2, y: YOFF - 8, text: 'EXTRA LIFE!', t: 2.5, color: COL_PAC });
  }
}

//////////////////////// MOVEMENT CORE ////////////////////////

function wrapTunnel(e) {
  if (e.x < -T * 1.5) e.x += (COLS + 3) * T;
  else if (e.x > (COLS + 1.5) * T) e.x -= (COLS + 3) * T;
}

// Move axis-aligned actor `dist` px; onCenter(c,r) fires at each tile center.
function moveActor(e, dist, onCenter) {
  let guard = 0;
  while (dist > 1e-4 && ++guard < 300) {
    if (e.dir === STOP) return;
    const d = DIRS[e.dir];
    const c = Math.floor(e.x / T), r = Math.floor((e.y - YOFF) / T);
    const cx = c * T + T / 2, cy = r * T + T / 2 + YOFF;
    let seg = d.x ? (cx - e.x) * d.x : (cy - e.y) * d.y;   // to current center
    if (seg <= 1e-4) seg += T;                              // else to next center
    const m = Math.min(dist, seg);
    e.x += d.x * m; e.y += d.y * m; dist -= m;
    wrapTunnel(e);
    if (m >= seg - 1e-4) {
      const c2 = Math.floor(e.x / T), r2 = Math.floor((e.y - YOFF) / T);
      e.x = c2 * T + T / 2; e.y = r2 * T + T / 2 + YOFF;
      onCenter(c2, r2);
    }
  }
}

//////////////////////// PAC UPDATE ///////////////////////////

function pacSpeed() {
  return BASE * (frightT > 0 ? spec.pacF : spec.pac);
}

function updatePac() {
  if (pac.freeze > 0) { pac.freeze--; return; }
  // instant reverse
  if (desiredDir !== STOP && desiredDir === OPP[pac.dir]) pac.dir = desiredDir;
  if (pac.dir === STOP && desiredDir !== STOP) {
    const t = tileOf(pac), d = DIRS[desiredDir];
    if (passable(t.c + d.x, t.r + d.y)) pac.dir = desiredDir;
  }
  const before = { x: pac.x, y: pac.y };
  moveActor(pac, pacSpeed(), (c, r) => {
    if (desiredDir !== STOP && desiredDir !== pac.dir) {
      const d = DIRS[desiredDir];
      if (passable(c + d.x, r + d.y)) pac.dir = desiredDir;
    }
    const d = DIRS[pac.dir];
    if (!passable(c + d.x, r + d.y)) pac.dir = STOP;
  });
  if (pac.x !== before.x || pac.y !== before.y) pac.anim += 0.28;

  // eat dots on tile occupancy
  const t = tileOf(pac);
  if (t.r >= 0 && t.r < ROWS && t.c >= 0 && t.c < COLS && dots[t.r][t.c]) {
    const kind = dots[t.r][t.c];
    dots[t.r][t.c] = null; dotsLeft--; dotsEatenLevel++;
    lastDotT = 0;
    onDotEatenHouseLogic();
    if (kind === 'o') {
      addScore(50); sEnergizer();
      startFright();
      pac.freeze = 3;
    } else {
      addScore(10); sWaka();
      pac.freeze = 1;
    }
    if (dotsEatenLevel === 70 || dotsEatenLevel === 170) fruitT = 9.5;
    if (dotsLeft === 0) { state = 'complete'; stateT = 1.2; return; }
  }

  // fruit pickup
  if (fruitT > 0 && Math.abs(pac.x - FRUIT_X) < T * .7 && Math.abs(pac.y - FRUIT_Y) < T * .7) {
    fruitT = 0;
    const f = FRUITS[fruitIndex(level)];
    addScore(f.pts); sFruit();
    popups.push({ x: FRUIT_X, y: FRUIT_Y, text: String(f.pts), t: 2, color: COL_DOOR });
  }
}

function startFright() {
  ghostChain = 0;
  for (const g of ghosts) {
    if (g.state === 'normal') { g.dir = OPP[g.dir]; g.fright = fright.time > 0; }
    else if (g.state !== 'eyes' && g.state !== 'enter') g.fright = fright.time > 0;
  }
  if (fright.time > 0) frightT = fright.time;
}

//////////////////////// GHOST LOGIC //////////////////////////

function noUpAt(c, r) { return NO_UP_TILES.some(([tc, tr]) => tc === c && tr === r); }

function chaseTarget(g) {
  const pt = tileOf(pac), pd = DIRS[pac.dir === STOP ? LEFT : pac.dir];
  if (g === blinky) return [pt.c, pt.r];
  if (g === pinky) {
    let c = pt.c + pd.x * 4, r = pt.r + pd.y * 4;
    if (pac.dir === UP) c -= 4;                    // the classic overflow quirk
    return [c, r];
  }
  if (g === inky) {
    let c = pt.c + pd.x * 2, r = pt.r + pd.y * 2;
    if (pac.dir === UP) c -= 2;
    const bt = tileOf(blinky);
    return [bt.c + 2 * (c - bt.c), bt.r + 2 * (r - bt.r)];
  }
  const gt = tileOf(g);                            // clyde
  const d2 = (gt.c - pt.c) ** 2 + (gt.r - pt.r) ** 2;
  return d2 > 64 ? [pt.c, pt.r] : [g.scatterC, g.scatterR];
}

function chooseDir(g, c, r, tc, tr) {
  const banned = OPP[g.dir];
  let best = STOP, bestD = Infinity;
  for (const dir of [UP, LEFT, DOWN, RIGHT]) {
    if (dir === banned) continue;
    if (dir === UP && g.state === 'normal' && noUpAt(c, r)) continue;
    const d = DIRS[dir];
    if (!passable(c + d.x, r + d.y)) continue;
    const dist = (c + d.x - tc) ** 2 + (r + d.y - tr) ** 2;
    if (dist < bestD) { bestD = dist; best = dir; }
  }
  return best === STOP ? banned : best;
}

function randomDir(g, c, r) {
  const banned = OPP[g.dir], open = [];
  for (const dir of [UP, LEFT, DOWN, RIGHT]) {
    if (dir === banned) continue;
    const d = DIRS[dir];
    if (passable(c + d.x, r + d.y)) open.push(dir);
  }
  return open.length ? open[(Math.random() * open.length) | 0] : banned;
}

function elroyPhase() {
  if (!clydeWasOut) return 0;
  const e1 = elroyDots(level);
  if (dotsLeft <= e1 / 2) return 2;
  if (dotsLeft <= e1) return 1;
  return 0;
}

function ghostSpeed(g) {
  if (g.state === 'eyes' || g.state === 'enter') return BASE * 1.6;
  if (g.state === 'leave' || g.state === 'house') return BASE * .45;
  if (inTunnelZone(g.x, g.y)) return BASE * spec.tunnel;
  if (g.fright) return BASE * spec.fright;
  if (g === blinky) {
    const e = elroyPhase();
    if (e) return BASE * (spec.ghost + .05 * e);
  }
  return BASE * spec.ghost;
}

function currentMode() { return modeIndex % 2 === 0 ? 'scatter' : 'chase'; }

function updateGhost(g) {
  const sp = ghostSpeed(g);
  if (g.state === 'house') {
    g.y += g.bob * .5;
    if (g.y > HOUSE_Y + 3) { g.y = HOUSE_Y + 3; g.bob = -1; }
    if (g.y < HOUSE_Y - 3) { g.y = HOUSE_Y - 3; g.bob = 1; }
    g.dir = g.bob < 0 ? UP : DOWN;
    return;
  }
  if (g.state === 'leave') {
    if (Math.abs(g.x - HOUSE_X) > .8) {
      g.x += Math.sign(HOUSE_X - g.x) * Math.min(sp, Math.abs(g.x - HOUSE_X));
      g.dir = g.x < HOUSE_X ? RIGHT : LEFT;
    } else {
      g.x = HOUSE_X;
      g.y -= Math.min(sp, g.y - DOOR_Y);
      g.dir = UP;
      if (g.y <= DOOR_Y + .5) {
        g.y = DOOR_Y; g.x = HOUSE_X;
        g.state = 'normal'; g.dir = LEFT;
        if (g === clyde) clydeWasOut = true;
      }
    }
    return;
  }
  if (g.state === 'enter') {
    if (Math.abs(g.x - HOUSE_X) > .8) {
      g.x += Math.sign(HOUSE_X - g.x) * Math.min(sp, Math.abs(g.x - HOUSE_X));
    } else {
      g.x = HOUSE_X;
      g.y += Math.min(sp, HOUSE_Y - g.y);
      g.dir = DOWN;
      if (g.y >= HOUSE_Y - .5) { g.y = HOUSE_Y; g.state = 'leave'; }
    }
    return;
  }
  // grid states: normal | eyes (fright is a flag on normal)
  moveActor(g, sp, (c, r) => {
    if (g.state === 'eyes') {
      if (r === 11 && (c === 13 || c === 14)) { g.state = 'enter'; g.x = c * T + T / 2; return; }
      g.dir = chooseDir(g, c, r, 13, 11);
      return;
    }
    if (g.fright) { g.dir = randomDir(g, c, r); return; }
    let tc, tr;
    const elroy = g === blinky && elroyPhase() > 0;
    if (currentMode() === 'chase' || elroy) [tc, tr] = chaseTarget(g);
    else [tc, tr] = [g.scatterC, g.scatterR];
    g.dir = chooseDir(g, c, r, tc, tr);
  });
}

// ghost-house dot counters (personal + global-after-death + starvation timer)
function nextHoused() {
  return [pinky, inky, clyde].find(g => g.state === 'house') || null;
}
function onDotEatenHouseLogic() {
  if (globalDotMode) {
    globalDotCount++;
    if (globalDotCount === 7 && pinky.state === 'house') pinky.state = 'leave';
    if (globalDotCount === 17 && inky.state === 'house') inky.state = 'leave';
    if (globalDotCount === 32) {
      if (clyde.state === 'house') clyde.state = 'leave';
      globalDotMode = false;
    }
  } else {
    const g = nextHoused();
    if (g) {
      g.dotCount++;
      if (g.dotCount >= houseDotLimit(level, g.name)) g.state = 'leave';
    }
  }
}
function updateHouseTimeout(dt) {
  lastDotT += dt;
  const limit = level < 5 ? 4 : 3;
  if (lastDotT >= limit) {
    lastDotT = 0;
    const g = nextHoused();
    if (g) g.state = 'leave';
  }
}

//////////////////////// COLLISIONS ///////////////////////////

function checkCollisions() {
  for (const g of ghosts) {
    if (g.state === 'eyes' || g.state === 'enter' || g.state === 'house') continue;
    if (g.state === 'leave' && g.y > DOOR_Y + T * .7) continue;
    if (Math.max(Math.abs(g.x - pac.x), Math.abs(g.y - pac.y)) < T * .55) {
      if (g.fright) {
        g.fright = false; g.state = 'eyes';
        ghostChain++;
        const pts = 100 * (1 << ghostChain);      // 200 400 800 1600
        addScore(pts); sEatGhost();
        eatVictim = { g, pts };
        state = 'eatpause'; stateT = .85;
        return;
      } else {
        state = 'dying'; stateT = 1.0; pac.deadT = 0;
        return;
      }
    }
  }
}

//////////////////////// MAIN UPDATE //////////////////////////

function updatePlay(dt) {
  // scatter/chase schedule (paused during fright)
  if (frightT > 0) {
    frightT -= dt;
    if (frightT <= 0) {
      frightT = 0;
      for (const g of ghosts) g.fright = false;
    }
  } else if (modeTimer !== Infinity) {
    modeTimer -= dt;
    if (modeTimer <= 0) {
      modeIndex++;
      modeTimer = modes[modeIndex] ?? Infinity;
      for (const g of ghosts) if (g.state === 'normal') g.dir = OPP[g.dir];
    }
  }
  updateHouseTimeout(dt);
  if (fruitT > 0) fruitT -= dt;

  updatePac();
  if (state !== 'play') return;      // died / completed inside updatePac
  for (const g of ghosts) updateGhost(g);
  checkCollisions();
}

function loseLife() {
  lives--;
  if (lives <= 0) {
    state = 'gameover'; stateT = 3.2;
    return;
  }
  globalDotMode = true; globalDotCount = 0;
  resetActors();
  state = 'ready'; stateT = 2; readyLong = false;
}

function update(dt) {
  frame++;
  for (const p of popups) p.t -= dt;
  popups = popups.filter(p => p.t > 0);

  switch (state) {
    case 'attract':
      attractT += dt;
      break;
    case 'ready':
      stateT -= dt;
      if (stateT <= 0) state = 'play';
      break;
    case 'play':
      if (!paused) updatePlay(dt);
      break;
    case 'eatpause':
      stateT -= dt;
      if (stateT <= 0) { eatVictim = null; state = 'play'; }
      break;
    case 'dying':
      stateT -= dt;
      if (stateT <= 0) {
        pac.deadT += dt;
        if (pac.deadT === dt) sDeath();
        if (pac.deadT > 1.9) loseLife();
      }
      break;
    case 'complete':
      stateT -= dt;
      if (stateT <= 0) { state = 'flash'; stateT = 2; }
      break;
    case 'flash':
      stateT -= dt;
      if (stateT <= 0) {
        fruitShown.push(fruitIndex(level));
        if (fruitShown.length > 7) fruitShown.shift();
        startLevel(level + 1);
        state = 'ready'; stateT = 2; readyLong = false;
      }
      break;
    case 'gameover':
      stateT -= dt;
      if (stateT <= 0) { state = 'attract'; attractT = 0; }
      break;
  }
  updateEngine();
  setTouchVisible(state !== 'attract' && state !== 'gameover');
}

//////////////////////// DRAWING //////////////////////////////

function font(px) { ctx.font = 'bold ' + px + 'px "Courier New", monospace'; }
function text(str, x, y, color, px = 16, align = 'left') {
  font(px);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawPacShape(x, y, dir, mouth, radius = T * .82) {
  const ang = { [RIGHT]: 0, [DOWN]: Math.PI / 2, [LEFT]: Math.PI, [UP]: -Math.PI / 2, [STOP]: 0 }[dir];
  ctx.fillStyle = COL_PAC;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, radius, ang + mouth, ang - mouth + Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

function drawPac() {
  const mouth = 0.12 + 0.38 * Math.abs(Math.sin(pac.anim));
  drawPacShape(pac.x, pac.y, pac.dir === STOP ? LEFT : pac.dir, mouth * Math.PI * .55 + .05);
}

function drawPacDeath(t) {
  // mouth opens all the way around, facing up, then a small pop
  const dur = 1.5;
  const k = Math.min(1, t / dur);
  if (k < 1) {
    const a = .1 + k * (Math.PI - .12);
    ctx.fillStyle = COL_PAC;
    ctx.beginPath();
    ctx.moveTo(pac.x, pac.y);
    ctx.arc(pac.x, pac.y, T * .82, -Math.PI / 2 + a, -Math.PI / 2 - a + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  } else if (t < dur + .35) {
    ctx.strokeStyle = COL_PAC; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + .4;
      ctx.beginPath();
      ctx.moveTo(pac.x + Math.cos(a) * 4, pac.y + Math.sin(a) * 4);
      ctx.lineTo(pac.x + Math.cos(a) * 9, pac.y + Math.sin(a) * 9);
      ctx.stroke();
    }
  }
}

function drawGhost(g) {
  const x = g.x, y = g.y;
  const wobble = Math.floor(frame / 8) % 2;
  const flashing = g.fright && frightT < fright.flashes * .45 && Math.floor(frightT * 4.5) % 2 === 0;
  const rw = T * .85;

  if (g.state !== 'eyes' && g.state !== 'enter') {
    ctx.fillStyle = g.fright ? (flashing ? '#f8f8ff' : COL_FRIGHT) : g.color;
    ctx.beginPath();
    ctx.arc(x, y - 1, rw, Math.PI, 0);
    ctx.lineTo(x + rw, y + rw - 2);
    // wavy skirt
    const n = 4, seg = (rw * 2) / n;
    for (let i = 0; i < n; i++) {
      const sx = x + rw - i * seg;
      const dip = (i % 2 === wobble) ? 3.5 : 0;
      ctx.lineTo(sx - seg / 2, y + rw - 2 - 4 + dip);
      ctx.lineTo(sx - seg, y + rw - 2);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (g.fright && g.state !== 'eyes' && g.state !== 'enter') {
    // frightened face
    const fc = flashing ? '#ff3030' : '#ffb8ae';
    ctx.fillStyle = fc;
    ctx.fillRect(x - 5, y - 4, 3, 3);
    ctx.fillRect(x + 2, y - 4, 3, 3);
    ctx.strokeStyle = fc; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const zx = x - 6 + i * 2, zy = y + 4 + ((i % 2) ? -2 : 1);
      i ? ctx.lineTo(zx, zy) : ctx.moveTo(zx, zy);
    }
    ctx.stroke();
  } else {
    // eyes (also drawn alone for the 'eyes'/'enter' states)
    const d = DIRS[g.dir], ex = d.x * 2, ey = d.y * 2;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x + s * 4.5 + ex, y - 3 + ey, 3.4, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2121de';
      ctx.beginPath();
      ctx.arc(x + s * 4.5 + ex * 1.9, y - 3 + ey * 1.9, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFruit(idx, x, y, small = false) {
  ctx.save();
  ctx.translate(x, y);
  if (small) ctx.scale(.8, .8);
  const name = FRUITS[idx].name;
  ctx.lineWidth = 1.6;
  if (name === 'cherry') {
    ctx.strokeStyle = '#21a921';
    ctx.beginPath(); ctx.moveTo(-3, 3); ctx.quadraticCurveTo(-1, -7, 6, -7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 2); ctx.quadraticCurveTo(5, -4, 6, -7); ctx.stroke();
    ctx.fillStyle = '#ff2020';
    ctx.beginPath(); ctx.arc(-3, 4, 3.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(4, 3, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff9c9c';
    ctx.fillRect(-4.6, 2.4, 1.5, 1.5); ctx.fillRect(2.4, 1.4, 1.5, 1.5);
  } else if (name === 'strawberry') {
    ctx.fillStyle = '#ff2020';
    ctx.beginPath();
    ctx.moveTo(-6, -2); ctx.quadraticCurveTo(-6, 6, 0, 8);
    ctx.quadraticCurveTo(6, 6, 6, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#21c921';
    ctx.beginPath();
    ctx.moveTo(-6, -2); ctx.lineTo(6, -2); ctx.lineTo(3, -4); ctx.lineTo(0, -3);
    ctx.lineTo(-3, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (const [px2, py2] of [[-3, 1], [0, 3], [3, 0], [-1, 5], [2, 4]])
      ctx.fillRect(px2, py2, 1.3, 1.3);
  } else if (name === 'orange') {
    ctx.fillStyle = '#ff9c20';
    ctx.beginPath(); ctx.arc(0, 2, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#21a921';
    ctx.beginPath(); ctx.ellipse(2, -4.5, 3.4, 2, .5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8b5a00';
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, -6); ctx.stroke();
  } else if (name === 'apple') {
    ctx.fillStyle = '#e02020';
    ctx.beginPath();
    ctx.arc(-2.6, 1.5, 4.6, 0, 7); ctx.arc(2.6, 1.5, 4.6, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#8b5a00';
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(1, -6, 3, -7); ctx.stroke();
    ctx.fillStyle = '#21a921';
    ctx.beginPath(); ctx.ellipse(4, -5, 2.6, 1.5, .6, 0, 7); ctx.fill();
  } else if (name === 'melon') {
    ctx.fillStyle = '#2fbf3f';
    ctx.beginPath(); ctx.arc(0, 1, 6.4, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1a7a26'; ctx.lineWidth = 1.2;
    for (const dx of [-4, -1.3, 1.3, 4]) {
      ctx.beginPath(); ctx.moveTo(dx, -4.5); ctx.quadraticCurveTo(dx * 1.3, 1, dx, 6.5); ctx.stroke();
    }
    ctx.strokeStyle = '#8b5a00';
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, -8); ctx.stroke();
  } else if (name === 'rocket') {
    ctx.fillStyle = '#d8d8ff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(3.4, 0); ctx.lineTo(3.4, 5); ctx.lineTo(-3.4, 5);
    ctx.lineTo(-3.4, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff3030';
    ctx.beginPath(); ctx.moveTo(-3.4, 5); ctx.lineTo(-6.5, 8); ctx.lineTo(-3.4, 8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3.4, 5); ctx.lineTo(6.5, 8); ctx.lineTo(3.4, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2121de';
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffb820';
    ctx.beginPath(); ctx.moveTo(-2, 8); ctx.lineTo(0, 11.5); ctx.lineTo(2, 8); ctx.closePath(); ctx.fill();
  } else if (name === 'bell') {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(-6, 6); ctx.quadraticCurveTo(-6, -7, 0, -7);
    ctx.quadraticCurveTo(6, -7, 6, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4fc3ff';
    ctx.fillRect(-6, 6, 12, 2.4);
    ctx.fillStyle = '#fff'; ctx.fillRect(1.4, 6, 3, 2.4);
  } else { // key
    ctx.fillStyle = '#4fc3ff';
    ctx.beginPath(); ctx.arc(0, -4.5, 3.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, -4.8, 1.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#4fc3ff';
    ctx.fillRect(-1.2, -2, 2.4, 9);
    ctx.fillRect(0, 3, 3.4, 1.6); ctx.fillRect(0, 5.6, 2.6, 1.6);
  }
  ctx.restore();
}

function drawDots() {
  ctx.fillStyle = COL_DOT;
  const blinkOn = Math.floor(frame / 10) % 2 === 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = dots[r][c];
    if (!d) continue;
    const x = c * T + T / 2, y = r * T + T / 2 + YOFF;
    if (d === '.') ctx.fillRect(x - 2, y - 2, 4, 4);
    else if (blinkOn || state !== 'play') {
      ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.fill();
    }
  }
}

function drawHUD() {
  const blink = Math.floor(frame / 16) % 2 === 0;
  if (blink || state === 'attract') text('1UP', 3 * T, T * .55, COL_TEXT, 15, 'left');
  text('HIGH SCORE', W / 2, T * .55, COL_TEXT, 15, 'center');
  text(String(score || (state === 'attract' ? 0 : score)).padStart(2, '0'), 6.5 * T, T * 1.55, COL_TEXT, 15, 'right');
  text(String(high).padStart(2, '0'), W / 2 + 2.5 * T, T * 1.55, COL_TEXT, 15, 'right');

  if (state === 'attract') return;
  // lives (bottom left)
  for (let i = 0; i < lives - 1 && i < 5; i++)
    drawPacShape(2.5 * T + i * 1.8 * T, H - T, LEFT, .55);
  // fruit history (bottom right)
  const hist = fruitShown.concat([fruitIndex(level)]).slice(-7);
  hist.forEach((f, i) =>
    drawFruit(f, W - 2 * T - (hist.length - 1 - i) * 1.9 * T, H - T));
}

function drawMazeLayer() {
  const img = (state === 'flash' && Math.floor(stateT * 3.8) % 2 === 0) ? mazeImgWhite : mazeImg;
  ctx.drawImage(img, 0, YOFF, W, ROWS * T);
}

function drawPopups() {
  for (const p of popups)
    text(p.text, p.x, p.y, p.color, 12, 'center');
}

function drawReadyTexts() {
  if (state === 'ready') {
    if (readyLong && stateT > 2)
      text('PLAYER ONE', W / 2, 11 * T + T / 2 + YOFF, '#4fc3ff', 16, 'center');
    text('READY!', W / 2, 17 * T + T / 2 + YOFF, COL_PAC, 17, 'center');
  }
  if (state === 'gameover')
    text('GAME  OVER', W / 2, 17 * T + T / 2 + YOFF, '#ff3030', 17, 'center');
  if (paused && state === 'play')
    text('PAUSED', W / 2, 17 * T + T / 2 + YOFF, '#4fc3ff', 17, 'center');
}

function drawAttract() {
  text('PACMAN', W / 2, 4.2 * T, COL_PAC, 44, 'center');
  text('R E D U X', W / 2, 6.4 * T, '#4fc3ff', 18, 'center');

  text('CHARACTER / NICKNAME', W / 2, 9.2 * T, COL_TEXT, 14, 'center');
  const roster = [
    [blinky, 'SHADOW', '"BLINKY"'],
    [pinky, 'SPEEDY', '"PINKY"'],
    [inky, 'BASHFUL', '"INKY"'],
    [clyde, 'POKEY', '"CLYDE"']
  ];
  roster.forEach(([g, n1, n2], i) => {
    const y = (11 + i * 2.1) * T;
    const gx = 7 * T;
    const fake = { x: gx, y, dir: RIGHT, state: 'normal', fright: false, color: g.color, name: g.name };
    drawGhost(fake);
    text(n1, 9.5 * T, y, g.color, 14, 'left');
    text(n2, 16.5 * T, y, g.color, 14, 'left');
  });

  // point values
  const py = 20.6 * T;
  ctx.fillStyle = COL_DOT;
  ctx.fillRect(9 * T - 2, py - 2, 4, 4);
  text('10 PTS', 10 * T, py, COL_TEXT, 13, 'left');
  ctx.beginPath(); ctx.fillStyle = COL_DOT; ctx.arc(15.5 * T, py, 6, 0, 7); ctx.fill();
  text('50 PTS', 16.5 * T, py, COL_TEXT, 13, 'left');

  // little chase loop
  const cy = 23.5 * T;
  const cx = ((attractT * 90) % (W + 260)) - 130;
  const frightened = Math.floor(attractT * 90 / (W + 260)) % 2 === 1;
  if (!frightened) {
    drawPacShape(cx, cy, RIGHT, .5 + .3 * Math.sin(attractT * 18));
    ghosts.forEach((g, i) => {
      const fake = { x: cx - 30 - i * 24, y: cy, dir: RIGHT, state: 'normal', fright: false, color: g.color };
      drawGhost(fake);
    });
  } else {
    const px2 = W - cx;
    drawPacShape(px2, cy, LEFT, .5 + .3 * Math.sin(attractT * 18));
    ghosts.forEach((g, i) => {
      const fake = { x: px2 + 30 + i * 24, y: cy, dir: LEFT, state: 'normal', fright: true, color: g.color };
      drawGhost(fake);
    });
  }

  const bl = Math.floor(attractT * 2) % 2 === 0;
  if (bl) text(TOUCH_DEVICE ? 'TAP TO START' : 'PRESS ENTER TO START', W / 2, 27 * T, COL_PAC, 17, 'center');
  text(TOUCH_DEVICE ? 'JOYSTICK OR SWIPE TO MOVE' : 'ARROWS / WASD MOVE · P PAUSE · M MUTE',
    W / 2, 29 * T, '#888', TOUCH_DEVICE ? 13 : 12, 'center');
  text('HIGH SCORE ' + high, W / 2, 31.5 * T, COL_TEXT, 14, 'center');
}

function draw() {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (state === 'attract') {
    drawAttract();
    drawHUD();
    return;
  }

  drawMazeLayer();
  if (state !== 'flash') drawDots();

  if (fruitT > 0) drawFruit(fruitIndex(level), FRUIT_X, FRUIT_Y);

  // ghosts
  const hideGhosts = state === 'flash' || state === 'complete' ||
    (state === 'dying' && stateT <= 0);
  if (!hideGhosts) {
    for (const g of ghosts) {
      if (eatVictim && eatVictim.g === g) continue;   // replaced by score popup
      drawGhost(g);
    }
  }
  if (eatVictim)
    text(String(eatVictim.pts), eatVictim.g.x, eatVictim.g.y, '#4fc3ff', 13, 'center');

  // pac
  if (state === 'dying') {
    if (stateT > 0) drawPac();
    else drawPacDeath(pac.deadT);
  } else if (state !== 'eatpause' && state !== 'gameover') {
    drawPac();
  }

  drawPopups();
  drawReadyTexts();
  drawHUD();
}

//////////////////////// MAIN LOOP ////////////////////////////

let lastTime = performance.now(), acc = 0;
const STEP = 1 / 60;

function loop(now) {
  requestAnimationFrame(loop);
  acc += Math.min(.1, (now - lastTime) / 1000);
  lastTime = now;
  let steps = 0;
  while (acc >= STEP && ++steps <= 5) {
    update(STEP);
    acc -= STEP;
  }
  if (steps > 5) acc = 0;
  draw();
}

resetDots();
console.log('PACMAN REDUX — dots in maze:', dotsTotal);
requestAnimationFrame(loop);
