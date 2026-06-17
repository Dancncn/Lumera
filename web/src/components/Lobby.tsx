import { useState } from 'react';
import { useGame } from '../store/gameStore';
import { SideRivers } from './MeteorShower';

const CONN_TEXT: Record<string, string> = {
  idle: '未连接',
  connecting: '连接中…',
  open: '已连接',
  closed: '已断开',
};

export function Lobby() {
  const lobby = useGame((s) => s.lobby);
  const conn = useGame((s) => s.conn);
  const netError = useGame((s) => s.netError);
  const startRoom = useGame((s) => s.startRoom);
  const leaveRoom = useGame((s) => s.leaveRoom);
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
        <h1 className="start-title">联机房间</h1>

        {!lobby ? (
          <p className="lobby-status">{CONN_TEXT[conn] ?? conn}…正在进入房间</p>
        ) : (
          <>
            <div className="lobby-room">
              <span className="lobby-room-label">房间号</span>
              <code className="lobby-room-id">{lobby.roomId}</code>
              <button className="btn btn-ghost" type="button" onClick={copyRoom}>
                {copied ? '已复制' : '复制'}
              </button>
              <span className={`lobby-conn lobby-conn-${conn}`}>{CONN_TEXT[conn] ?? conn}</span>
            </div>

            <div className="lobby-seats">
              {lobby.seats.map((s) => (
                <div
                  key={s.seat}
                  className={`lobby-seat ${s.seat === lobby.you ? 'lobby-seat-you' : ''} ${s.isAI ? 'lobby-seat-ai' : ''}`}
                >
                  <span className="lobby-seat-no">座位 {s.seat + 1}</span>
                  <span className="lobby-seat-name">
                    {s.name}
                    {s.seat === lobby.you && ' · 你'}
                  </span>
                  <span className="lobby-seat-tag">
                    {s.isAI ? 'AI 补位' : s.connected ? '在线' : '掉线'}
                  </span>
                </div>
              ))}
            </div>

            <p className="lobby-hint">
              已入座真人 {humans} 人，其余座位由 AI 补位。把房间号发给朋友，他们用同一房间号即可加入。
            </p>

            {netError && <p className="lobby-error">{netError}</p>}

            <div className="lobby-btns">
              {!lobby.started && lobby.host && (
                <button className="start-go" type="button" onClick={startRoom}>
                  开始对局（空位转 AI）
                </button>
              )}
              {!lobby.started && !lobby.host && <span className="lobby-wait">等待房主开始…</span>}
              {lobby.started && <span className="lobby-wait">对局进行中 · 正在同步…</span>}
              <button className="btn btn-ghost" type="button" onClick={leaveRoom}>
                离开房间
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
