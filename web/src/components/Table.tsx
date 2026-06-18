import { useState } from 'react';
import { PlayerView } from '../engine/types';
import { useT } from '../i18n';
import { useSfx } from '../hooks/useSfx';
import { sfx } from '../sfx';
import { useGame } from '../store/gameStore';
import { ActionArrows } from './ActionArrows';
import { ActionBar } from './ActionBar';
import { Center } from './Center';
import { Coach } from './Coach';
import { EventFx } from './EventFx';
import { LangSwitch } from './LangSwitch';
import { FloatingLog } from './FloatingLog';
import { FlyCards } from './FlyCards';
import { Emblem } from './Emblem';
import { GameOver } from './GameOver';
import { SideRivers } from './MeteorShower';
import { PlayToast } from './PlayToast';
import { RulesButton } from './RulesModal';
import { Seats, SelfPlate } from './Seats';

function SfxToggle() {
  const [on, setOn] = useState(sfx.enabled);
  const { t } = useT();
  return (
    <button
      className={`btn btn-ghost btn-icon sfx-toggle ${on ? '' : 'sfx-off'}`}
      type="button"
      title={on ? t('关闭音效') : t('开启音效')}
      onClick={() => setOn(sfx.toggle())}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {on ? (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5a9 9 0 0 1 0 14" />
          </>
        ) : (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        )}
      </svg>
    </button>
  );
}

export function Table({ view }: { view: PlayerView }) {
  useSfx();
  const newGame = useGame((s) => s.newGame);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const mode = useGame((s) => s.mode);
  const tutorial = useGame((s) => s.tutorial);
  const notice = useGame((s) => s.notice);
  const { t } = useT();
  const over = view.prompt.kind === 'over';
  const [confirmQuit, setConfirmQuit] = useState(false);

  return (
    <div className="table">
      <SideRivers />
      <PlayToast view={view} />
      {notice && <div className="leave-toast">{notice}</div>}
      <FlyCards />
      <ActionArrows view={view} />
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
          <SfxToggle />
          <LangSwitch />
          <RulesButton />
          {mode !== 'online' && (
            <button className="btn btn-ghost btn-icon" type="button" onClick={() => newGame(view.players.length)} title={t('重开')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 11.5a8 8 0 1 0-2 5" />
                <path d="M20 5.5v5h-5" />
              </svg>
              <span className="btn-label">{t('重开')}</span>
            </button>
          )}
          {confirmQuit ? (
            <span className="quit-confirm">
              <span className="quit-ask">{t('退出本局？')}</span>
              <button className="btn btn-danger" type="button" onClick={quitToMenu}>
                {t('确认退出')}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setConfirmQuit(false)}>
                {t('取消')}
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost btn-icon" type="button" onClick={() => setConfirmQuit(true)} title={t('退出')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
                <path d="M10 8.5l-3.5 3.5L10 15.5" />
                <path d="M16.5 12H7" />
              </svg>
              <span className="btn-label">{t('退出')}</span>
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
