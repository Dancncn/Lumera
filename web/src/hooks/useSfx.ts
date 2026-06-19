import { useEffect, useRef } from 'react';
import { GameEvent } from '../engine/types';
import { sfx } from '../sfx';
import { useGame } from '../store/gameStore';
import { useMyView } from '../store/gameStore';

export function useSfx() {
  const events = useGame((s) => s.lastEvents);
  const view = useMyView();
  const prevRef = useRef(events);

  useEffect(() => {
    if (events === prevRef.current || events.length === 0) return;
    prevRef.current = events;

    if (has(events, 'GameOver')) {
      sfx.gameOver();
      return;
    }
    if (has(events, 'PlayerOut')) {
      sfx.playerOut();
      return;
    }
    if (has(events, 'RanOut')) {
      sfx.runOut();
      return;
    }
    if (has(events, 'Returned')) {
      sfx.lifeDown();
      return;
    }

    const dice = events.find((e) => e.type === 'DiceRolled') as
      | Extract<GameEvent, { type: 'DiceRolled' }>
      | undefined;
    if (dice) {
      sfx.diceRoll();
      setTimeout(() => (dice.hit ? sfx.diceHit() : sfx.diceMiss()), 1700);
      return;
    }

    if (has(events, 'WeatherChanged')) {
      sfx.weatherChange();
      return;
    }
    if (has(events, 'WeatherBonus')) {
      sfx.weatherBonus();
      return;
    }
    if (has(events, 'WeatherTriggered')) {
      sfx.weatherTrigger();
      // 不 return：触发禁制/转向后同批还有 CardPlayed 等事件，继续匹配
    }

    if (has(events, 'CardRevealed')) {
      sfx.reveal();
      return;
    }
    if (has(events, 'Challenged')) {
      sfx.challenge();
      return;
    }

    const func = events.find((e) => e.type === 'FunctionalPlayed') as
      | Extract<GameEvent, { type: 'FunctionalPlayed' }>
      | undefined;
    if (func && func.func === 'skip') {
      sfx.skip();
    }

    if (has(events, 'CardPlayed')) {
      sfx.cardPlay();
      return;
    }

    if (has(events, 'CardDrawn')) {
      sfx.draw();
      return;
    }

    const turn = events.find((e) => e.type === 'TurnStarted') as
      | Extract<GameEvent, { type: 'TurnStarted' }>
      | undefined;
    if (turn && view && turn.seat === view.you) {
      sfx.yourTurn();
    }
  }, [events, view]);
}

function has(events: GameEvent[], type: GameEvent['type']): boolean {
  return events.some((e) => e.type === type);
}
