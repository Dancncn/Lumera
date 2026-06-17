import { PlayerView } from '../engine/types';
import { useGame } from '../store/gameStore';

export function GameOver({ view }: { view: PlayerView }) {
  const newGame = useGame((s) => s.newGame);
  const tutorial = useGame((s) => s.tutorial);
  const startTutorial = useGame((s) => s.startTutorial);
  const ranking = view.ranking ?? [];
  const players = view.players.length;
  const winner = ranking[0];
  const youRank = ranking.findIndex((r) => r.seat === view.you) + 1;

  return (
    <div className="overlay">
      <div className="gameover">
        <div className="go-title">{tutorial ? '新手引导 · 完成' : '诸念归源 · 本局结算'}</div>
        {tutorial && (
          <div className="go-grad">
            认牌、出牌接梯、放行 / 截牌、摊牌受罚 —— 一整轮你都走过了。来一局真正的对局练练手吧。
          </div>
        )}
        {winner && (
          <div className="go-winner">
            {winner.seat === view.you ? '你' : winner.name} 第一个汇成 —— 创造站住了。
          </div>
        )}
        <table className="go-table">
          <thead>
            <tr>
              <th>名次</th>
              <th>意志</th>
              <th>总分</th>
              <th>计分区</th>
              <th>计分卡</th>
              <th>失凝聚</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.seat} className={r.seat === view.you ? 'go-you' : ''}>
                <td>{i + 1}</td>
                <td>
                  {r.name}
                  {r.out && <span className="go-out"> 复归</span>}
                </td>
                <td className="go-score">{r.score}</td>
                <td>{r.scoredCount}</td>
                <td>{r.tokenValue}</td>
                <td>−{r.livesLost * 5}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="go-formula">总分 = 计分区张数 + 计分卡面值 − 失凝聚（每命 −5）</div>
        {youRank > 0 && <div className="go-yourank">你的名次：第 {youRank} / {ranking.length}</div>}
        <div className="go-btns">
          {tutorial ? (
            <>
              <button className="start-go" type="button" onClick={() => newGame(3, 'normal')}>
                自由打一局（3 人）
              </button>
              <button className="start-ghost" type="button" onClick={() => startTutorial()}>
                再走一遍引导
              </button>
            </>
          ) : (
            <button className="start-go" type="button" onClick={() => newGame(players)}>
              再转一次轮子（同人数）
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
