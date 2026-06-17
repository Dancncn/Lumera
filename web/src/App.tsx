import { useGame, useMyView } from './store/gameStore';
import { StartScreen } from './components/StartScreen';
import { Table } from './components/Table';
import { Lobby } from './components/Lobby';

export default function App() {
  const mode = useGame((s) => s.mode);
  const view = useMyView();

  return (
    <div className="app">
      {view ? <Table view={view} /> : mode === 'online' ? <Lobby /> : <StartScreen />}
    </div>
  );
}
