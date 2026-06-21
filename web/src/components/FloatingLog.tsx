import { ReactNode, useEffect, useRef, useState } from 'react';
import { Color, COLOR_META, LogEntry, PlayerView } from '../engine/types';
import { useT } from '../i18n';
import { playerColor } from '../playerColors';

// 关键词上色（三语）：性格名（金）、受罚/危险（红）、跑成/利好（绿）。
const KW_CLASS: Record<string, string> = {};
const addKw = (cls: string, words: string[]) => words.forEach((w) => (KW_CLASS[w] = cls));
addKw('log-kw-persona', [
  '激进', '稳健', '谨慎', '善变', '狡黠',
  '激進', '穩健', '謹慎', '善變',
  'Aggressive', 'Steady', 'Cautious', 'Volatile', 'Cunning',
]);
addKw('log-kw-danger', [
  '受罚', '被淹没', '撒谎被抓', '凝聚耗尽', '复归于源', '出局', '截下', '摊牌', '对质',
  '受罰', '被淹沒', '撒謊被抓', '凝聚耗盡', '復歸於源', '截下', '攤牌', '對質',
  'penalized', 'Engulfed', 'Caught lying', 'depleted', 'returned to Source', 'eliminated', 'challenged', 'Showdown', 'reveal',
]);
addKw('log-kw-good', [
  '跑成', '宣称为真', '险过', '计分区 +', '收走牌堆',
  '宣稱為真', '險過', '計分區 +',
  'Run Out', 'truthful', 'Survived', 'score area +', 'takes pile',
]);
const KW_RE = new RegExp(
  Object.keys(KW_CLASS)
    .sort((a, b) => b.length - a.length)
    .join('|'),
  'g',
);

let kwSeq = 0;
function highlightKeywords(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  KW_RE.lastIndex = 0;
  while ((m = KW_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={`k${kwSeq++}`} className={`log-kw ${KW_CLASS[m[0]]}`}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// 解析 ⟦色:数⟧ 数据 token，渲染为带颜色的造名+数字；其余文字做关键词上色。
const TOKEN = /⟦([a-z]+):([0-9]+)⟧/g;
function renderLine(
  line: string,
  t: (zh: string, p?: Record<string, string | number>) => string,
): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let i = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) parts.push(...highlightKeywords(line.slice(last, m.index)));
    const color = m[1] as Color;
    const num = Number(m[2]);
    const meta = COLOR_META[color];
    const numTxt = num === 0 ? `0·${t('顶')}` : String(num);
    parts.push(
      <span key={`t${i++}`} className="log-claim" style={{ color: meta?.hex }}>
        <span className="log-dot" style={{ background: meta?.hex }} />
        {meta?.name ?? color} {numTxt}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(...highlightKeywords(line.slice(last)));
  return parts;
}

let nameSeq = 0;
function renderEntry(
  entry: LogEntry,
  t: (zh: string, p?: Record<string, string | number>) => string,
  tn: (name: string) => string,
  seatOf: (name: string) => number,
): ReactNode {
  const params = entry.p ?? {};
  const tpl = t(entry.tpl);

  const parts: ReactNode[] = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;

  while ((m = re.exec(tpl))) {
    if (m.index > last) parts.push(...highlightKeywords(tpl.slice(last, m.index)));
    const raw = params[m[1]];
    if (!raw) {
      parts.push(m[0]);
    } else if (raw.startsWith('⟦')) {
      parts.push(renderLine(raw, t));
    } else if (raw.includes(' · ')) {
      const seat = seatOf(raw);
      parts.push(
        <span key={`n${nameSeq++}`} className="log-name" style={seat >= 0 ? { color: playerColor(seat) } : undefined}>
          {tn(raw)}
        </span>,
      );
    } else if (/[一-鿿]/.test(raw)) {
      parts.push(...highlightKeywords(t(raw)));
    } else {
      parts.push(...highlightKeywords(raw));
    }
    last = m.index + m[0].length;
  }
  if (last < tpl.length) parts.push(...highlightKeywords(tpl.slice(last)));
  return parts;
}

// 侧面浮窗式事件流：默认展开，可收起为一个小标签；鼠标滚动查看。
export function FloatingLog({ view }: { view: PlayerView }) {
  const { t, tn } = useT();
  const seatOf = (name: string) => view.players.find((p) => p.name === name)?.seat ?? -1;
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || (window.innerWidth > 820 && window.innerHeight > 560),
  );
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [view.log.length, open]);

  if (!open) {
    return (
      <button className="log-tab" type="button" onClick={() => setOpen(true)} title={t('事件流')} aria-label={t('展开事件流')}>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5.5h14M5 10h14M5 14.5h14M5 19h9" />
        </svg>
      </button>
    );
  }

  return (
    <aside className="flog">
      <div className="flog-head">
        <span className="flog-title">{t('河 · 事件流')}</span>
        <button className="flog-close" type="button" onClick={() => setOpen(false)} title={t('收起')}>
          ✕
        </button>
      </div>
      <div className="flog-body" ref={bodyRef}>
        {view.log.map((entry, i) => {
          const isSep = entry.tpl.startsWith('——');
          const isHot = entry.tpl.includes('摊牌') || entry.tpl.includes('对质');
          return (
            <div key={i} className={`log-line ${isSep ? 'log-sep' : ''} ${isHot ? 'log-hot' : ''}`}>
              {renderEntry(entry, t, tn, seatOf)}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
