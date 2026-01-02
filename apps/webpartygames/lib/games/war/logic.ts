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
    battle: { step: "idle", faceUp: {}, warDepth: 0, pot: [], winnerId: null, message: null }
  };
}

export function addOrUpdatePlayer(
  state: WarState,
  player: { id: string; name: string; credits: number }
): WarState {
  const existing = state.players.find((p) => p.id === player.id);
  const nextPlayers = existing
    ? state.players.map((p) =>
        p.id === player.id ? { ...p, name: player.name, credits: player.credits } : p
      )
    : [...state.players, { ...player, wonCards: 0 }];

  return { ...state, players: nextPlayers };
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

export function advance(state: WarState, actorId: string): WarState {
  if (state.phase !== "playing") return state;
  if (state.hostId !== actorId) return state;
  if (state.players.length !== 2) return state;
  const aId = state.players[0]?.id ?? null;
  const bId = state.players[1]?.id ?? null;
  if (!aId || !bId) return state;

  const aPile = state.piles[aId] ?? [];
  const bPile = state.piles[bId] ?? [];

  if (aPile.length === 0 || bPile.length === 0) {
    const winnerId = aPile.length > bPile.length ? aId : bId;
    const winnerName = state.players.find((p) => p.id === winnerId)?.name ?? "Winner";
    return { ...state, phase: "finished", battle: { ...state.battle, winnerId, message: `${winnerName} wins.` } };
  }

  const round = state.round + 1;
  const base: WarState = {
    ...state,
    round,
    battle: {
      ...state.battle,
      winnerId: null,
      message: null
    }
  };

  const step = state.battle.step;

  if (step === "idle" || step === "resolved") {
    const aDraw = shiftOne(aPile);
    const bDraw = shiftOne(bPile);
    if (!aDraw.card || !bDraw.card) return { ...base, phase: "finished", battle: { ...base.battle, message: "Game over." } };

    const pot = [aDraw.card, bDraw.card];
    const faceUp = { [aId]: aDraw.card, [bId]: bDraw.card };
    const cmp = compareFaceUp(faceUp, aId, bId);
    const piles = { ...base.piles, [aId]: aDraw.rest, [bId]: bDraw.rest };

    if (!cmp.tied && cmp.winnerId) {
      const winnerPile = [...(piles[cmp.winnerId] ?? []), ...pot];
      piles[cmp.winnerId] = winnerPile;
      const players = base.players.map((p) =>
        p.id === cmp.winnerId ? { ...p, wonCards: p.wonCards + pot.length } : p
      );
      return {
        ...base,
        players,
        piles,
        battle: { step: "resolved", faceUp, warDepth: 0, pot: [], winnerId: cmp.winnerId, message: "Battle resolved." }
      };
    }

    return {
      ...base,
      piles,
      battle: { step: "war", faceUp, warDepth: 1, pot, winnerId: null, message: "War!" }
    };
  }

  if (step === "war") {
    const pot = [...state.battle.pot];
    let nextPiles = { ...state.piles };

    for (let burn = 0; burn < 3; burn += 1) {
      const aBurn = shiftOne(nextPiles[aId] ?? []);
      const bBurn = shiftOne(nextPiles[bId] ?? []);
      if (!aBurn.card || !bBurn.card) {
        const winnerId = aBurn.card ? aId : bBurn.card ? bId : (nextPiles[aId]?.length ?? 0) > (nextPiles[bId]?.length ?? 0) ? aId : bId;
        const winnerName = state.players.find((p) => p.id === winnerId)?.name ?? "Winner";
        return { ...state, phase: "finished", battle: { ...state.battle, winnerId, message: `${winnerName} wins (opponent ran out).` } };
      }
      pot.push(aBurn.card, bBurn.card);
      nextPiles = { ...nextPiles, [aId]: aBurn.rest, [bId]: bBurn.rest };
    }

    const aFlip = shiftOne(nextPiles[aId] ?? []);
    const bFlip = shiftOne(nextPiles[bId] ?? []);
    if (!aFlip.card || !bFlip.card) {
      const winnerId = aFlip.card ? aId : bFlip.card ? bId : (nextPiles[aId]?.length ?? 0) > (nextPiles[bId]?.length ?? 0) ? aId : bId;
      const winnerName = state.players.find((p) => p.id === winnerId)?.name ?? "Winner";
      return { ...state, phase: "finished", battle: { ...state.battle, winnerId, message: `${winnerName} wins (opponent ran out).` } };
    }

    pot.push(aFlip.card, bFlip.card);
    nextPiles = { ...nextPiles, [aId]: aFlip.rest, [bId]: bFlip.rest };
    const faceUp = { [aId]: aFlip.card, [bId]: bFlip.card };
    const cmp = compareFaceUp(faceUp, aId, bId);

    if (!cmp.tied && cmp.winnerId) {
      const winnerPile = [...(nextPiles[cmp.winnerId] ?? []), ...pot];
      nextPiles[cmp.winnerId] = winnerPile;
      const players = state.players.map((p) =>
        p.id === cmp.winnerId ? { ...p, wonCards: p.wonCards + pot.length } : p
      );
      return {
        ...state,
        round: state.round,
        players,
        piles: nextPiles,
        battle: { step: "resolved", faceUp, warDepth: 0, pot: [], winnerId: cmp.winnerId, message: "War resolved." }
      };
    }

    return {
      ...state,
      round: state.round,
      piles: nextPiles,
      battle: {
        step: "war",
        faceUp,
        warDepth: (state.battle.warDepth ?? 1) + 1,
        pot,
        winnerId: null,
        message: "War again!"
      }
    };
  }

  return state;
}

export function restart(state: WarState, actorId: string): WarState {
  if (state.hostId !== actorId) return state;
  return { ...createInitialState(state.roomId, state.hostId), players: state.players };
}


