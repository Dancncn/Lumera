// 轻量遥测：心跳让「当前在线」把本机也算上；本地对局上报让单机局也计入「对局」。
// 生产同源经 nginx 命中 Node 的 /beat、/game；dev（vite）无端点，静默失败即可。

function sid(): string {
  try {
    const k = 'lumera_sid';
    let s = sessionStorage.getItem(k);
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(k, s);
    }
    return s;
  } catch {
    return 'anon';
  }
}

let started = false;
export function startHeartbeat(): void {
  if (started) return;
  started = true;
  const beat = () => {
    fetch(`/beat?s=${encodeURIComponent(sid())}`, { cache: 'no-store' }).catch(() => undefined);
  };
  beat();
  setInterval(beat, 15000);
}

export function reportLocalGame(): void {
  fetch(`/game?s=${encodeURIComponent(sid())}`, { method: 'POST', cache: 'no-store' }).catch(() => undefined);
}
