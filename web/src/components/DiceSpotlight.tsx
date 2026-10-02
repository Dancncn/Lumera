import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useGame } from '../store/gameStore';
import { DiceFace } from './DiceFace';

export function DiceSpotlight() {
  const lastDie = useGame((s) => s.lastDie);
  const mode = useGame((s) => s.mode);
  const over = useGame((s) => s.mode === 'online' && s.onlineView?.prompt.kind === 'over');
  const [die, setDie] = useState(lastDie);
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [rollFaces, setRollFaces] = useState<number[]>([1]);
  const [settled, setSettled] = useState(false);
  const seenRef = useRef(lastDie);
  const wasOver = useRef(over);

  useEffect(() => {
    // A fresh round cancels the old presentation. Within an online round, later
    // updates can move to another penalty while this roll is still playing.
    const restarted = wasOver.current && !over;
    wasOver.current = over;
    if (restarted || (!lastDie && mode === 'local')) {
      seenRef.current = lastDie;
      setDie(null);
      setShow(false);
      return;
    }
    if (!lastDie || lastDie === seenRef.current) return;
    seenRef.current = lastDie;
    setDie(lastDie);
  }, [lastDie, mode, over]);

  useEffect(() => {
    if (!die) return;
    const final = die.rolled; // 1 或 2 个点数
    const rand = () => final.map(() => 1 + Math.floor(Math.random() * 6));

    setShow(true);
    setSettled(false);
    setRollFaces(rand());

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const delays = [60, 60, 80, 80, 110, 140, 180, 220, 280, 360];
    let i = 1;

    function tick() {
      if (cancelled) return;
      if (i < delays.length) {
        setRollFaces(rand());
        timer = setTimeout(tick, delays[i++]);
      } else {
        setRollFaces(final);
        setSettled(true);
        timer = setTimeout(() => { if (!cancelled) setShow(false); }, 2200);
      }
    }
    timer = setTimeout(tick, delays[0]);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [die]);

  if (!show || !die) return null;

  const rolling = !settled;
  const hit = die.hit;
  const twoDice = rollFaces.length > 1;

  return (
    <div className="dice-spotlight" aria-hidden>
      <div className="dice-spot-dim" />
      <div className={`dice-spot-card${settled ? (hit ? ' dice-spot-hit' : ' dice-spot-miss') : ''}`}>
        <div className="dice-spot-chosen">
          {t('赌 {c}', { c: die.chosen.join(' ') })}
        </div>
        <div
          className={`dice-spot-face${rolling ? ' dice-spot-rolling' : ''}`}
          style={twoDice ? { width: 'auto', minWidth: 100, gap: 14, padding: '0 14px' } : undefined}
        >
          {rollFaces.map((f, idx) => (
            <DiceFace key={idx} value={f} size={twoDice ? 66 : 80} />
          ))}
        </div>
        {rolling && (
          <div className="dice-spot-text">{t('源涌轮盘 · 掷骰中...')}</div>
        )}
        {settled && (
          <div className={`dice-spot-result${hit ? ' dice-spot-result-hit' : ' dice-spot-result-miss'}`}>
            <span className="dice-spot-num">{die.rolled.join(' / ')}</span>
            <span className="dice-spot-verdict">{hit ? t('被淹没') : t('险过')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
