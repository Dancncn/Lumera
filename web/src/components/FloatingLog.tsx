import { ReactNode, useEffect, useRef, useState } from 'react';
import { Color, COLOR_META, PlayerView } from '../engine/types';

// 关键词上色：性格名（金）、受罚/危险（红）、跑成/利好（绿）。
const KW_CLASS: Record<string, string> = {};
const addKw = (cls: string, words: string[]) => words.forEach((w) => (KW_CLASS[w] = cls));
addKw('log-kw-persona', ['激进', '稳健', '谨慎', '善变', '狡黠']);
addKw('log-kw-danger', ['受罚', '被淹没', '撒谎被抓', '凝聚耗尽', '复归于源', '出局', '截下', '摊牌', '对质']);
addKw('log-kw-good', ['跑成', '宣称为真', '险过', '计分卡', '收走牌堆']);
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

// 解析 ⟦色|文字⟧ token（四力颜色的牌名），其余文字再做关键词上色。
const TOKEN = /⟦([a-z]+)\|([^⟧]+)⟧/g;
function renderLine(line: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let i = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) parts.push(...highlightKeywords(line.slice(last, m.index)));
    const meta = COLOR_META[m[1] as Color];
    parts.push(
      <span key={`t${i++}`} className="log-claim" style={{ color: meta?.hex }}>
        <span className="log-dot" style={{ background: meta?.hex }} />
        {m[2]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(...highlightKeywords(line.slice(last)));
  return parts;
}

// 侧面浮窗式事件流：默认展开，可收起为一个小标签；鼠标滚动查看。
export function FloatingLog({ view }: { view: PlayerView }) {
  // 桌面默认展开；手机窄屏 / 横屏矮屏默认收起为标签，避免侧栏压住牌局。
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || (window.innerWidth > 820 && window.innerHeight > 560),
  );
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [view.log.length, open]);

  if (!open) {
    return (
      <button className="log-tab" type="button" onClick={() => setOpen(true)} title="事件流" aria-label="展开事件流">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5.5h14M5 10h14M5 14.5h14M5 19h9" />
        </svg>
      </button>
    );
  }

  return (
    <aside className="flog">
      <div className="flog-head">
        <span className="flog-title">河 · 事件流</span>
        <button className="flog-close" type="button" onClick={() => setOpen(false)} title="收起">
          ✕
        </button>
      </div>
      <div className="flog-body" ref={bodyRef}>
        {view.log.map((line, i) => (
          <div
            key={i}
            className={`log-line ${line.startsWith('——') ? 'log-sep' : ''} ${line.includes('摊牌') || line.includes('质疑') ? 'log-hot' : ''}`}
          >
            {renderLine(line)}
          </div>
        ))}
      </div>
    </aside>
  );
}
