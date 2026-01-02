import type { Card, Rank, Suit, WarBattleState, WarState } from "./types";

const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicShuffle<T>(items: readonly T[], seed: string) {
  const arr = [...items];
  let h = hashSeed(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const j = h % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function createInitialState(roomId: string, hostId: string): WarState {
  return {
    roomId,
    hostId,
    phase: "lobby",
    players: [],
    piles: {},
    round: 0,
    ready: {},
    revealNonce: 0,
    revealAt: null,
    battle: { step: "idle", faceUp: {}, warDepth: 0, pot: [], winnerId: null, message: null }
  };
}

export function addOrUpdatePlayer(
  state: WarState,
  player: { id: string; name: string; credits: number }
): WarState {
  const existing = state.players.find((p) => p.id === player.id);
  if (!existing && state.players.length >= 2) return state;
  const nextPlayers = existing
    ? state.players.map((p) =>
        p.id === player.id ? { ...p, name: player.name, credits: player.credits } : p
      )
    : [...state.players, { ...player, wonCards: 0 }];

  const ready = state.ready[player.id] ? state.ready : { ...state.ready, [player.id]: false };
  return { ...state, players: nextPlayers, ready };
}

export function removePlayer(state: WarState, playerId: string): WarState {
  if (!state.players.some((p) => p.id === playerId)) return state;
  const nextPlayers = state.players.filter((p) => p.id !== playerId);
  const hostId = state.hostId === playerId ? (nextPlayers[0]?.id ?? state.hostId) : state.hostId;
  return { ...state, hostId, players: nextPlayers };
}

function emptyBattle(): WarBattleState {
  return { step: "idle", faceUp: {}, warDepth: 0, pot: [], winnerId: null, message: null };
}

export function canStart(state: WarState) {
  return state.players.length >= 2;
}

export function startGame(state: WarState): WarState {
  if (state.phase !== "lobby") return state;
  if (!canStart(state)) return state;
  if (state.players.length !== 2) return state;

  const deck = deterministicShuffle(buildDeck(), `${state.roomId}:war`);
  const [a, b] = state.players;
  const aId = a?.id ?? "a";
  const bId = b?.id ?? "b";
  const piles: Record<string, Card[]> = { [aId]: [], [bId]: [] };
  for (let i = 0; i < deck.length; i += 1) {
    const card = deck[i];
    if (!card) continue;
    const owner = i % 2 === 0 ? aId : bId;
    piles[owner] = [...(piles[owner] ?? []), card];
  }
  return {
    ...state,
    phase: "playing",
    round: 0,
    piles,
    ready: Object.fromEntries(state.players.map((p) => [p.id, false])),
    revealNonce: 0,
    revealAt: null,
    players: state.players.map((p) => ({ ...p, wonCards: 0 })),
    battle: emptyBattle()
  };
}

function rankValue(card: Card) {
  return card.rank;
}

function compareFaceUp(faceUp: Record<string, Card | null>, aId: string, bId: string) {
  const a = faceUp[aId];
  const b = faceUp[bId];
  if (!a || !b) return { winnerId: null, tied: true };
  const av = rankValue(a);
  const bv = rankValue(b);
  if (av === bv) return { winnerId: null, tied: true };
  return { winnerId: av > bv ? aId : bId, tied: false };
}

function shiftOne(pile: readonly Card[]) {
  const card = pile[0] ?? null;
  const rest = pile.slice(1);
  return { card, rest };
}

function takeMany(pile: readonly Card[], count: number) {
  const taken: Card[] = [];
  let rest = pile.slice(0);
  for (let i = 0; i < count; i += 1) {
    const next = shiftOne(rest);
    if (!next.card) return { taken, rest, ok: false };
    taken.push(next.card);
    rest = next.rest;
  }
  return { taken, rest, ok: true };
}

export function revealForPlayer(state: WarState, playerId: string): WarState {
  if (state.phase !== "playing") return state;
  const players = state.players.slice(0, 2);
  if (players.length !== 2) return state;
  if (!players.some((p) => p.id === playerId)) return state;
  if (state.ready[playerId] === true) return state;

  const aId = players[0]?.id ?? null;
  const bId = players[1]?.id ?? null;
  if (!aId || !bId) return state;

  const step = state.battle.step;
  const faceUp = { ...state.battle.faceUp };
  if (faceUp[playerId]) {
    return markReady(state, playerId);
  }

  const piles = { ...state.piles };
  const pot = [...state.battle.pot];

  if (step === "idle" || step === "resolved") {
    const take = shiftOne(piles[playerId] ?? []);
    if (!take.card) return state;
    piles[playerId] = take.rest;
    pot.push(take.card);
    faceUp[playerId] = take.card;
    return {
      ...markReady(state, playerId),
      piles,
      battle: { ...state.battle, step: "battle", faceUp, pot }
    };
  }

  if (step === "war") {
    const burn = takeMany(piles[playerId] ?? [], 3);
    if (!burn.ok) return state;
    pot.push(...burn.taken);
    const flip = shiftOne(burn.rest);
    if (!flip.card) return state;
    piles[playerId] = flip.rest;
    pot.push(flip.card);
    faceUp[playerId] = flip.card;
    return {
      ...markReady(state, playerId),
      piles,
      battle: { ...state.battle, faceUp, pot }
    };
  }

  return markReady(state, playerId);
}

export function resolveIfBothReady(state: WarState): WarState {
  if (state.phase !== "playing") return state;
  const players = state.players.slice(0, 2);
  if (players.length !== 2) return state;
  const aId = players[0]?.id ?? null;
  const bId = players[1]?.id ?? null;
  if (!aId || !bId) return state;
  if (state.ready[aId] !== true || state.ready[bId] !== true) return state;

  const aCard = state.battle.faceUp[aId] ?? null;
  const bCard = state.battle.faceUp[bId] ?? null;
  if (!aCard || !bCard) return state;

  const cmp = compareFaceUp(state.battle.faceUp, aId, bId);
  const pot = [...state.battle.pot];
  const piles = { ...state.piles };

  if (!cmp.tied && cmp.winnerId) {
    const winnerPile = [...(piles[cmp.winnerId] ?? []), ...pot];
    piles[cmp.winnerId] = winnerPile;
    const playersNext = state.players.map((p) =>
      p.id === cmp.winnerId ? { ...p, wonCards: p.wonCards + pot.length } : p
    );
    return {
      ...state,
      round: state.round + 1,
      players: playersNext,
      piles,
      ready: Object.fromEntries(players.map((p) => [p.id, false])),
      battle: {
        step: "resolved",
        faceUp: { [aId]: aCard, [bId]: bCard },
        warDepth: 0,
        pot: [],
        winnerId: cmp.winnerId,
        message: "Battle resolved."
      }
    };
  }

  return {
    ...state,
    ready: Object.fromEntries(players.map((p) => [p.id, false])),
    battle: {
      ...state.battle,
      step: "war",
      warDepth: (state.battle.step === "war" ? state.battle.warDepth : 0) + 1,
      winnerId: null,
      message: "War!"
    }
  };
}

export function advance(state: WarState, actorId: string): WarState {
  return state;
}

export function restart(state: WarState, actorId: string): WarState {
  if (state.hostId !== actorId) return state;
  return { ...createInitialState(state.roomId, state.hostId), players: state.players };
}

export function markReady(state: WarState, playerId: string): WarState {
  if (!state.players.some((p) => p.id === playerId)) return state;
  return { ...state, ready: { ...state.ready, [playerId]: true } };
}

export function clearReady(state: WarState): WarState {
  const next = Object.fromEntries(state.players.map((p) => [p.id, false]));
  return { ...state, ready: next };
}

export function setReveal(state: WarState, at: number): WarState {
  return { ...state, revealNonce: state.revealNonce + 1, revealAt: at };
}


