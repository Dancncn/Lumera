import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, createGame, GameError, isLegalClaim, legalClaims, viewFor } from '../src/engine/game';
import { COLORS, DEFAULT_CONFIG, type Claim, type Command } from '../src/engine/types';

function penaltyGame() {
  let { state } = createGame({ ...DEFAULT_CONFIG, players: 2, seed: 42 });
  assert.equal(state.phase.kind, 'play');
  if (state.phase.kind !== 'play') throw new Error('Expected opening turn');
  const actor = state.phase.current;
  const card = state.players[actor].hand.find(c => c.kind !== 'functional')!;
  const claim = legalClaims(null, true)[0];
  state = apply(state, actor, { type: 'PlayCard', cardId: card.id, claim }).state;
  state = apply(state, 1 - actor, { type: 'Challenge' }).state;
  assert.equal(state.phase.kind, 'penalty');
  return state;
}

test('penalty rejects fractional, coerced and malformed dice selections without changing state', () => {
  const state = penaltyGame();
  if (state.phase.kind !== 'penalty') throw new Error('Expected penalty');
  const before = structuredClone(state);
  const malformed: unknown[] = [[1.5], ['1'], [null], [NaN], [Infinity], [0], [7], [], [1, 1], null];
  for (const ns of malformed) {
    assert.throws(() => apply(state, state.phase.kind === 'penalty' ? state.phase.roller : -1,
      { type: 'ChooseNumber', ns } as Command), GameError, `Accepted ${JSON.stringify(ns)}`);
    assert.deepEqual(state, before);
  }
});

test('valid dice selections still follow the seeded result and preserve the input', () => {
  const state = penaltyGame();
  if (state.phase.kind !== 'penalty') throw new Error('Expected penalty');
  const before = structuredClone(state);
  const command: Command = { type: 'ChooseNumber', ns: [1] };
  const a = apply(state, state.phase.roller, command);
  const b = apply(state, state.phase.roller, command);
  assert.deepEqual(a, b);
  assert.deepEqual(state, before);
  assert.ok(a.events.some(e => e.type === 'DiceRolled'));
});

test('claims require a real color and an integer rank, including the opening turn', () => {
  for (const claim of [null, {}, { color: 'unknown', num: 1 }, { color: COLORS[0], num: 1.5 },
    { color: COLORS[0], num: '1' }, { color: COLORS[0], num: NaN }]) {
    assert.equal(isLegalClaim(null, claim as Claim, true), false);
  }
  for (const claim of legalClaims(null, true)) assert.equal(isLegalClaim(null, claim, true), true);
});

test('malformed commands fail as game errors rather than runtime exceptions', () => {
  const { state } = createGame({ ...DEFAULT_CONFIG, players: 2, seed: 42 });
  if (state.phase.kind !== 'play') throw new Error('Expected opening turn');
  for (const command of [null, [], {}, { type: 'Unknown' }, { type: 'PlayCard', cardId: 0, claim: null }]) {
    assert.throws(() => apply(state, state.phase.kind === 'play' ? state.phase.current : -1, command as Command), GameError);
  }
});

test('only one surviving player ends the game at the next turn boundary', () => {
  const state = penaltyGame();
  if (state.phase.kind !== 'penalty') throw new Error('Expected penalty');
  const roller = state.phase.roller;
  state.players[roller].lives = 1;
  state.phase.rollsRemaining = 6;
  const result = apply(state, roller, { type: 'ChooseNumber', ns: [1, 2, 3, 4, 5, 6] });
  assert.equal(result.state.phase.kind, 'over');
  assert.equal(result.state.players.filter(p => !p.out).length, 1);
  assert.equal(viewFor(result.state, roller).ranking?.length, 2);
});
