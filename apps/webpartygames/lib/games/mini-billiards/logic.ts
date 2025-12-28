import type { Ball, MiniBilliardsState, Pocket } from "./types";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function clampAngle(angleDegrees: number) {
  const a = angleDegrees % 360;
  return a < 0 ? a + 360 : a;
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randUnit(seed: string) {
  return hashSeed(seed) / 0xffffffff;
}

function createPockets(table: { width: number; height: number }): Pocket[] {
  const r = 14;
  const w = table.width;
  const h = table.height;

  return [
    { id: "p1", x: 0, y: 0, radius: r },
    { id: "p2", x: w / 2, y: 0, radius: r },
    { id: "p3", x: w, y: 0, radius: r },
    { id: "p4", x: 0, y: h, radius: r },
    { id: "p5", x: w / 2, y: h, radius: r },
    { id: "p6", x: w, y: h, radius: r }
  ];
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function isBallPotted(ball: Ball, pockets: readonly Pocket[]) {
  return pockets.some((p) => distance(ball, p) <= p.radius);
}

function keepInBounds(ball: Ball, table: { width: number; height: number }) {
  return {
    ...ball,
    x: clamp(ball.x, ball.radius, table.width - ball.radius),
    y: clamp(ball.y, ball.radius, table.height - ball.radius)
  };
}

function getCueBall(state: MiniBilliardsState) {
  return state.balls.find((b) => b.type === "cue") ?? null;
}

function getTargets(state: MiniBilliardsState) {
  return state.balls.filter((b) => b.type === "target");
}

function findFirstHitTarget(
  cue: Ball,
  targets: readonly Ball[],
  dir: { x: number; y: number },
  travel: number
) {
  let best: { ball: Ball; t: number } | null = null;

  for (const b of targets) {
    const vx = b.x - cue.x;
    const vy = b.y - cue.y;
    const t = vx * dir.x + vy * dir.y;
    if (t < 0 || t > travel) continue;

    const px = cue.x + dir.x * t;
    const py = cue.y + dir.y * t;
    const d = Math.hypot(b.x - px, b.y - py);
    if (d > cue.radius + b.radius) continue;

    if (!best || t < best.t) best = { ball: b, t };
  }

  return best;
}

export function createInitialState(roomId: string, hostId: string): MiniBilliardsState {
  const table = { width: 320, height: 180 };
  const pockets = createPockets(table);

  const cueRadius = 8;
  const targetRadius = 7;

  const cue: Ball = {
    id: "cue",
    type: "cue",
    x: table.width * 0.25,
    y: table.height * 0.5,
    radius: cueRadius
  };

  const targets: Ball[] = Array.from({ length: 4 }, (_, idx) => {
    const seed = `${roomId}:targets:${idx}`;
    const rx = randUnit(`${seed}:x`);
    const ry = randUnit(`${seed}:y`);
    return {
      id: `t${idx + 1}`,
      type: "target",
      x: table.width * (0.55 + rx * 0.35),
      y: table.height * (0.15 + ry * 0.7),
      radius: targetRadius
    };
  });

  return {
    phase: "lobby",
    roomId,
    hostId,
    currentPlayerId: hostId,
    players: [],
    balls: [cue, ...targets],
    pockets,
    turnCount: 0,
    maxTurns: 16,
    table
  };
}

export function addPlayer(
  state: MiniBilliardsState,
  playerId: string,
  name: string,
  credits = 0
) {
  if (state.players.some((p) => p.id === playerId)) return state;
  if (state.players.length >= 4) return state;

  const nextPlayers = [
    ...state.players,
    { id: playerId, name, credits: Math.max(0, Math.round(credits)), score: 0 }
  ];

  const currentPlayerId = state.currentPlayerId || playerId;

  return { ...state, players: nextPlayers, currentPlayerId };
}

export function removePlayer(state: MiniBilliardsState, playerId: string) {
  if (!state.players.some((p) => p.id === playerId)) return state;
  const nextPlayers = state.players.filter((p) => p.id !== playerId);
  const nextHostId =
    state.hostId === playerId ? (nextPlayers[0]?.id ?? state.hostId) : state.hostId;

  const currentStillValid = nextPlayers.some((p) => p.id === state.currentPlayerId);
  const nextCurrent = currentStillValid ? state.currentPlayerId : (nextPlayers[0]?.id ?? state.currentPlayerId);

  return { ...state, hostId: nextHostId, players: nextPlayers, currentPlayerId: nextCurrent };
}

export function advanceToNextPlayer(state: MiniBilliardsState) {
  if (state.players.length === 0) return state;
  const idx = state.players.findIndex((p) => p.id === state.currentPlayerId);
  const nextIdx = idx >= 0 ? (idx + 1) % state.players.length : 0;
  return { ...state, currentPlayerId: state.players[nextIdx].id };
}

export function startGame(state: MiniBilliardsState) {
  if (state.players.length < 2) return state;
  return { ...state, phase: "aiming", currentPlayerId: state.hostId };
}

export function applyShot(state: MiniBilliardsState, angleDegrees: number, power: number) {
  if (state.phase !== "aiming") return state;

  const cue = getCueBall(state);
  if (!cue) return state;

  const angle = clampAngle(angleDegrees);
  const p = clamp(power, 0, 100);
  const travel = (p / 100) * 140;

  const rad = degToRad(angle);
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };

  const targets = getTargets(state);
  const hit = findFirstHitTarget(cue, targets, dir, travel);

  const movedCue: Ball = keepInBounds(
    {
      ...cue,
      x: cue.x + dir.x * travel,
      y: cue.y + dir.y * travel
    },
    state.table
  );

  let balls = state.balls.map((b) => (b.id === cue.id ? movedCue : b));

  if (hit) {
    const remaining = Math.max(0, travel - hit.t);
    const scatter = (randUnit(`${state.roomId}:scatter:${state.turnCount}:${hit.ball.id}`) - 0.5) * 0.6;
    const scatterRad = degToRad(angle + scatter * 90);
    const push = clamp(remaining * 0.65, 18, 90);
    const pushDir = { x: Math.cos(scatterRad), y: Math.sin(scatterRad) };

    balls = balls.map((b) => {
      if (b.id !== hit.ball.id) return b;
      return keepInBounds(
        {
          ...b,
          x: b.x + pushDir.x * push,
          y: b.y + pushDir.y * push
        },
        state.table
      );
    });
  }

  const cueAfter = balls.find((b) => b.type === "cue") ?? movedCue;
  const targetsAfter = balls.filter((b) => b.type === "target");

  const pottedTargets = targetsAfter.filter((b) => isBallPotted(b, state.pockets)).map((b) => b.id);
  const cuePotted = isBallPotted(cueAfter, state.pockets);

  balls = balls.filter((b) => {
    if (b.type === "target") return !pottedTargets.includes(b.id);
    if (b.type === "cue") return true;
    return true;
  });

  if (cuePotted) {
    balls = balls.map((b) =>
      b.type === "cue"
        ? { ...b, x: state.table.width * 0.25, y: state.table.height * 0.5 }
        : b
    );
  }

  const targetPoints = pottedTargets.length;
  const cuePenalty = cuePotted ? 1 : 0;

  const players = state.players.map((pl) => {
    if (pl.id !== state.currentPlayerId) return pl;
    const nextScore = Math.max(0, pl.score + targetPoints - cuePenalty);
    return { ...pl, score: nextScore };
  });

  const nextTurnCount = state.turnCount + 1;
  const remainingTargets = balls.filter((b) => b.type === "target").length;

  if (remainingTargets === 0 || nextTurnCount >= state.maxTurns) {
    return {
      ...state,
      phase: "finished",
      balls,
      players,
      turnCount: nextTurnCount
    };
  }

  const advanced = advanceToNextPlayer({ ...state, players, balls, turnCount: nextTurnCount });

  return { ...advanced, phase: "aiming" };
}


