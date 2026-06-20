import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useGame } from '../store/gameStore';
import { DiceFace } from './DiceFace';

export function DiceSpotlight() {
  const lastDie = useGame((s) => s.lastDie);
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [rollFaces, setRollFaces] = useState<number[]>([1]);
  const [settled, setSettled] = useState(false);
  const seenRef = useRef(lastDie);

  useEffect(() => {
    if (!lastDie || lastDie === seenRef.current) return;
    seenRef.current = lastDie;
    const final = lastDie.rolled; // 1 或 2 个点数
    const rand = () => final.map(() => 1 + Math.floor(Math.random() * 6));

    setShow(true);
    setSettled(false);
    setRollFaces(rand());

    let cancelled = false;
    const delays = [60, 60, 80, 80, 110, 140, 180, 220, 280, 360];
    let i = 1;

    function tick() {
      if (cancelled) return;
      if (i < delays.length) {
        setRollFaces(rand());
        setTimeout(tick, delays[i++]);
      } else {
        setRollFaces(final);
        setSettled(true);
        setTimeout(() => { if (!cancelled) setShow(false); }, 2200);
      }
    }
    setTimeout(tick, delays[0]);

    return () => { cancelled = true; };
  }, [lastDie]);

  if (!show || !lastDie) return null;

  const rolling = !settled;
  const hit = lastDie.hit;
  const twoDice = rollFaces.length > 1;

  return (
    <div className="dice-spotlight" aria-hidden>
      <div className="dice-spot-dim" />
      <div className={`dice-spot-card${settled ? (hit ? ' dice-spot-hit' : ' dice-spot-miss') : ''}`}>
        <div className="dice-spot-chosen">
          {t('赌 {c}', { c: lastDie.chosen.join(' ') })}
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
            <span className="dice-spot-num">{lastDie.rolled.join(' / ')}</span>
            <span className="dice-spot-verdict">{hit ? t('被淹没') : t('险过')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
