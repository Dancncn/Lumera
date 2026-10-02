import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { createGame, DEFAULT_CONFIG, viewFor } from '../../src/engine/game';
import type { ClientMsg, ServerMsg, SyncMsg } from '../../src/net/protocol';

function initialView() {
  return viewFor(createGame({ ...DEFAULT_CONFIG, players: 2, seed: 42 }, [
    { name: '玩家', isAI: false }, { name: '对手', isAI: false },
  ], 0).state, 0);
}

async function enterRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '联机对战', exact: true }).click();
  await page.getByPlaceholder('房间号（留空自动生成）').fill('test-room');
  await page.getByRole('button', { name: '进入房间', exact: true }).click();
}

async function roomServer(page: Page, host = true) {
  const sockets: WebSocketRoute[] = [];
  const commands: ClientMsg[] = [];
  const view = initialView();
  const joined: ServerMsg = {
    t: 'joined', roomId: 'test-room', you: 0, capacity: 2, host, started: true,
    seats: view.players.map((p) => ({ seat: p.seat, name: p.name, isAI: p.isAI, connected: true })),
    weather: false, weatherChance: 0.28,
  };
  let autoSync = true;
  await page.routeWebSocket('**/ws', (ws) => {
    sockets.push(ws);
    ws.onMessage((data) => {
      const msg: ClientMsg = JSON.parse(String(data));
      commands.push(msg);
      if (msg.t === 'join') {
        ws.send(JSON.stringify(joined));
        if (autoSync) ws.send(JSON.stringify({ t: 'sync', view, events: [] }));
      }
    });
  });
  return {
    view, commands, sockets,
    setAutoSync(value: boolean) { autoSync = value; },
    setStarted(value: boolean) { joined.started = value; },
    send(msg: ServerMsg) { sockets.at(-1)!.send(JSON.stringify(msg)); },
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('lumera-sfx', '0'); } catch { /* storage-denial tests */ } });
  await page.route('**/stats', (route) => route.fulfill({ json: { online: 1, games: 0 } }));
  await page.route('**/beat?*', (route) => route.fulfill({ body: 'ok' }));
});

test('a rejected join displays the error and lets the player return to the menu', async ({ page }) => {
  await page.routeWebSocket('**/ws', (ws) => {
    ws.onMessage(() => ws.send(JSON.stringify({ t: 'error', message: '房间已满' })));
  });
  await enterRoom(page);
  await expect(page.getByRole('alert')).toHaveText('房间已满');
  await page.getByRole('button', { name: '离开房间', exact: true }).click();
  await expect(page.getByRole('button', { name: '涌出 · 入局', exact: true })).toBeVisible();
});

test('a disconnected game blocks input until resynced and displays command errors', async ({ page }) => {
  await page.clock.install();
  const server = await roomServer(page);
  await enterRoom(page);
  await expect(page.getByRole('button', { name: '摸一张', exact: true })).toBeEnabled();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  server.setAutoSync(false);
  server.sockets[0].close({ code: 1012, reason: 'test disconnect' });
  await expect(page.getByRole('status')).toContainText('连接已断开');
  await expect(page.getByRole('button', { name: '摸一张', exact: true })).toBeDisabled();
  await page.keyboard.press('w');
  expect(server.commands.filter((m) => m.t === 'cmd')).toHaveLength(0);
  await page.clock.runFor(600);
  await expect.poll(() => server.sockets.length).toBe(2);
  // A joined message alone must not re-enable the stale game snapshot.
  await expect(page.getByRole('button', { name: '摸一张', exact: true })).toBeDisabled();
  server.send({ t: 'sync', view: server.view, events: [] });
  await expect(page.getByRole('button', { name: '摸一张', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '摸一张', exact: true }).click();
  await expect.poll(() => server.commands.filter((m) => m.t === 'cmd').length).toBe(1);
  server.send({ t: 'error', message: '还没轮到你' });
  await expect(page.getByRole('alert')).toHaveText(/还没轮到你/);
});

test('new syncs never roll back after a dice animation and duplicate syncs do not replay it', async ({ page }) => {
  await page.clock.install();
  const server = await roomServer(page);
  await enterRoom(page);
  await expect(page.locator('.table')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const rolled: SyncMsg = { t: 'sync', view: { ...server.view, deckCount: 41 }, events: [
    { type: 'DiceRolled', seat: 0, chosen: [1], rolled: [2], hit: false },
  ] };
  server.send(rolled);
  await expect(page.locator('.dice-spotlight')).toBeVisible();
  await page.clock.runFor(1000);
  server.send({ t: 'sync', view: { ...server.view, deckCount: 40 }, events: [] });
  await expect(page.locator('.deck-label')).toHaveText('牌库 40');
  await page.clock.runFor(4000);
  await expect(page.locator('.deck-label')).toHaveText('牌库 40');
  await expect(page.locator('.dice-spotlight')).not.toBeVisible();

  // The server can resend the same event batch just to update the deadline.
  const secondRoll = { ...rolled, view: { ...server.view, deckCount: 39 } };
  server.send(secondRoll);
  await expect(page.locator('.dice-spotlight')).toBeVisible();
  await page.clock.runFor(1500);
  server.send({ ...secondRoll, view: { ...secondRoll.view,
    players: secondRoll.view.players.map((p) => p.seat === 1 ? { ...p, isAI: true } : p),
  }, turnDeadline: Date.now() + 20_000 });
  await page.clock.runFor(2500);
  await expect(page.locator('.dice-spotlight')).not.toBeVisible();
  await expect(page.locator('.deck-label')).toHaveText('牌库 39');
});

test('only the room host can restart from the game-over screen', async ({ page }) => {
  const server = await roomServer(page, false);
  await enterRoom(page);
  await expect(page.locator('.table')).toBeVisible();
  server.send({ t: 'sync', events: [], view: { ...server.view, prompt: { kind: 'over' }, ranking: [
    { seat: 0, name: '玩家', score: 2, scoredCount: 2, livesLost: 0, out: false },
    { seat: 1, name: '对手', score: 0, scoredCount: 0, livesLost: 0, out: false },
  ] } });
  await expect(page.getByText('等待房主开始下一局')).toBeVisible();
  await expect(page.getByRole('button', { name: '再来一局', exact: true })).toHaveCount(0);
  server.send({ t: 'room', roomId: 'test-room', capacity: 2, started: true,
    hostSeat: 0, seats: [], weather: false, weatherChance: 0.28 });
  await page.getByRole('button', { name: '再来一局', exact: true }).click();
  await expect.poll(() => server.commands.filter((m) => m.t === 'restart').length).toBe(1);
});

test('leaving a tutorial stage cancels its delayed commands before a new game', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: '新手引导 · 带你走一遍', exact: true }).click();
  await page.locator('.lesson-dot').last().click();
  await page.getByRole('button', { name: '开始练习 →', exact: true }).click();
  await page.getByRole('button', { name: '开始 →', exact: true }).click();
  await expect(page.locator('.stage-guide')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(page.getByText('等待 Aurel · 对手 行动…')).toBeVisible();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('button', { name: '确认退出', exact: true }).click();
  await expect(page.locator('.start-tabs')).toBeVisible();

  // Arrange a deterministic new game through its public command API. A normal AI
  // cannot accept within 1s; the previous tutorial's queued Accept used to do so.
  await page.evaluate(async () => {
    Math.random = () => 0.99;
    const { useGame } = await import('/src/store/gameStore.ts');
    const { buildTutorialDeck } = await import('/src/engine/game.ts');
    useGame.getState().newGame(2, 'easy', 0, buildTutorialDeck(), false);
  });
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  const before = await page.evaluate(async () => (await import('/src/store/gameStore.ts')).useGame.getState().state?.phase.kind);
  expect(before).toBe('respond');
  await page.clock.runFor(1000);
  const after = await page.evaluate(async () => (await import('/src/store/gameStore.ts')).useGame.getState().state?.phase.kind);
  expect(after).toBe('respond');
});

test('restarting during a tutorial stage resumes normal AI play', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: '新手引导 · 带你走一遍', exact: true }).click();
  await page.locator('.lesson-dot').last().click();
  await page.getByRole('button', { name: '开始练习 →', exact: true }).click();
  await page.getByRole('button', { name: '开始 →', exact: true }).click();
  await expect(page.locator('.stage-guide')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  // A deterministic fresh game with the AI moving first exercises the same public
  // newGame action used by the visible restart button.
  await page.evaluate(async () => {
    const { useGame } = await import('/src/store/gameStore.ts');
    const { buildTutorialDeck } = await import('/src/engine/game.ts');
    useGame.getState().newGame(2, 'easy', 1, buildTutorialDeck(), false);
  });
  await expect(page.locator('.stage-guide')).toHaveCount(0);
  await page.clock.runFor(4000);
  await expect(page.getByRole('button', { name: /放行/ })).toBeVisible();
});

test('joining still works with blocked browser storage and keeps a cryptographic session token', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
    });
  });
  const server = await roomServer(page);
  await enterRoom(page);
  await expect(page.locator('.table')).toBeVisible();
  const first = server.commands.find((m) => m.t === 'join');
  expect(first?.token).toMatch(/^[0-9a-f]{64}$/);
  const again = await page.evaluate(async () => (await import('/src/net/client.ts')).loadToken());
  expect(again).toBe(first?.token);
});

test('new identity tokens use browser crypto and survive a page reload', async ({ page }) => {
  await page.goto('/');
  const token = await page.evaluate(async () => {
    const original = Math.random;
    Math.random = () => { throw new Error('Identity tokens must not use Math.random'); };
    try { return (await import('/src/net/client.ts')).loadToken(); }
    finally { Math.random = original; }
  });
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  await page.reload();
  expect(await page.evaluate(async () => (await import('/src/net/client.ts')).loadToken())).toBe(token);
});

test('a replaced connection stops reconnecting instead of fighting another tab', async ({ page }) => {
  await page.clock.install();
  const server = await roomServer(page);
  await enterRoom(page);
  await expect(page.locator('.table')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  server.sockets[0].close({ code: 4001, reason: 'replaced' });
  await expect(page.getByRole('alert')).toContainText('此座位已在其他页面连接');
  await expect(page.getByRole('status')).toContainText('连接已结束');
  await expect(page.getByRole('button', { name: '摸一张', exact: true })).toBeDisabled();
  await page.clock.fastForward(10_000);
  expect(server.sockets).toHaveLength(1);
});

test('reconnecting to a recreated room returns to its lobby instead of the stale game', async ({ page }) => {
  await page.clock.install();
  const server = await roomServer(page);
  await enterRoom(page);
  await expect(page.locator('.table')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  server.setAutoSync(false);
  server.setStarted(false);
  server.sockets[0].close({ code: 1012, reason: 'server restarted' });
  await expect(page.getByRole('status')).toContainText('连接已断开');
  await page.clock.runFor(600);
  await expect(page.getByRole('button', { name: '开始对局（空位转 AI）', exact: true })).toBeEnabled();
  await expect(page.locator('.table')).toHaveCount(0);
});

test('a dice overlay finishes when newer events clear lastDie and cancels on leaving', async ({ page }) => {
  await page.clock.install();
  const server = await roomServer(page);
  await enterRoom(page);
  await expect(page.locator('.table')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const roll: SyncMsg = { t: 'sync', view: server.view, events: [
    { type: 'DiceRolled', seat: 0, chosen: [1], rolled: [2], hit: false },
  ] };
  server.send(roll);
  await expect(page.locator('.dice-spotlight')).toBeVisible();
  await page.clock.runFor(1000);
  server.send({ t: 'sync', view: server.view, events: [{ type: 'PenaltyStarted', seat: 1, rolls: 1 }] });
  await expect(page.locator('.dice-spotlight')).toBeVisible();
  await page.clock.runFor(3000);
  await expect(page.locator('.dice-spotlight')).toHaveCount(0);
  server.send(roll);
  await expect(page.locator('.dice-spotlight')).toBeVisible();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('button', { name: '确认退出', exact: true }).click();
  await page.clock.fastForward(10_000);
  await expect(page.locator('.dice-spotlight')).toHaveCount(0);
  await expect(page.locator('.start-tabs')).toBeVisible();
});

test('restarting a local game immediately clears its previous dice overlay', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.evaluate(async () => {
    const { useGame } = await import('/src/store/gameStore.ts');
    const { buildTutorialDeck } = await import('/src/engine/game.ts');
    const game = useGame.getState();
    game.newGame(2, 'easy', 0, buildTutorialDeck(), false);
    const card = useGame.getState().state!.players[0].hand.find((c) => c.kind === 'number')!;
    game.stageCmd(0, { type: 'PlayCard', cardId: card.id, claim: { color: 'selvar', num: 1 } });
    game.stageCmd(1, { type: 'Challenge' });
  });
  await expect(page.locator('.penalty-roll')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(page.locator('.dice-spotlight')).toBeVisible();
  await page.getByRole('button', { name: '重开', exact: true }).click();
  await expect(page.locator('.dice-spotlight')).toHaveCount(0);
});

test('an online next round clears the previous round dice animation', async ({ page }) => {
  await page.clock.install();
  const server = await roomServer(page);
  await enterRoom(page);
  await expect(page.locator('.table')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  server.send({ t: 'sync', view: { ...server.view, prompt: { kind: 'over' }, ranking: [
    { seat: 0, name: '玩家', score: 2, scoredCount: 2, livesLost: 0, out: false },
  ] }, events: [{ type: 'DiceRolled', seat: 0, chosen: [1], rolled: [2], hit: false }] });
  await expect(page.locator('.dice-spotlight')).toBeVisible();
  await page.getByRole('button', { name: '再来一局', exact: true }).click();
  server.send({ t: 'sync', view: server.view, events: [{ type: 'TurnStarted', seat: 0, isFirst: true }] });
  await expect(page.locator('.gameover')).toHaveCount(0);
  await expect(page.locator('.dice-spotlight')).toHaveCount(0);
});
