import { PlayerView } from '../engine/types';
import { useGame } from '../store/gameStore';
import { ActionBar } from './ActionBar';
import { Center } from './Center';
import { Coach } from './Coach';
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
  const tutorial = useGame((s) => s.tutorial);
  const over = view.prompt.kind === 'over';

  return (
    <div className="table">
      <SideRivers />
      <PlayToast view={view} />
      <FlyCards />
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
