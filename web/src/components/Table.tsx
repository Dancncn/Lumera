import { useState } from 'react';
import { PlayerView } from '../engine/types';
import { useGame } from '../store/gameStore';
import { ActionBar } from './ActionBar';
import { Center } from './Center';
import { Coach } from './Coach';
import { EventFx } from './EventFx';
import { FloatingLog } from './FloatingLog';
import { FlyCards } from './FlyCards';
import { Emblem } from './Emblem';
import { GameOver } from './GameOver';
import { SideRivers } from './MeteorShower';
import { PlayToast } from './PlayToast';
import { RulesButton } from './RulesModal';
import { Seats, SelfPlate } from './Seats';

export function Table({ view }: { view: PlayerView }) {
  const newGame = useGame((s) => s.newGame);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const tutorial = useGame((s) => s.tutorial);
  const over = view.prompt.kind === 'over';
  const [confirmQuit, setConfirmQuit] = useState(false);

  return (
    <div className="table">
      <SideRivers />
      <PlayToast view={view} />
      <FlyCards />
      <EventFx view={view} />
      {tutorial && <Coach view={view} />}
      <header className="topbar">
        <div className="brand">
          <Emblem className="brand-emblem" />
          <span className="brand-text">
            源河 · <i>Lumera</i>
          </span>
        </div>
        <div className="topbar-right">
          <RulesButton />
          <button className="btn btn-ghost" type="button" onClick={() => newGame(view.players.length)}>
            重开
          </button>
          {confirmQuit ? (
            <span className="quit-confirm">
              <span className="quit-ask">退出本局？</span>
              <button className="btn btn-danger" type="button" onClick={quitToMenu}>
                确认退出
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setConfirmQuit(false)}>
                取消
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost" type="button" onClick={() => setConfirmQuit(true)}>
              退出
            </button>
          )}
        </div>
      </header>

      <main className="board">
        <Seats view={view} />
        <div className="table-center">
          <div className="cloth">
            <Center view={view} />
          </div>
        </div>
        <div className="action-zone">
          <SelfPlate view={view} />
          <ActionBar view={view} />
        </div>
      </main>

      <FloatingLog view={view} />
      {over && <GameOver view={view} />}
    </div>
  );
}
