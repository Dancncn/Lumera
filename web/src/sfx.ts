// Web Audio API 合成音效 —— 零资源加载，纯代码生成。
// 所有音色从正弦/方波/锯齿波 + 白噪声合成，风格：克制、古典、低调。

const LS_KEY = 'lumera-sfx';

let ctx: AudioContext | null = null;
let _enabled: boolean = (() => {
  try { return localStorage.getItem(LS_KEY) !== '0'; } catch { return true; }
})();

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) {
  if (!_enabled) return;
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

function noise(dur: number, vol = 0.05) {
  if (!_enabled) return;
  const c = ac();
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  draw() {
    noise(0.06, 0.04);
    tone(360, 0.08, 'sine', 0.05);
    setTimeout(() => tone(480, 0.06, 'sine', 0.03), 50);
  },
  cardPlay() {
    tone(800, 0.07, 'square', 0.05);
    setTimeout(() => tone(1100, 0.05, 'square', 0.03), 25);
  },
  challenge() {
    tone(440, 0.14, 'sawtooth', 0.09);
    setTimeout(() => tone(580, 0.18, 'sawtooth', 0.07), 90);
  },
  reveal() {
    noise(0.1, 0.07);
    tone(660, 0.14, 'sine', 0.06);
  },
  diceRoll() {
    for (let i = 0; i < 5; i++)
      setTimeout(() => tone(280 + Math.random() * 360, 0.035, 'square', 0.035), i * 45);
  },
  diceHit() {
    tone(130, 0.35, 'sine', 0.18);
    setTimeout(() => tone(80, 0.3, 'sine', 0.14), 90);
  },
  diceMiss() {
    tone(420, 0.1, 'sine', 0.07);
    setTimeout(() => tone(620, 0.08, 'sine', 0.05), 70);
  },
  lifeDown() {
    tone(280, 0.18, 'sawtooth', 0.1);
    setTimeout(() => tone(180, 0.25, 'sawtooth', 0.08), 130);
    setTimeout(() => tone(110, 0.35, 'sine', 0.12), 260);
  },
  playerOut() {
    tone(100, 0.5, 'sine', 0.15);
    setTimeout(() => tone(65, 0.45, 'sine', 0.1), 180);
  },
  skip() {
    tone(520, 0.05, 'square', 0.05);
    setTimeout(() => tone(400, 0.07, 'square', 0.04), 70);
  },
  yourTurn() {
    tone(523, 0.1, 'sine', 0.09);
    setTimeout(() => tone(659, 0.1, 'sine', 0.07), 90);
    setTimeout(() => tone(784, 0.12, 'sine', 0.05), 180);
  },
  runOut() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => tone(f, 0.13, 'sine', 0.07), i * 70));
  },
  weatherChange() {
    // 天气降临：低沉的风声 + 渐升和弦，营造氛围骤变感
    noise(0.25, 0.06);
    tone(220, 0.3, 'sine', 0.06);
    setTimeout(() => tone(330, 0.25, 'sine', 0.07), 150);
    setTimeout(() => tone(440, 0.3, 'sine', 0.08), 300);
    setTimeout(() => noise(0.15, 0.03), 350);
  },
  weatherTrigger() {
    // 持续天气触发（禁制/转向）：短促的低频脉冲
    tone(300, 0.08, 'square', 0.04);
    setTimeout(() => tone(260, 0.1, 'square', 0.03), 60);
  },
  weatherBonus() {
    // 恩泽奖励：明亮的上行琶音
    tone(587, 0.1, 'sine', 0.08);
    setTimeout(() => tone(740, 0.1, 'sine', 0.07), 80);
    setTimeout(() => tone(880, 0.14, 'sine', 0.06), 160);
  },
  gameOver() {
    tone(262, 0.35, 'sine', 0.1);
    setTimeout(() => tone(330, 0.4, 'sine', 0.08), 260);
  },

  get enabled() { return _enabled; },
  toggle() {
    _enabled = !_enabled;
    try { localStorage.setItem(LS_KEY, _enabled ? '1' : '0'); } catch {}
    return _enabled;
  },
};
