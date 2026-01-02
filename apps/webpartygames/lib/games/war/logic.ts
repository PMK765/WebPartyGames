import type { Card, Rank, Suit, WarBattleState, WarState } from "./types";

const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

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
    ready: { [aId]: false, [bId]: false },
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

export function markPlayerReady(state: WarState, playerId: string): WarState {
  if (state.phase !== "playing") return state;
  if (!state.players.some((p) => p.id === playerId)) return state;
  if (state.ready[playerId]) return state;
  
  const players = state.players.slice(0, 2);
  if (players.length !== 2) return state;
  
  const aId = players[0]?.id ?? "";
  const bId = players[1]?.id ?? "";
  if (!aId || !bId) return state;

  const piles = { ...state.piles };
  const pot = [...state.battle.pot];
  const faceUp = { ...state.battle.faceUp };
  const step = state.battle.step;

  if (step === "idle" || step === "resolved") {
    const { card, rest } = shiftOne(piles[playerId] ?? []);
    if (!card) {
      return { ...state, phase: "finished", battle: { ...state.battle, winnerId: aId === playerId ? bId : aId, message: `${playerId} out of cards!` } };
    }
    piles[playerId] = rest;
    pot.push(card);
    faceUp[playerId] = card;

    const nextReady = { ...state.ready, [playerId]: true };
    return {
      ...state,
      piles,
      ready: nextReady,
      battle: { ...state.battle, step: "battle", faceUp, pot }
    };
  }

  if (step === "war") {
    const burn = takeMany(piles[playerId] ?? [], 3);
    if (!burn.ok) {
      return { ...state, phase: "finished", battle: { ...state.battle, winnerId: aId === playerId ? bId : aId, message: `${playerId} out of cards during war!` } };
    }
    pot.push(...burn.taken);
    const { card, rest } = shiftOne(burn.rest);
    if (!card) {
      return { ...state, phase: "finished", battle: { ...state.battle, winnerId: aId === playerId ? bId : aId, message: `${playerId} out of cards during war!` } };
    }
    piles[playerId] = rest;
    pot.push(card);
    faceUp[playerId] = card;

    const nextReady = { ...state.ready, [playerId]: true };
    return {
      ...state,
      piles,
      ready: nextReady,
      battle: { ...state.battle, faceUp, pot }
    };
  }

  return { ...state, ready: { ...state.ready, [playerId]: true } };
}

export function attemptResolve(state: WarState): WarState {
  if (state.phase !== "playing") return state;
  const players = state.players.slice(0, 2);
  if (players.length !== 2) return state;
  
  const aId = players[0]?.id ?? "";
  const bId = players[1]?.id ?? "";
  if (!aId || !bId) return state;

  if (!state.ready[aId] || !state.ready[bId]) return state;

  const aCard = state.battle.faceUp[aId];
  const bCard = state.battle.faceUp[bId];
  if (!aCard || !bCard) return state;

  const cmp = compareFaceUp(state.battle.faceUp, aId, bId);
  
  if (cmp.tied) {
    return {
      ...state,
      ready: { [aId]: false, [bId]: false },
      battle: {
        ...state.battle,
        step: "war",
        warDepth: (state.battle.step === "war" ? state.battle.warDepth : 0) + 1,
        winnerId: null,
        message: "War!"
      }
    };
  }

  const winnerId = cmp.winnerId!;
  const pot = [...state.battle.pot];
  const piles = { ...state.piles };
  piles[winnerId] = [...(piles[winnerId] ?? []), ...pot];

  const playersNext = state.players.map((p) =>
    p.id === winnerId ? { ...p, wonCards: p.wonCards + pot.length } : p
  );

  const aPile = piles[aId] ?? [];
  const bPile = piles[bId] ?? [];
  if (aPile.length === 0) {
    return {
      ...state,
      phase: "finished",
      players: playersNext,
      piles,
      battle: {
        step: "resolved",
        faceUp: { [aId]: aCard, [bId]: bCard },
        warDepth: 0,
        pot: [],
        winnerId: bId,
        message: `${playersNext.find((p) => p.id === bId)?.name ?? "Winner"} wins!`
      }
    };
  }
  if (bPile.length === 0) {
    return {
      ...state,
      phase: "finished",
      players: playersNext,
      piles,
      battle: {
        step: "resolved",
        faceUp: { [aId]: aCard, [bId]: bCard },
        warDepth: 0,
        pot: [],
        winnerId: aId,
        message: `${playersNext.find((p) => p.id === aId)?.name ?? "Winner"} wins!`
      }
    };
  }

  return {
    ...state,
    round: state.round + 1,
    players: playersNext,
    piles,
    ready: { [aId]: false, [bId]: false },
    battle: {
      step: "resolved",
      faceUp: { [aId]: aCard, [bId]: bCard },
      warDepth: 0,
      pot: [],
      winnerId,
      message: "Round complete."
    },
    revealAt: Date.now(),
    revealNonce: state.revealNonce + 1
  };
}

export function restart(state: WarState, actorId: string): WarState {
  if (state.hostId !== actorId) return state;
  return { ...createInitialState(state.roomId, state.hostId), players: state.players };
}
