const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 420;
canvas.height = 680;

// ── Audio ─────────────────────────────────────────────────────────

let audioCtx = null;
let masterGain = null;
let engineOsc1 = null;
let engineOsc2 = null;
let engineGainNode = null;
let musicBar = 0;
let nextBarTime = 0;
let musicScheduler = null;

const BPM = 128;
const BEAT = 60 / BPM;
const BAR  = BEAT * 4;

// Note frequencies
const NOTE = {
  E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.00, A3: 220.00,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
  B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99
};

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.55;
  masterGain.connect(audioCtx.destination);
  buildEngine();
  nextBarTime = audioCtx.currentTime + 0.05;
  scheduleMusic();
}

// ── Engine sound ──────────────────────────────────────────────────

function buildEngine() {
  // Distortion waveshaper for gritty engine texture
  const dist = audioCtx.createWaveShaper();
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = (Math.PI + 120) * x / (Math.PI + 120 * Math.abs(x));
  }
  dist.curve = curve;

  const filt = audioCtx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 600;

  engineGainNode = audioCtx.createGain();
  engineGainNode.gain.value = 0;

  engineOsc1 = audioCtx.createOscillator();
  engineOsc2 = audioCtx.createOscillator();
  engineOsc1.type = 'sawtooth';
  engineOsc2.type = 'square';
  engineOsc1.frequency.value = 80;
  engineOsc2.frequency.value = 40;

  engineOsc1.connect(dist);
  engineOsc2.connect(dist);
  dist.connect(filt);
  filt.connect(engineGainNode);
  engineGainNode.connect(masterGain);
  engineOsc1.start();
  engineOsc2.start();
}

function updateEngineSound(speed, accelerating) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const freq = 55 + speed * 20;
  engineOsc1.frequency.linearRampToValueAtTime(freq,     t + 0.08);
  engineOsc2.frequency.linearRampToValueAtTime(freq / 2, t + 0.08);
  const vol = accelerating ? 0.35 : 0.06;
  engineGainNode.gain.linearRampToValueAtTime(vol, t + 0.1);
}

// ── Background music ──────────────────────────────────────────────

function tone(freq, start, dur, type = 'square', vol = 0.14) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.setValueAtTime(vol, start + dur * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(start);
  osc.stop(start + dur);
}

function kick(t) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.4);
  gain.gain.setValueAtTime(0.9, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(t); osc.stop(t + 0.4);
}

function snare(t) {
  const buf  = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.12, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  const filt = audioCtx.createBiquadFilter();
  filt.type = 'highpass'; filt.frequency.value = 1200;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.38, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(filt); filt.connect(gain); gain.connect(masterGain);
  src.start(t);
}

function hihat(t, vol = 0.09) {
  const buf  = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.04, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  const filt = audioCtx.createBiquadFilter();
  filt.type = 'highpass'; filt.frequency.value = 8000;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  src.connect(filt); filt.connect(gain); gain.connect(masterGain);
  src.start(t);
}

// 4-bar looping track: Am → F → C → G feel
const TRACK = [
  // bar 0 — Am
  { bass: [[NOTE.A2,0],[NOTE.A2,1],[NOTE.A2,2],[NOTE.A2,3]],
    mel:  [[NOTE.A4,0,0.5],[NOTE.C5,0.5,0.5],[NOTE.E5,1,1],[NOTE.D5,2,0.5],[NOTE.C5,2.5,0.5],[NOTE.A4,3,1]] },
  // bar 1 — F
  { bass: [[NOTE.F2,0],[NOTE.F2,1],[NOTE.G2,2],[NOTE.G2,3]],
    mel:  [[NOTE.C5,0,0.5],[NOTE.D5,0.5,0.5],[NOTE.E5,1,1],[NOTE.D5,2,0.5],[NOTE.C5,2.5,0.5],[NOTE.B4,3,1]] },
  // bar 2 — C
  { bass: [[NOTE.C3,0],[NOTE.C3,1],[NOTE.E2,2],[NOTE.E2,3]],
    mel:  [[NOTE.G4,0,0.5],[NOTE.A4,0.5,0.5],[NOTE.C5,1,1],[NOTE.B4,2,0.5],[NOTE.A4,2.5,0.5],[NOTE.G4,3,1]] },
  // bar 3 — G (builds back to Am)
  { bass: [[NOTE.G2,0],[NOTE.G2,1],[NOTE.A2,2],[NOTE.A2,3]],
    mel:  [[NOTE.D5,0,0.5],[NOTE.E5,0.5,0.5],[NOTE.G5,1,1],[NOTE.E5,2,0.5],[NOTE.D5,2.5,0.5],[NOTE.E5,3,1]] },
];

function scheduleBar() {
  const bar  = TRACK[musicBar % TRACK.length];
  const t0   = nextBarTime;

  // Drums
  kick(t0);               kick(t0 + BEAT * 2);
  snare(t0 + BEAT);       snare(t0 + BEAT * 3);
  for (let i = 0; i < 8; i++) hihat(t0 + i * BEAT * 0.5);

  // Bass (sawtooth)
  bar.bass.forEach(([freq, beat]) =>
    tone(freq, t0 + beat * BEAT, BEAT * 0.85, 'sawtooth', 0.22));

  // Melody (square — chiptune feel)
  bar.mel.forEach(([freq, beat, dur]) =>
    tone(freq, t0 + beat * BEAT, dur * BEAT * 0.88, 'square', 0.11));

  nextBarTime += BAR;
  musicBar++;
}

function scheduleMusic() {
  if (!audioCtx) return;
  // Keep ~2 bars ahead so there are no gaps
  while (nextBarTime < audioCtx.currentTime + BAR * 2) scheduleBar();
  musicScheduler = setTimeout(scheduleMusic, (BAR * 1000) / 2);
}

function stopMusic() {
  clearTimeout(musicScheduler);
  musicScheduler = null;
}

// Road bounds
const ROAD_LEFT = 60;
const ROAD_RIGHT = 360;
const ROAD_W = ROAD_RIGHT - ROAD_LEFT;
const LANE_W = ROAD_W / 3;

// Player
const player = {
  x: canvas.width / 2,
  y: canvas.height - 130,
  w: 44,
  h: 76,
};

// State
let state = 'title'; // 'title' | 'playing' | 'dead'
let score = 0;
let kmh = 80;
let gameSpeed = 3;
let stripeY = 0;
let obstacles = [];
let spawnTimer = 0;
let spawnInterval = 85;
let hiScore = 0;
let frameCount = 0;

// Particles for crash
let particles = [];

const keys = {};
function unlockAudio() {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

document.addEventListener('keydown', e => {
  keys[e.key] = true;
  e.preventDefault();
  unlockAudio();
});

canvas.addEventListener('click', () => unlockAudio());
document.addEventListener('keyup', e => { keys[e.key] = false; });

// ── Drawing helpers ───────────────────────────────────────────────

function drawRoad() {
  // Grass
  ctx.fillStyle = '#2d5a1b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Road surface
  ctx.fillStyle = '#444';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, canvas.height);

  // Road edge lines
  ctx.fillStyle = '#fff';
  ctx.fillRect(ROAD_LEFT, 0, 5, canvas.height);
  ctx.fillRect(ROAD_RIGHT - 5, 0, 5, canvas.height);

  // Scrolling lane dashes
  ctx.setLineDash([40, 35]);
  ctx.lineDashOffset = -stripeY;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 3; i++) {
    const x = ROAD_LEFT + LANE_W * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Grass side markings (rumble strips)
  ctx.fillStyle = '#e8c84b';
  const stripH = 30;
  for (let y = (stripeY % (stripH * 2)) - stripH * 2; y < canvas.height; y += stripH * 2) {
    ctx.fillRect(ROAD_LEFT - 20, y, 15, stripH);
    ctx.fillRect(ROAD_RIGHT + 5, y, 15, stripH);
  }
}

function drawPlayerCar(x, y) {
  const w = player.w, h = player.h;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + h / 2 + 4, w / 2 - 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wheels
  ctx.fillStyle = '#111';
  ctx.fillRect(x - w / 2 - 7, y - h / 2 + 10, 9, 18);
  ctx.fillRect(x + w / 2 - 2, y - h / 2 + 10, 9, 18);
  ctx.fillRect(x - w / 2 - 7, y + h / 2 - 28, 9, 18);
  ctx.fillRect(x + w / 2 - 2, y + h / 2 - 28, 9, 18);

  // Wheel rims
  ctx.fillStyle = '#888';
  ctx.fillRect(x - w / 2 - 5, y - h / 2 + 13, 5, 12);
  ctx.fillRect(x + w / 2, y - h / 2 + 13, 5, 12);
  ctx.fillRect(x - w / 2 - 5, y + h / 2 - 25, 5, 12);
  ctx.fillRect(x + w / 2, y + h / 2 - 25, 5, 12);

  // Body
  ctx.fillStyle = '#e63946';
  roundRect(x - w / 2, y - h / 2, w, h, 8);
  ctx.fill();

  // Roof
  ctx.fillStyle = '#c1121f';
  roundRect(x - w / 2 + 6, y - h / 2 + 18, w - 12, h / 2.5, 5);
  ctx.fill();

  // Windshield (front)
  ctx.fillStyle = '#aee8ff';
  ctx.globalAlpha = 0.85;
  roundRect(x - w / 2 + 8, y - h / 2 + 10, w - 16, 20, 4);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Rear window
  ctx.fillStyle = '#aee8ff';
  ctx.globalAlpha = 0.75;
  roundRect(x - w / 2 + 8, y - h / 2 + 44, w - 16, 14, 3);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Headlights
  ctx.fillStyle = '#ffffa0';
  ctx.fillRect(x - w / 2 + 5, y - h / 2, 10, 5);
  ctx.fillRect(x + w / 2 - 15, y - h / 2, 10, 5);

  // Taillights
  ctx.fillStyle = '#ff2020';
  ctx.fillRect(x - w / 2 + 5, y + h / 2 - 5, 10, 5);
  ctx.fillRect(x + w / 2 - 15, y + h / 2 - 5, 10, 5);

  // Exhaust flame when accelerating
  if (keys['ArrowUp']) {
    ctx.fillStyle = `rgba(255,${100 + Math.random() * 100},0,0.9)`;
    const fh = 10 + Math.random() * 14;
    ctx.beginPath();
    ctx.ellipse(x - 8, y + h / 2 + fh / 2, 5, fh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 8, y + h / 2 + fh / 2, 5, fh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawObstacleCar(obs) {
  const w = obs.w, h = obs.h, x = obs.x, y = obs.y;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + h / 2 + 4, w / 2 - 2, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wheels
  ctx.fillStyle = '#111';
  ctx.fillRect(x - w / 2 - 7, y - h / 2 + 10, 9, 18);
  ctx.fillRect(x + w / 2 - 2, y - h / 2 + 10, 9, 18);
  ctx.fillRect(x - w / 2 - 7, y + h / 2 - 28, 9, 18);
  ctx.fillRect(x + w / 2 - 2, y + h / 2 - 28, 9, 18);

  // Body
  ctx.fillStyle = obs.color;
  roundRect(x - w / 2, y - h / 2, w, h, 8);
  ctx.fill();

  // Roof
  ctx.fillStyle = darken(obs.color);
  roundRect(x - w / 2 + 6, y - h / 2 + 18, w - 12, h / 2.5, 5);
  ctx.fill();

  // Windshield (bottom since car faces player)
  ctx.fillStyle = '#aee8ff';
  ctx.globalAlpha = 0.8;
  roundRect(x - w / 2 + 8, y + h / 2 - 30, w - 16, 20, 4);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Taillights facing player (red at bottom)
  ctx.fillStyle = '#ff2020';
  ctx.fillRect(x - w / 2 + 5, y + h / 2 - 5, 10, 5);
  ctx.fillRect(x + w / 2 - 15, y + h / 2 - 5, 10, 5);
}

function drawHUD() {
  // Speed box
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(12, 12, 120, 70, 10);
  ctx.fill();

  ctx.fillStyle = kmh > 180 ? '#ff4444' : '#00ff99';
  ctx.font = 'bold 34px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(Math.round(kmh), 22, 58);

  ctx.fillStyle = '#aaa';
  ctx.font = '13px monospace';
  ctx.fillText('km/h', 78, 58);

  // Speed label
  ctx.fillStyle = '#666';
  ctx.font = '11px monospace';
  ctx.fillText('SPEED', 22, 74);

  // Score box
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(canvas.width - 132, 12, 120, 70, 10);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('SCORE', canvas.width - 22, 30);
  ctx.font = 'bold 26px monospace';
  ctx.fillText(Math.floor(score), canvas.width - 22, 62);

  // Hi-score
  ctx.fillStyle = '#555';
  ctx.font = '10px monospace';
  ctx.fillText(`BEST ${Math.floor(hiScore)}`, canvas.width - 22, 76);

  // Controls reminder (fades after 5 sec)
  if (frameCount < 300) {
    const alpha = frameCount < 240 ? 1 : (300 - frameCount) / 60;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('← → DODGE   ↑ ACCELERATE', canvas.width / 2, canvas.height - 15);
    ctx.globalAlpha = 1;
  }
}

function drawTitleScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e63946';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText('THE CAR', canvas.width / 2, canvas.height / 2 - 80);
  ctx.fillText('GAME', canvas.width / 2, canvas.height / 2 - 26);

  // Underline
  ctx.fillStyle = '#e63946';
  ctx.fillRect(canvas.width / 2 - 100, canvas.height / 2 - 10, 200, 3);

  ctx.fillStyle = '#ccc';
  ctx.font = '15px sans-serif';
  ctx.fillText('← → to dodge obstacles', canvas.width / 2, canvas.height / 2 + 30);
  ctx.fillText('↑ to accelerate', canvas.width / 2, canvas.height / 2 + 55);

  // Blinking start prompt
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#00ff99';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('Press ↑ to Start', canvas.width / 2, canvas.height / 2 + 105);
  }

  // Sound enable hint
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(canvas.width / 2 - 110, canvas.height - 52, 220, 36, 8);
  ctx.fill();
  ctx.fillStyle = '#f4a261';
  ctx.font = '13px sans-serif';
  ctx.fillText('🔊 Click the game to enable sound', canvas.width / 2, canvas.height - 28);
}

function drawDeadScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e63946';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('CRASH!', canvas.width / 2, canvas.height / 2 - 80);

  ctx.fillStyle = '#fff';
  ctx.font = '18px monospace';
  ctx.fillText(`Score: ${Math.floor(score)}`, canvas.width / 2, canvas.height / 2 - 20);

  ctx.fillStyle = '#f4a261';
  ctx.font = '15px monospace';
  ctx.fillText(`Best: ${Math.floor(hiScore)}`, canvas.width / 2, canvas.height / 2 + 15);

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#00ff99';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('Press ↑ to Play Again', canvas.width / 2, canvas.height / 2 + 70);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ── Utilities ─────────────────────────────────────────────────────

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 40);
  const g = Math.max(0, ((n >> 8) & 0xff) - 40);
  const b = Math.max(0, (n & 0xff) - 40);
  return `rgb(${r},${g},${b})`;
}

function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.w / 2 + b.w / 2 - 6) &&
         Math.abs(a.y - b.y) < (a.h / 2 + b.h / 2 - 10);
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * 3);
  const x = ROAD_LEFT + lane * LANE_W + LANE_W / 2;
  const colors = ['#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4', '#ff5722'];
  obstacles.push({
    x,
    y: -80,
    w: 44,
    h: 74,
    color: colors[Math.floor(Math.random() * colors.length)],
  });
}

function spawnCrashParticles(x, y) {
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 3 + Math.random() * 6,
      alpha: 1,
      color: ['#e63946', '#ff9800', '#ffff00', '#fff'][Math.floor(Math.random() * 4)],
    });
  }
}

function resetGame() {
  player.x = canvas.width / 2;
  obstacles = [];
  particles = [];
  score = 0;
  gameSpeed = 3;
  kmh = 80;
  spawnTimer = 0;
  spawnInterval = 85;
  frameCount = 0;
  // Restart music
  nextBarTime = audioCtx ? audioCtx.currentTime + 0.05 : 0;
  musicBar = 0;
  scheduleMusic();
  state = 'playing';
}

// ── Game loop ─────────────────────────────────────────────────────

function update() {
  if (state === 'title') {
    if (keys['ArrowUp']) resetGame();
    return;
  }

  if (state === 'dead') {
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.alpha -= 0.02;
      p.vx *= 0.95; p.vy *= 0.95;
    });
    particles = particles.filter(p => p.alpha > 0);
    if (keys['ArrowUp']) resetGame();
    return;
  }

  frameCount++;

  // Speed: up arrow accelerates, otherwise cruise
  const accelerating = !!keys['ArrowUp'];
  const targetSpeed = accelerating ? 11 : 3.5;
  gameSpeed += (targetSpeed - gameSpeed) * 0.04;
  kmh = Math.round(50 + gameSpeed * 22);
  updateEngineSound(gameSpeed, accelerating);

  // Lateral movement
  const lateralSpeed = 5 + gameSpeed * 0.3;
  if (keys['ArrowLeft'])  player.x -= lateralSpeed;
  if (keys['ArrowRight']) player.x += lateralSpeed;
  player.x = Math.max(ROAD_LEFT + player.w / 2 + 5, Math.min(ROAD_RIGHT - player.w / 2 - 5, player.x));

  // Scroll road
  stripeY += gameSpeed;

  // Spawn obstacles
  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnObstacle();
    spawnTimer = 0;
    spawnInterval = Math.max(38, spawnInterval - 0.4);
  }

  // Move obstacles
  obstacles.forEach(o => o.y += gameSpeed);
  obstacles = obstacles.filter(o => o.y < canvas.height + 100);

  // Collision
  for (const o of obstacles) {
    if (hits(player, o)) {
      spawnCrashParticles(player.x, player.y);
      hiScore = Math.max(hiScore, score);
      updateEngineSound(0, false);
      stopMusic();
      state = 'dead';
      return;
    }
  }

  score += gameSpeed * 0.12;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawRoad();
  obstacles.forEach(o => drawObstacleCar(o));
  if (state !== 'dead') drawPlayerCar(player.x, player.y);
  drawParticles();

  if (state === 'playing') drawHUD();
  if (state === 'title')   drawTitleScreen();
  if (state === 'dead')    { drawHUD(); drawDeadScreen(); }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
