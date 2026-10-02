import { useState } from 'react';
import { useT } from '../i18n';
import { useGame, useCanAct, WEATHER_CHANCE_PRESETS } from '../store/gameStore';
import { SideRivers } from './MeteorShower';

const CONN_TEXT: Record<string, string> = {
  idle: '未连接',
  connecting: '连接中…',
  open: '已连接',
  closed: '已断开',
};

export function Lobby() {
  const canAct = useCanAct();
  const lobby = useGame((s) => s.lobby);
  const conn = useGame((s) => s.conn);
  const netError = useGame((s) => s.netError);
  const startRoom = useGame((s) => s.startRoom);
  const setRoomWeather = useGame((s) => s.setRoomWeather);
  const setRoomChance = useGame((s) => s.setRoomChance);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const { t, tn } = useT();
  const [copied, setCopied] = useState(false);

  const humans = lobby?.seats.filter((s) => !s.isAI && s.connected).length ?? 0;

  function copyRoom() {
    if (!lobby) return;
    navigator.clipboard?.writeText(lobby.roomId).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  }

  return (
    <div className="start-wrap">
      <SideRivers />
      <div className="lobby">
        <h1 className="start-title">{t('联机房间')}</h1>

        {!lobby ? (
          <p className="lobby-status" role="status">{t(CONN_TEXT[conn] ?? conn)}{t('…正在进入房间')}</p>
        ) : (
          <>
            <div className="lobby-room">
              <span className="lobby-room-label">{t('房间号')}</span>
              <code className="lobby-room-id">{lobby.roomId}</code>
              <button className="btn btn-ghost" type="button" onClick={copyRoom}>
                {copied ? t('已复制') : t('复制')}
              </button>
              <span className={`lobby-conn lobby-conn-${conn}`}>{t(CONN_TEXT[conn] ?? conn)}</span>
            </div>

            {lobby.host && !lobby.started ? (
              <>
                <div className="lobby-room">
                  <span className="lobby-room-label">{t('混沌天气')}</span>
                  <fieldset className="seg room-controls" disabled={!canAct}>
                    <button className={`seg-btn ${!lobby.weather ? 'seg-on' : ''}`} type="button" onClick={() => setRoomWeather(false)}>
                      {t('关')}
                    </button>
                    <button className={`seg-btn ${lobby.weather ? 'seg-on' : ''}`} type="button" onClick={() => setRoomWeather(true)}>
                      {t('开')}
                    </button>
                  </fieldset>
                  <span className="lobby-conn">{t('仅房主可调 · 即时同步全场')}</span>
                </div>
                {lobby.weather && (
                  <div className="lobby-room">
                    <span className="lobby-room-label">{t('天气频率')}</span>
                    <fieldset className="seg room-controls" disabled={!canAct}>
                      {WEATHER_CHANCE_PRESETS.map((p) => (
                        <button key={p.key} className={`seg-btn ${lobby.weatherChance === p.value ? 'seg-on' : ''}`} type="button" onClick={() => setRoomChance(p.value)}>
                          {t(p.label)}
                        </button>
                      ))}
                    </fieldset>
                  </div>
                )}
              </>
            ) : (
              <p className="lobby-hint">
                {t('混沌天气')}：{lobby.weather ? `${t('开')} · ${Math.round(lobby.weatherChance * 100)}%` : t('关')}
              </p>
            )}

            <div className="lobby-seats">
              {lobby.seats.map((s) => (
                <div
                  key={s.seat}
                  className={`lobby-seat ${s.seat === lobby.you ? 'lobby-seat-you' : ''} ${s.isAI ? 'lobby-seat-ai' : ''}`}
                >
                  <span className="lobby-seat-no">{t('座位 {n}', { n: s.seat + 1 })}</span>
                  <span className="lobby-seat-name">
                    {tn(s.name)}
                    {s.seat === lobby.you && ` · ${t('你')}`}
                  </span>
                  <span className="lobby-seat-tag">{s.isAI ? t('AI 补位') : s.connected ? t('在线') : t('掉线')}</span>
                </div>
              ))}
            </div>

            <p className="lobby-hint">{t('已入座真人 {n} 人，其余座位由 AI 补位。把房间号发给朋友，他们用同一房间号即可加入。', { n: humans })}</p>

            <div className="lobby-btns">
              {!lobby.started && lobby.host && (
                <button className="start-go" type="button" onClick={startRoom} disabled={!canAct}>
                  {t('开始对局（空位转 AI）')}
                </button>
              )}
              {!lobby.started && !lobby.host && <span className="lobby-wait">{t('等待房主开始…')}</span>}
              {lobby.started && <span className="lobby-wait">{t('对局进行中 · 正在同步…')}</span>}
            </div>
          </>
        )}
        {netError && <p className="lobby-error" role="alert">{netError}</p>}
        <button className="btn btn-ghost" type="button" onClick={leaveRoom}>
          {t('离开房间')}
        </button>
      </div>
    </div>
  );
}
