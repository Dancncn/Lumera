import { ReactNode, useEffect, useRef, useState } from 'react';
import { Color, COLOR_META, PlayerView } from '../engine/types';

// 解析 ⟦色|文字⟧ token，渲染成对应四力颜色的小标签（带色点）。
const TOKEN = /⟦([a-z]+)\|([^⟧]+)⟧/g;
function renderLine(line: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let i = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    const meta = COLOR_META[m[1] as Color];
    parts.push(
      <span key={`t${i++}`} className="log-claim" style={{ color: meta?.hex }}>
        <span className="log-dot" style={{ background: meta?.hex }} />
        {m[2]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

// 侧面浮窗式事件流：默认展开，可收起为一个小标签；鼠标滚动查看。
export function FloatingLog({ view }: { view: PlayerView }) {
  const [open, setOpen] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [view.log.length, open]);

  if (!open) {
    return (
      <button className="log-tab" type="button" onClick={() => setOpen(true)} title="展开事件流">
        <span>事 件 流</span>
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
