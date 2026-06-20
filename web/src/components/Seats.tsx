import { useEffect, useState } from 'react';
import { GameEvent, PlayerView, PublicPlayer } from '../engine/types';
import { translate, useLang, useT } from '../i18n';
import { playerColor } from '../playerColors';
import { useGame } from '../store/gameStore';

function Lives({ n, max }: { n: number; max: number }) {
  const lang = useLang((s) => s.lang);
  return (
    <span className="lives" title={translate('凝聚度 {n}/{max}', lang, { n, max })}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`life ${i < n ? 'life-on' : 'life-off'}`} />
      ))}
    </span>
  );
}

// 手牌数量用一个极简线条的牌堆图标表示，绝不叠出去盖住信息。
function HandCount({ n }: { n: number }) {
  const lang = useLang((s) => s.lang);
  return (
    <span className="hand-count" title={translate('手牌 {n} 张', lang, { n })}>
      <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
        <rect x="2.5" y="4.5" width="9" height="11" rx="1.5" />
        <path d="M6 3.2 h8.5 a1.5 1.5 0 0 1 1.5 1.5 v10" opacity="0.6" />
      </svg>
      {n}
    </span>
  );
}

function nextAlive(players: PublicPlayer[], from: number, dir: 1 | -1): number {
  const n = players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (!players[i].out) return i;
  }
  return from;
}

function useSkippedSeat(events: GameEvent[], view: PlayerView): number | null {
  const [seat, setSeat] = useState<number | null>(null);
  useEffect(() => {
    const skip = events.find(
      (e) => e.type === 'FunctionalPlayed' && e.func === 'skip',
    ) as { seat: number } | undefined;
    if (skip) {
      const target = nextAlive(view.players, skip.seat, view.direction);
      setSeat(target);
      const timer = setTimeout(() => setSeat(null), 1800);
      return () => clearTimeout(timer);
    }
    if (events.some((e) => e.type === 'TurnStarted')) setSeat(null);
  }, [events]);
  return seat;
}

function useJudgingSeat(events: GameEvent[]): number | null {
  const [seat, setSeat] = useState<number | null>(null);
  useEffect(() => {
    if (events.some((e) => e.type === 'PlayAccepted' || e.type === 'Challenged' || e.type === 'TurnStarted'))  {
      setSeat(null);
      return;
    }
    const played = events.find((e) => e.type === 'CardPlayed') as { seat: number } | undefined;
    if (played) setSeat(played.seat);
  }, [events]);
  return seat;
}

function Seat({
  p,
  view,
  isPenalty,
  isSkipped,
  isJudging,
  isNext,
}: {
  p: PublicPlayer;
  view: PlayerView;
  isPenalty: boolean;
  isSkipped: boolean;
  isJudging: boolean;
  isNext: boolean;
}) {
  const { t, tn } = useT();
  const isCurrent = view.current === p.seat && !p.out;
  const thinking = isCurrent && p.isAI;
  const cls = [
    'seat',
    isCurrent ? 'seat-active' : '',
    p.out ? 'seat-out' : '',
    isPenalty ? 'seat-penalty' : '',
    isSkipped ? 'seat-skipped' : '',
    isJudging ? 'seat-judging' : '',
    isNext ? 'seat-next' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-seat={p.seat}>
      <div className="seat-top">
        <span className="seat-name" style={{ color: playerColor(p.seat) }}>{tn(p.name)}</span>
        <Lives n={p.lives} max={view.startingLives} />
      </div>
      <div className="seat-stats">
        <span className="stat" title={t('手牌张数')}>
          <HandCount n={p.handCount} />
        </span>
        <span className="stat stat-score" title={t('收走的牌堆，按张数计分')}>
          {t('计分区')} <b key={p.scoredCount} className="score-bump">{p.scoredCount}</b>
        </span>
        <span className="stat" title={t('打 0 领取的计分卡面值')}>{t('计分卡')} {p.tokenValue}</span>
        {p.escalation > 1 && <span className="stat stat-warn" title={t('下次受罚要赌的点数')}>{t('受罚')}×{p.escalation}</span>}
      </div>
      {p.out && <span className="seat-out-tag">{t('复归')}</span>}
      {isJudging && <span className="seat-judging-tag">{t('待裁断')}</span>}
      {isPenalty && <span className="seat-penalty-tag">{t('受罚中')}</span>}
      {isSkipped && <span className="seat-skip-tag">{t('被跳过')}</span>}
      {isNext && !p.out && <span className="seat-next-tag">▸ {t('下家')}</span>}
      {thinking && (
        <span className="seat-thinking">
          {t('凝神')}
          <span className="think-dots">
            <i />
            <i />
            <i />
          </span>
        </span>
      )}
    </div>
  );
}

export function Seats({ view }: { view: PlayerView }) {
  const events = useGame((s) => s.lastEvents);
  const penaltySeat = useGame((s) => s.penaltySeat);
  const skippedSeat = useSkippedSeat(events, view);
  const judgingSeat = useJudgingSeat(events);
  const nextSeat = nextAlive(view.players, view.current, view.direction);
  const opponents = view.players.filter((p) => p.seat !== view.you);
  const mid = Math.ceil(opponents.length / 2);
  return (
    <div className="opp-row">
      <div className="opp-side opp-left">
        {opponents.slice(0, mid).map((p) => (
          <Seat key={p.seat} p={p} view={view} isPenalty={penaltySeat === p.seat} isSkipped={skippedSeat === p.seat} isJudging={judgingSeat === p.seat} isNext={nextSeat === p.seat && nextSeat !== view.current} />
        ))}
      </div>
      <div className="opp-side opp-right">
        {opponents.slice(mid).map((p) => (
          <Seat key={p.seat} p={p} view={view} isPenalty={penaltySeat === p.seat} isSkipped={skippedSeat === p.seat} isJudging={judgingSeat === p.seat} isNext={nextSeat === p.seat && nextSeat !== view.current} />
        ))}
      </div>
    </div>
  );
}

export function SelfPlate({ view }: { view: PlayerView }) {
  const { t, tn } = useT();
  const penaltySeat = useGame((s) => s.penaltySeat);
  const me = view.players[view.you];
  const isCurrent = view.current === view.you && !me.out;
  const isPenalty = penaltySeat === view.you;
  const nextSeat = nextAlive(view.players, view.current, view.direction);
  const isNextMe = nextSeat === view.you && !isCurrent && !me.out;
  return (
    <div className={`selfplate ${isCurrent ? 'self-active' : ''} ${isPenalty ? 'self-penalty' : ''}`} data-seat={view.you}>
      <span className="self-name" style={{ color: playerColor(view.you) }}>{tn(me.name)}</span>
      <Lives n={me.lives} max={view.startingLives} />
      {isPenalty && <span className="self-penalty-tag">{t('受罚中')}</span>}
      {isNextMe && <span className="self-next-tag">{t('下一个就是你')}</span>}
      <span className="self-stats">
        <span className="stat" title={t('手牌张数')}>
          <HandCount n={me.handCount} />
        </span>
        <span className="stat stat-score" title={t('收走的牌堆，按张数计分')}>
          {t('计分区')} <b key={me.scoredCount} className="score-bump">{me.scoredCount}</b>
        </span>
        <span className="stat" title={t('打 0 领取的计分卡面值')}>{t('计分卡')} {me.tokenValue}</span>
        {me.escalation > 1 && <span className="stat stat-warn" title={t('下次受罚要赌的点数')}>{t('受罚')}×{me.escalation}</span>}
      </span>
    </div>
  );
}
