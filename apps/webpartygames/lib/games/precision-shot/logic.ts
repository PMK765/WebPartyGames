import type { PrecisionShotRoundResult, PrecisionShotState } from "./types";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randIntInclusive(seed: string, min: number, max: number) {
  const h = hashSeed(seed);
  const span = max - min + 1;
  return min + (h % span);
}

function computeTarget(roomId: string, round: number) {
  return randIntInclusive(`${roomId}:target:${round}`, 0, 100);
}

function computeChaos(roomId: string, round: number, playerId: string) {
  return randIntInclusive(`${roomId}:chaos:${round}:${playerId}`, -12, 12);
}

export function createInitialState(roomId: string, hostId: string): PrecisionShotState {
  return {
    phase: "lobby",
    roomId,
    hostId,
    targetValue: 50,
    round: 0,
    maxRounds: 5,
    players: [],
    currentChoices: [],
    results: [],
    totalScores: {}
  };
}

export function addPlayer(
  state: PrecisionShotState,
  playerId: string,
  name: string,
  credits = 0
) {
  if (state.players.some((p) => p.id === playerId)) return state;
  if (state.players.length >= 6) return state;

  return {
    ...state,
    players: [
      ...state.players,
      {
        id: playerId,
        name,
        credits: clampInt(credits, 0, 1_000_000),
        score: 0
      }
    ],
    totalScores: { ...state.totalScores, [playerId]: state.totalScores[playerId] ?? 0 }
  };
}

export function removePlayer(state: PrecisionShotState, playerId: string) {
  if (!state.players.some((p) => p.id === playerId)) return state;

  const { [playerId]: _removed, ...restScores } = state.totalScores;

  const nextPlayers = state.players.filter((p) => p.id !== playerId);
  const nextHostId =
    state.hostId === playerId ? (nextPlayers[0]?.id ?? state.hostId) : state.hostId;

  return {
    ...state,
    hostId: nextHostId,
    players: nextPlayers,
    currentChoices: state.currentChoices.filter((c) => c.playerId !== playerId),
    results: state.results.filter((r) => r.playerId !== playerId),
    totalScores: restScores
  };
}

export function startRound(state: PrecisionShotState) {
  const nextRound = clampInt(state.round + 1, 1, state.maxRounds);
  const targetValue = computeTarget(state.roomId, nextRound);

  return {
    ...state,
    phase: "choosingPower",
    round: nextRound,
    targetValue,
    currentChoices: [],
    results: []
  };
}

export function setPlayerPower(
  state: PrecisionShotState,
  playerId: string,
  power: number
): PrecisionShotState {
  if (state.phase !== "choosingPower") return state;
  if (!state.players.some((p) => p.id === playerId)) return state;

  const nextPower = clampInt(power, 0, 100);
  const without = state.currentChoices.filter((c) => c.playerId !== playerId);
  const currentChoices = [...without, { playerId, power: nextPower }];

  if (currentChoices.length < state.players.length) {
    return { ...state, currentChoices };
  }

  const byId = new Map(currentChoices.map((c) => [c.playerId, c.power]));

  const results: PrecisionShotRoundResult[] = state.players.map((p) => {
    const chosenPower = byId.get(p.id) ?? 0;
    const chaos = computeChaos(state.roomId, state.round, p.id);
    const finalPower = clampInt(chosenPower + chaos, 0, 100);
    const distance = Math.abs(finalPower - state.targetValue);
    return {
      playerId: p.id,
      chosenPower,
      chaos,
      finalPower,
      distance,
      pointsAwarded: 0
    };
  });

  const bestDistance = results.reduce(
    (min, r) => Math.min(min, r.distance),
    Number.POSITIVE_INFINITY
  );
  const winners = results.filter((r) => r.distance === bestDistance).map((r) => r.playerId);

  const totalScores: Record<string, number> = { ...state.totalScores };
  for (const winnerId of winners) {
    totalScores[winnerId] = (totalScores[winnerId] ?? 0) + 1;
  }

  const resultsWithPoints = results.map((r) => ({
    ...r,
    pointsAwarded: winners.includes(r.playerId) ? 1 : 0
  }));

  const players = state.players.map((p) => ({
    ...p,
    score: totalScores[p.id] ?? 0
  }));

  return {
    ...state,
    phase: "revealing",
    currentChoices,
    results: resultsWithPoints,
    totalScores,
    players
  };
}

export function nextAfterReveal(state: PrecisionShotState) {
  if (state.phase !== "revealing") return state;
  if (state.round >= state.maxRounds) return { ...state, phase: "finished" };
  return startRound(state);
}


