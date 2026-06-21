import { useEffect, useRef } from 'react';
import { PlayerView } from '../engine/types';
import { useT } from '../i18n';
import { saveRecord } from '../net/history';
import { playerColor } from '../playerColors';
import { useGame } from '../store/gameStore';

const DIFF_LABEL: Record<string, string> = { easy: '新手', normal: '常规', hard: '老练', master: '大师' };

export function GameOver({ view }: { view: PlayerView }) {
  const newGame = useGame((s) => s.newGame);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const tutorial = useGame((s) => s.tutorial);
  const startTutorial = useGame((s) => s.startTutorial);
  const mode = useGame((s) => s.mode);
  const difficulty = useGame((s) => s.difficulty);
  const { t, tn } = useT();
  const ranking = view.ranking ?? [];
  const players = view.players.length;
  const winner = ranking[0];
  const youRank = ranking.findIndex((r) => r.seat === view.you) + 1;

  // 结束时把这局存进本机记录（每次结算只存一次；新手引导不计入）
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current || tutorial || !ranking.length) return;
    saved.current = true;
    const me = ranking.find((r) => r.seat === view.you);
    saveRecord({
      at: Date.now(),
      mode: mode === 'online' ? 'online' : 'local',
      players,
      difficulty,
      rank: youRank || ranking.length,
      score: me?.score ?? 0,
      won: youRank === 1,
    });
  }, []);

  return (
    <div className="overlay">
      <div className="gameover">
        <div className="go-title">{tutorial ? t('新手引导 · 完成') : t('诸念归源 · 本局结算')}</div>
        {!tutorial && (
          <div className="go-meta">
            <span className="go-meta-chip">{t('{n} 人', { n: players })}</span>
            {mode === 'local' && <span className="go-meta-chip">{t('难度')} · {t(DIFF_LABEL[difficulty] ?? '常规')}</span>}
            {mode === 'online' && <span className="go-meta-chip">{t('联机对战')}</span>}
          </div>
        )}
        {tutorial && <div className="go-grad">{t('认牌、出牌接梯、放行 / 截牌、摊牌受罚 —— 一整轮你都走过了。来一局真正的对局练练手吧。')}</div>}
        {winner && (
          <div className="go-winner">
            <span style={{ color: playerColor(winner.seat) }}>{winner.seat === view.you ? t('你') : tn(winner.name)}</span>
            {' '}{t('第一个汇成 —— 创造站住了。')}
          </div>
        )}
        <table className="go-table">
          <thead>
            <tr>
              <th>{t('名次')}</th>
              <th>{t('意志')}</th>
              <th>{t('总分')}</th>
              <th>{t('计分区')}</th>
              <th>{t('失凝聚')}</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.seat} className={r.seat === view.you ? 'go-you' : ''}>
                <td>{i + 1}</td>
                <td>
                  <span style={{ color: playerColor(r.seat) }}>{tn(r.name)}</span>
                  {r.out && <span className="go-out"> {t('复归')}</span>}
                </td>
                <td className="go-score">{r.score}</td>
                <td>{r.scoredCount}</td>
                <td>−{r.livesLost * 5}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="go-formula">{t('总分 = 计分区 − 失凝聚（每命 −5）')}</div>
        {youRank > 0 && <div className="go-yourank">{t('你的名次：第 {a} / {b}', { a: youRank, b: ranking.length })}</div>}
        <div className="go-btns">
          {tutorial ? (
            <>
              <button className="start-go" type="button" onClick={() => newGame(3, 'normal')}>
                {t('自由打一局（3 人）')}
              </button>
              <button className="start-ghost" type="button" onClick={() => startTutorial()}>
                {t('再走一遍引导')}
              </button>
            </>
          ) : (
            <>
              <button className="start-go" type="button" onClick={() => newGame(players, difficulty)}>
                {t('再来一局')}
              </button>
              <button className="start-ghost" type="button" onClick={quitToMenu}>
                {t('退出 · 改人数 / 难度')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
