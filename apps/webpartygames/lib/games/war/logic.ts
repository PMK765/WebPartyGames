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

  const ready = state.ready[player.id] !== undefined ? state.ready : { ...state.ready, [player.id]: false };
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
  return state.players.length === 2;
}

export function startGame(state: WarState): WarState {
  if (state.phase !== "lobby") return state;
  if (!canStart(state)) return state;

  const deck = deterministicShuffle(buildDeck(), `${state.roomId}:${Date.now()}`);
  const [a, b] = state.players;
  if (!a || !b) return state;
  
  const piles: Record<string, Card[]> = {
    [a.id]: deck.slice(0, 26),
    [b.id]: deck.slice(26, 52)
  };

  return {
    ...state,
    phase: "playing",
    round: 0,
    piles,
    ready: { [a.id]: false, [b.id]: false },
    revealNonce: 0,
    revealAt: null,
    players: state.players.map((p) => ({ ...p, wonCards: 0 })),
    battle: emptyBattle()
  };
}

function shiftOne(pile: readonly Card[]) {
  if (pile.length === 0) return { card: null, rest: [] };
  return { card: pile[0], rest: pile.slice(1) };
}

function takeMany(pile: readonly Card[], count: number) {
  const taken: Card[] = [];
  for (let i = 0; i < Math.min(count, pile.length); i += 1) {
    const c = pile[i];
    if (c) taken.push(c);
  }
  return { taken, rest: pile.slice(taken.length), ok: taken.length === count };
}

export function handleFlip(state: WarState, playerId: string): WarState {
  if (state.phase !== "playing") return state;
  if (state.players.length !== 2) return state;
  if (state.ready[playerId] === true) return state;

  const [a, b] = state.players;
  if (!a || !b) return state;

  const myPile = state.piles[playerId] ?? [];
  const step = state.battle.step;

  if (step === "idle" || step === "resolved" || step === "battle") {
    const { card, rest } = shiftOne(myPile);
    if (!card) {
      console.warn("Player has no cards to flip:", playerId);
      return state;
    }

    const newPiles = { ...state.piles, [playerId]: rest };
    const isStartingNewRound = step === "resolved" || step === "idle";
    const newPot = isStartingNewRound ? [card] : [...state.battle.pot, card];
    const newFaceUp = isStartingNewRound ? { [playerId]: card } : { ...state.battle.faceUp, [playerId]: card };
    const newReady = { ...state.ready, [playerId]: true };

    const nextState = {
      ...state,
      piles: newPiles,
      ready: newReady,
      battle: {
        ...state.battle,
        step: "battle" as const,
        faceUp: newFaceUp,
        pot: newPot,
        winnerId: null,
        message: null
      }
    };

    if (newReady[a.id] && newReady[b.id]) {
      return resolveRound(nextState);
    }
    return nextState;
  }

  if (step === "war") {
    const burn = takeMany(myPile, 3);
    const { card, rest } = shiftOne(burn.rest);
    
    if (!card) {
      console.warn("Player ran out during war:", playerId);
      return state;
    }

    const newPiles = { ...state.piles, [playerId]: rest };
    const newPot = [...state.battle.pot, ...burn.taken, card];
    const newFaceUp = { ...state.battle.faceUp, [playerId]: card };
    const newReady = { ...state.ready, [playerId]: true };

    const nextState = {
      ...state,
      piles: newPiles,
      ready: newReady,
      battle: {
        ...state.battle,
        faceUp: newFaceUp,
        pot: newPot
      }
    };

    if (newReady[a.id] && newReady[b.id]) {
      return resolveRound(nextState);
    }
    return nextState;
  }

  return state;
}

function resolveRound(state: WarState): WarState {
  const [a, b] = state.players;
  if (!a || !b) return state;

  const cardA = state.battle.faceUp[a.id];
  const cardB = state.battle.faceUp[b.id];
  if (!cardA || !cardB) return state;

  if (cardA.rank === cardB.rank) {
    return {
      ...state,
      ready: { [a.id]: false, [b.id]: false },
      battle: {
        ...state.battle,
        step: "war",
        warDepth: state.battle.warDepth + 1,
        winnerId: null,
        message: "WAR!"
      },
      revealNonce: state.revealNonce + 1
    };
  }

  const winnerId = cardA.rank > cardB.rank ? a.id : b.id;
  const newPiles = { ...state.piles };
  newPiles[winnerId] = [...(newPiles[winnerId] ?? []), ...state.battle.pot];

  const aPileLen = (newPiles[a.id] ?? []).length;
  const bPileLen = (newPiles[b.id] ?? []).length;

  if (aPileLen === 0 || bPileLen === 0) {
    const finalWinner = aPileLen === 0 ? b.id : a.id;
    return {
      ...state,
      phase: "finished",
      piles: newPiles,
      battle: {
        step: "resolved",
        faceUp: { [a.id]: cardA, [b.id]: cardB },
        pot: [],
        warDepth: 0,
        winnerId: finalWinner,
        message: `${state.players.find(p => p.id === finalWinner)?.name} wins the game!`
      },
      revealNonce: state.revealNonce + 1
    };
  }

  return {
    ...state,
    round: state.round + 1,
    piles: newPiles,
    ready: { [a.id]: false, [b.id]: false },
    battle: {
      step: "resolved",
      faceUp: { [a.id]: cardA, [b.id]: cardB },
      pot: [],
      warDepth: 0,
      winnerId,
      message: null
    },
    revealNonce: state.revealNonce + 1
  };
}

export function restart(state: WarState, actorId: string): WarState {
  if (state.hostId !== actorId) return state;
  return { ...createInitialState(state.roomId, state.hostId), players: state.players };
}
