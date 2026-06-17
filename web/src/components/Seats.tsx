import { PlayerView, PublicPlayer } from '../engine/types';
import { translate, useLang, useT } from '../i18n';

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

function Seat({ p, view }: { p: PublicPlayer; view: PlayerView }) {
  const { t, tn } = useT();
  const isCurrent = view.current === p.seat && !p.out;
  const thinking = isCurrent && p.isAI;
  return (
    <div className={`seat ${isCurrent ? 'seat-active' : ''} ${p.out ? 'seat-out' : ''}`} data-seat={p.seat}>
      <div className="seat-top">
        <span className="seat-name">{tn(p.name)}</span>
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
        {p.escalation > 1 && <span className="stat stat-warn" title={t('下次受罚投骰次数')}>{t('受罚')}×{p.escalation}</span>}
      </div>
      {p.out && <span className="seat-out-tag">{t('复归')}</span>}
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
  const opponents = view.players.filter((p) => p.seat !== view.you);
  const mid = Math.ceil(opponents.length / 2);
  // 拆成左右两组：桌面/竖屏下 .opp-side 用 display:contents 拼回一排；横屏分到两侧。
  return (
    <div className="opp-row">
      <div className="opp-side opp-left">
        {opponents.slice(0, mid).map((p) => (
          <Seat key={p.seat} p={p} view={view} />
        ))}
      </div>
      <div className="opp-side opp-right">
        {opponents.slice(mid).map((p) => (
          <Seat key={p.seat} p={p} view={view} />
        ))}
      </div>
    </div>
  );
}

/** 桌前的「你」—— 一条横向状态条（名 + 凝聚度 + 计分），紧挨手牌。 */
export function SelfPlate({ view }: { view: PlayerView }) {
  const { t, tn } = useT();
  const me = view.players[view.you];
  const isCurrent = view.current === view.you && !me.out;
  return (
    <div className={`selfplate ${isCurrent ? 'self-active' : ''}`} data-seat={view.you}>
      <span className="self-name">{tn(me.name)}</span>
      <Lives n={me.lives} max={view.startingLives} />
      <span className="self-stats">
        <span className="stat" title={t('手牌张数')}>
          <HandCount n={me.handCount} />
        </span>
        <span className="stat stat-score" title={t('收走的牌堆，按张数计分')}>
          {t('计分区')} <b key={me.scoredCount} className="score-bump">{me.scoredCount}</b>
        </span>
        <span className="stat" title={t('打 0 领取的计分卡面值')}>{t('计分卡')} {me.tokenValue}</span>
        {me.escalation > 1 && <span className="stat stat-warn" title={t('下次受罚投骰次数')}>{t('受罚')}×{me.escalation}</span>}
      </span>
    </div>
  );
}
