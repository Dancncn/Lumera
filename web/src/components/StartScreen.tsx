import { useState } from 'react';
import { useGame } from '../store/gameStore';
import { Difficulty } from '../engine/ai';
import { Emblem } from './Emblem';
import { SideRivers } from './MeteorShower';
import { RulesButton } from './RulesModal';

function randomRoom(): string {
  return Math.random().toString(36).slice(2, 7);
}

const DIFFS: { key: Difficulty; label: string; hint: string }[] = [
  { key: 'easy', label: '新手', hint: '对手更冲动、爱犯错' },
  { key: 'normal', label: '常规', hint: '性格各异，有诈有读' },
  { key: 'hard', label: '老练', hint: '会读你、少破绽' },
];

export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const joinRoom = useGame((s) => s.joinRoom);
  const [players, setPlayers] = useState(3);
  const [tab, setTab] = useState<'solo' | 'online'>('solo');
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  function enterOnline() {
    const room = roomId.trim() || randomRoom();
    setRoomId(room);
    joinRoom(room, name.trim() || '玩家', players);
  }

  return (
    <div className="start-wrap">
      <SideRivers />
      <div className="start-corner">
        <RulesButton />
      </div>

      <div className="start">
        <Emblem className="start-emblem" />
        <h1 className="start-title">
          <span className="title-cjk">源河</span>
          <span className="title-sep">·</span>
          <span className="title-latin">Lumera</span>
        </h1>
        <div className="title-rule" />
        <p className="start-desc">盖牌、说谎、拆穿 —— 一缕意志，抢着先汇成。</p>

        <div className="start-how">
          <p>轮到你：盖一张牌扣下，报出它是「某色某数」—— 真话、假话都行。</p>
          <p>下家二选一：放行（换他接着出），或截牌、当场翻开对质。</p>
          <p>翻开见真假：报的是真，截牌方受罚；报的是假，出牌方受罚。受罚要掷骰赌命，连着受罚越来越凶。</p>
          <p>怎么赢：率先把手牌出光，或靠截穿对手攒下整摞牌，终局分高者胜。</p>
          <p className="start-how-more">细则点右上角「?」。</p>
        </div>

        <div className="start-tabs">
          <button className={`tab-btn ${tab === 'solo' ? 'tab-on' : ''}`} type="button" onClick={() => setTab('solo')}>
            单机人机
          </button>
          <button className={`tab-btn ${tab === 'online' ? 'tab-on' : ''}`} type="button" onClick={() => setTab('online')}>
            联机对战
          </button>
        </div>

        <div className="start-players">
          <span className="start-label">入局意志数</span>
          <div className="seg">
            {[2, 3, 4].map((n) => (
              <button key={n} className={`seg-btn ${players === n ? 'seg-on' : ''}`} onClick={() => setPlayers(n)} type="button">
                {n} 人
              </button>
            ))}
          </div>
          <span className="start-hint">{players === 2 ? '2 人局：只剩最纯粹的对峙' : '含转向 / 禁止 / 万能牌'}</span>
        </div>

        {tab === 'solo' ? (
          <div className="online-entry">
            <div className="start-players">
              <span className="start-label">对手棋力</span>
              <div className="seg">
                {DIFFS.map((d) => (
                  <button key={d.key} className={`seg-btn ${difficulty === d.key ? 'seg-on' : ''}`} onClick={() => setDifficulty(d.key)} type="button">
                    {d.label}
                  </button>
                ))}
              </div>
              <span className="start-hint">{DIFFS.find((d) => d.key === difficulty)?.hint}</span>
            </div>
            <button className="start-go" onClick={() => newGame(players, difficulty)} type="button">
              涌出 · 入局
            </button>
          </div>
        ) : (
          <div className="online-entry">
            <div className="online-fields">
              <input
                className="online-input"
                value={name}
                maxLength={16}
                placeholder="你的名字"
                onChange={(e) => setName(e.target.value)}
              />
              <div className="online-room">
                <input
                  className="online-input"
                  value={roomId}
                  maxLength={32}
                  placeholder="房间号（留空自动生成）"
                  onChange={(e) => setRoomId(e.target.value)}
                />
                <button className="btn btn-ghost" type="button" onClick={() => setRoomId(randomRoom())}>
                  随机
                </button>
              </div>
            </div>
            <span className="start-hint">同一房间号即同一桌；空位由 AI 补位，房主点开始即可。</span>
            <button className="start-go" onClick={enterOnline} type="button">
              进入房间
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
