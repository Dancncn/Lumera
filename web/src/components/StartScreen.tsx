import { useState } from 'react';
import { useGame } from '../store/gameStore';
import { Difficulty } from '../engine/ai';
import { useT } from '../i18n';
import { AboutButton } from './AboutModal';
import { DataMonitor } from './DataMonitor';
import { Emblem } from './Emblem';
import { HistoryButton } from './HistoryModal';
import { LangSwitch } from './LangSwitch';
import { SideRivers } from './MeteorShower';
import { RulesButton } from './RulesModal';

function randomRoom(): string {
  return Math.random().toString(36).slice(2, 7);
}

const DIFFS: { key: Difficulty; label: string; hint: string }[] = [
  { key: 'easy', label: '新手', hint: '对手更冲动、爱犯错' },
  { key: 'normal', label: '常规', hint: '性格各异，有诈有读' },
  { key: 'hard', label: '老练', hint: '会读你、少破绽' },
  { key: 'master', label: '大师', hint: '全局计算、风险评估、精准博弈' },
];

export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const startTutorial = useGame((s) => s.startTutorial);
  const joinRoom = useGame((s) => s.joinRoom);
  const { t } = useT();
  const [players, setPlayers] = useState(3);
  const [tab, setTab] = useState<'solo' | 'online'>('solo');
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [weather, setWeather] = useState(false);

  function enterOnline() {
    const room = roomId.trim() || randomRoom();
    setRoomId(room);
    joinRoom(room, name.trim() || t('玩家'), players);
  }

  return (
    <div className="start-wrap">
      <SideRivers />
      <div className="start-corner">
        <LangSwitch />
        <HistoryButton />
        <DataMonitor />
        <RulesButton />
        <AboutButton />
      </div>

      <div className="start">
        <Emblem className="start-emblem" />
        <h1 className="start-title">
          <span className="title-cjk">源河</span>
          <span className="title-sep">·</span>
          <span className="title-latin">Lumera</span>
        </h1>
        <div className="title-rule" />
        <p className="start-desc">{t('盖牌、说谎、拆穿 —— 一缕意志，抢着先汇成。')}</p>

        <div className="start-how">
          <p>{t('盖牌出、报出它是什么（可以撒谎），全场在场玩家选择放行或截牌拆穿。')}</p>
          <p className="start-how-more">{t('先出光手牌、或截穿对手攒牌者赢 · 不熟规则先点下方「新手引导」，细则见右上角「?」')}</p>
        </div>

        <div className="start-tabs">
          <button className={`tab-btn ${tab === 'solo' ? 'tab-on' : ''}`} type="button" onClick={() => setTab('solo')}>
            {t('单机人机')}
          </button>
          <button className={`tab-btn ${tab === 'online' ? 'tab-on' : ''}`} type="button" onClick={() => setTab('online')}>
            {t('联机对战')}
          </button>
        </div>

        <div className="start-players">
          <span className="start-label">{t('入局意志数')}</span>
          <div className="seg">
            {[2, 3, 4].map((n) => (
              <button key={n} className={`seg-btn ${players === n ? 'seg-on' : ''}`} onClick={() => setPlayers(n)} type="button">
                {t('{n} 人', { n })}
              </button>
            ))}
          </div>
          <span className="start-hint">{players === 2 ? t('2 人局：只剩最纯粹的对峙') : t('含转向 / 禁止 / 万能牌')}</span>
        </div>

        {tab === 'solo' ? (
          <div className="online-entry">
            <div className="start-players">
              <span className="start-label">{t('对手棋力')}</span>
              <div className="seg">
                {DIFFS.map((d) => (
                  <button key={d.key} className={`seg-btn ${difficulty === d.key ? 'seg-on' : ''}`} onClick={() => setDifficulty(d.key)} type="button">
                    {t(d.label)}
                  </button>
                ))}
              </div>
              <span className="start-hint">{t(DIFFS.find((d) => d.key === difficulty)?.hint ?? '')}</span>
            </div>
            <div className="start-players">
              <span className="start-label">{t('混沌天气')}</span>
              <div className="seg">
                <button className={`seg-btn ${!weather ? 'seg-on' : ''}`} onClick={() => setWeather(false)} type="button">
                  {t('关')}
                </button>
                <button className={`seg-btn ${weather ? 'seg-on' : ''}`} onClick={() => setWeather(true)} type="button">
                  {t('开')}
                </button>
              </div>
              <span className="start-hint">
                {weather ? t('每开新梯有几率降下随机事件，为战局加噪（休闲向，平衡会变松）') : t('经典规则，无随机事件')}
              </span>
            </div>
            <button className="start-go" onClick={() => newGame(players, difficulty, undefined, undefined, weather)} type="button">
              {t('涌出 · 入局')}
            </button>
            <button className="btn coach-enter" onClick={() => startTutorial()} type="button">
              {t('新手引导 · 带你走一遍')}
            </button>
          </div>
        ) : (
          <div className="online-entry">
            <div className="online-fields">
              <input
                className="online-input"
                value={name}
                maxLength={16}
                placeholder={t('你的名字')}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="online-room">
                <input
                  className="online-input"
                  value={roomId}
                  maxLength={32}
                  placeholder={t('房间号（留空自动生成）')}
                  onChange={(e) => setRoomId(e.target.value)}
                />
                <button className="btn btn-ghost" type="button" onClick={() => setRoomId(randomRoom())}>
                  {t('随机')}
                </button>
              </div>
            </div>
            <span className="start-hint">{t('同一房间号即同一桌；空位由 AI 补位，房主点开始即可。')}</span>
            <button className="start-go" onClick={enterOnline} type="button">
              {t('进入房间')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
