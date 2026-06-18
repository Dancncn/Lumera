import { CSSProperties, useEffect, useRef, useState } from 'react';
import { PlayerView, WEATHER_META } from '../engine/types';
import { useT } from '../i18n';
import { useGame } from '../store/gameStore';

type FxKind = 'out' | 'lifeloss' | 'runout' | 'ladder' | 'weather';
interface Fx {
  id: number;
  kind: FxKind;
  title: string;
  sub: string;
  you: boolean;
}

const DUR: Record<FxKind, number> = { out: 1700, lifeloss: 1400, runout: 1700, ladder: 1000, weather: 1900 };

// 大事件的瞬时特效层：掉命 / 出局（红闪 + 震屏）、跑成（金色祝贺 + 火花）、新梯（光扫）。
export function EventFx({ view }: { view: PlayerView }) {
  const events = useGame((s) => s.lastEvents);
  const { t, tn } = useT();
  const [fx, setFx] = useState<Fx | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const nameOf = (s: number) => tn(view.players[s]?.name ?? `#${s}`);
    const mk = (kind: FxKind, title: string, sub: string, seat: number): Fx => ({
      id: ++seq.current,
      kind,
      title,
      sub,
      you: seat === view.you,
    });
    // 优先级：出局 > 掉命 > 跑成 > 新梯（同一批事件只演最重的一个）
    let pick: Fx | null = null;
    for (const e of events) if (e.type === 'PlayerOut') { pick = mk('out', t('复归于源'), t('{name} 凝聚耗尽 · 退出本局', { name: nameOf(e.seat) }), e.seat); break; }
    if (!pick) for (const e of events) if (e.type === 'Returned') { pick = mk('lifeloss', t('源涌淹没'), t('{name} −1 凝聚 · 剩 {n}', { name: nameOf(e.seat), n: e.livesLeft }), e.seat); break; }
    if (!pick) for (const e of events) if (e.type === 'RanOut') { pick = mk('runout', t('跑成！'), t('{name} 打空手牌 · 独吞整摞牌堆', { name: nameOf(e.seat) }), e.seat); break; }
    // 天气优先于「新梯」横幅：同批事件里若降了天气，展示天气而非普通新梯
    if (!pick) for (const e of events) if (e.type === 'WeatherChanged') { pick = mk('weather', t('天气 · {name}', { name: t(WEATHER_META[e.kind].name) }), t(WEATHER_META[e.kind].desc), -1); break; }
    // 新梯：引擎用 TurnStarted{isFirst} 标记新梯首家（无单独 LadderReset 事件）
    if (!pick) for (const e of events) if (e.type === 'TurnStarted' && e.isFirst) { pick = mk('ladder', t('新梯开启'), t('{name} 起手重启', { name: nameOf(e.seat) }), e.seat); break; }
    if (!pick) return;

    setFx(pick);
    const id = pick.id;
    const timer = setTimeout(() => setFx((cur) => (cur && cur.id === id ? null : cur)), DUR[pick.kind]);
    return () => clearTimeout(timer);
  }, [events, view.you, view.players]);

  // 掉命 / 出局：给整桌一个轻微震屏
  useEffect(() => {
    if (!fx || (fx.kind !== 'lifeloss' && fx.kind !== 'out')) return;
    const el = document.querySelector('.board');
    if (!el) return;
    el.classList.add('fx-shake');
    const timer = setTimeout(() => el.classList.remove('fx-shake'), 520);
    return () => {
      clearTimeout(timer);
      el.classList.remove('fx-shake');
    };
  }, [fx]);

  if (!fx) return null;
  return (
    <div className={`eventfx eventfx-${fx.kind}${fx.you ? ' eventfx-you' : ''}`} key={fx.id} aria-hidden>
      <div className="eventfx-veil" />
      <div className="eventfx-card">
        <div className="eventfx-title">{fx.title}</div>
        <div className="eventfx-sub">{fx.sub}</div>
      </div>
      {fx.kind === 'runout' && (
        <div className="eventfx-spark">
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} style={{ '--i': String(i) } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}
