import { useEffect, useRef } from 'react';

// 流动的波普：半调点流星（亮头 + 渐隐尾）。移植自 astro-blog 的 MeteorShower。
// 参数化：dir=1 下落（桌面背景），dir=-1 上涌（主页两侧逆向河）。画布按自身尺寸绘制。
export function MeteorShower({
  density = 0.5,
  dir = 1,
  className = 'meteor-layer',
}: {
  density?: number;
  dir?: 1 | -1;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const d = Math.max(0.1, density);
    const maxMeteors = Math.max(3, Math.round(9 * d));
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      width = Math.max(1, r.width);
      height = Math.max(1, r.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    type M = {
      x: number; y: number; dx: number; dy: number; speed: number;
      trail: number; jitter: { x: number; y: number }[]; spacing: number;
      size: number; blue: boolean; fadeAt: number; alpha: number;
    };
    const meteors: M[] = [];

    const spawn = () => {
      // dir=1 朝下（π/2 附近）；dir=-1 朝上（-π/2 附近）
      const base = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      const angle = base + (Math.random() * 0.4 - 0.2);
      const trail = 5 + Math.floor(Math.random() * 4);
      const jitter = Array.from({ length: trail }, () => ({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 }));
      meteors.push({
        x: width * (0.1 + Math.random() * 0.8),
        y: dir === 1 ? -24 : height + 24,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        speed: 130 + Math.random() * 180,
        trail,
        jitter,
        spacing: 9 + Math.random() * 5,
        size: 1.5 + Math.random() * 1.1,
        blue: Math.random() < 0.14,
        fadeAt: dir === 1 ? height * (0.5 + Math.random() * 0.4) : height * (0.1 + Math.random() * 0.4),
        alpha: 1,
      });
    };

    let lastTime = 0;
    let spawnTimer = 0;
    let nextSpawn = 400;
    let rafId = 0;

    const step = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      spawnTimer += dt * 1000;
      if (spawnTimer >= nextSpawn) {
        spawnTimer = 0;
        nextSpawn = (560 + Math.random() * 1400) / d;
        if (meteors.length < maxMeteors) spawn();
      }
      const goldRgb = '170, 118, 32';
      const blueRgb = '76, 119, 168';
      ctx.clearRect(0, 0, width, height);
      for (let m = meteors.length - 1; m >= 0; m--) {
        const meteor = meteors[m];
        meteor.x += meteor.dx * meteor.speed * dt;
        meteor.y += meteor.dy * meteor.speed * dt;
        const past = dir === 1 ? meteor.y > meteor.fadeAt : meteor.y < meteor.fadeAt;
        if (past) meteor.alpha -= dt * 2.2;
        const gone = dir === 1 ? meteor.y - meteor.trail * meteor.spacing > height + 30 : meteor.y + meteor.trail * meteor.spacing < -30;
        if (meteor.alpha <= 0 || gone) {
          meteors.splice(m, 1);
          continue;
        }
        const rgb = meteor.blue ? blueRgb : goldRgb;
        for (let i = 0; i < meteor.trail; i++) {
          const px = meteor.x - meteor.dx * meteor.spacing * i + meteor.jitter[i].x;
          const py = meteor.y - meteor.dy * meteor.spacing * i + meteor.jitter[i].y;
          const falloff = Math.pow(0.74, i);
          const alpha = meteor.alpha * 0.5 * falloff;
          const radius = meteor.size * (i === 0 ? 1.18 : Math.pow(0.88, i));
          if (alpha < 0.015) continue;
          ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
          if (i === 0) {
            ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.22})`;
            ctx.beginPath();
            ctx.arc(px, py, radius * 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      rafId = requestAnimationFrame(step);
    };

    let running = false;
    const start = () => {
      if (running) return;
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        resize();
      });
    };

    resize();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    return () => {
      stop();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, [density, dir, className]);

  return <canvas ref={ref} className={className} aria-hidden />;
}

/**
 * 主页两侧「流动的波普河」：密布的半调点阵随波竖向流动，每点持续明暗振动闪烁，
 * 左侧上行、右侧下行（对向）。不是稀疏星点，而是一整条在流的光河。
 */
function FlowRiver({ side }: { side: 'left' | 'right' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const dir = side === 'left' ? -1 : 1; // 左上行 / 右下行 —— 对向
    const SP = 16; // 半调点间距（越小越密）
    const hash = (a: number, b: number) => {
      const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const mod = (n: number, m: number) => ((n % m) + m) % m;

    let raf = 0;
    let t0 = 0;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / SP) + 1;
      const rows = Math.ceil(h / SP) + 2;
      const period = rows * SP;
      const flow = t * 34; // 流速
      for (let c = 0; c < cols; c++) {
        const cx = c * SP + (c % 2) * (SP / 2); // 错列排布，半调更自然
        if (cx > w) continue;
        const edge = side === 'left' ? 1 - cx / w : cx / w; // 向内侧渐隐，给标题让位
        const ef = Math.max(0, Math.min(1, edge * 1.15));
        if (ef <= 0.02) continue;
        for (let r = 0; r < rows; r++) {
          const ph = hash(c, r);
          const y = mod(r * SP + dir * flow, period) - SP;
          if (y < -SP || y > h + SP) continue;
          const shimmer = 0.5 + 0.5 * Math.sin(t * 2.3 + ph * 6.283 + r * 0.5 + c * 0.35); // 随波明暗带
          const flick = 0.62 + 0.38 * Math.sin(t * 7.6 + ph * 50); // 快速闪动
          const a = (0.08 + 0.5 * shimmer) * flick * ef;
          if (a < 0.02) continue;
          const rad = 1.0 + 1.8 * shimmer;
          const jx = Math.sin(t * 5 + ph * 6.283) * 1.2; // 微振动
          const jy = Math.cos(t * 4.3 + ph * 5.1) * 1.0;
          ctx.fillStyle = ph > 0.92 ? `rgba(76, 119, 168, ${a})` : `rgba(170, 118, 32, ${a})`;
          ctx.beginPath();
          ctx.arc(cx + jx, y + jy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(step);
    };

    let running = false;
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVis = () => (document.hidden ? stop() : start());
    let rr = 0;
    const onResize = () => {
      if (rr) return;
      rr = requestAnimationFrame(() => {
        rr = 0;
        resize();
      });
    };

    start();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);
    return () => {
      stop();
      if (rr) cancelAnimationFrame(rr);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
    };
  }, [side]);

  return <canvas ref={ref} className={`river river-${side}`} aria-hidden />;
}

export function SideRivers() {
  return (
    <>
      <FlowRiver side="left" />
      <FlowRiver side="right" />
    </>
  );
}
