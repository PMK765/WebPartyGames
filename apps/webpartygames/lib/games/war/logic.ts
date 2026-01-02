import type { Card, Rank, Suit, WarBattleState, WarPlayer, WarState } from "./types";

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
    deck: [],
    deckIndex: 0,
    round: 0,
    battle: { step: "idle", drawn: {}, pot: 0, winnerId: null, message: null },
    maxRounds: 26
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
  return { step: "idle", drawn: {}, pot: 0, winnerId: null, message: null };
}

export function canStart(state: WarState) {
  return state.players.length >= 2;
}

export function startGame(state: WarState): WarState {
  if (state.phase !== "lobby") return state;
  if (!canStart(state)) return state;

  const deck = deterministicShuffle(buildDeck(), `${state.roomId}:war`);
  return {
    ...state,
    phase: "playing",
    deck,
    deckIndex: 0,
    round: 0,
    players: state.players.map((p) => ({ ...p, wonCards: 0 })),
    battle: emptyBattle()
  };
}

function takeCard(state: WarState): { next: WarState; card: Card | null } {
  if (state.deckIndex >= state.deck.length) return { next: state, card: null };
  const card = state.deck[state.deckIndex] ?? null;
  return { next: { ...state, deckIndex: state.deckIndex + 1 }, card };
}

function rankValue(card: Card) {
  return card.rank;
}

function compareTop(drawn: Record<string, Card[]>, playerIds: readonly string[]) {
  const top: { id: string; value: number }[] = [];
  for (const id of playerIds) {
    const pile = drawn[id] ?? [];
    const last = pile[pile.length - 1];
    if (!last) return { winnerId: null, tied: true };
    top.push({ id, value: rankValue(last) });
  }
  top.sort((a, b) => b.value - a.value);
  const best = top[0];
  const second = top[1];
  if (!best || !second) return { winnerId: null, tied: true };
  if (best.value === second.value) return { winnerId: null, tied: true };
  return { winnerId: best.id, tied: false };
}

function totalCardsInDrawn(drawn: Record<string, Card[]>) {
  let total = 0;
  for (const piles of Object.values(drawn)) total += piles.length;
  return total;
}

export function advance(state: WarState, actorId: string): WarState {
  if (state.phase !== "playing") return state;
  if (state.hostId !== actorId) return state;
  const playerIds = state.players.map((p) => p.id);
  if (playerIds.length < 2) return state;

  const remaining = state.deck.length - state.deckIndex;
  if (remaining <= 0) {
    const maxWon = Math.max(...state.players.map((p) => p.wonCards));
    const winners = state.players.filter((p) => p.wonCards === maxWon);
    const message = winners.length === 1 ? `${winners[0]?.name ?? "Winner"} wins.` : "Tie game.";
    return { ...state, phase: "finished", battle: { ...state.battle, message } };
  }

  const round = state.round + 1;
  const maxRounds = state.maxRounds;
  if (round > maxRounds) {
    const maxWon = Math.max(...state.players.map((p) => p.wonCards));
    const winners = state.players.filter((p) => p.wonCards === maxWon);
    const message = winners.length === 1 ? `${winners[0]?.name ?? "Winner"} wins.` : "Tie game.";
    return { ...state, phase: "finished", battle: { ...state.battle, message } };
  }

  const step = state.battle.step;

  if (step === "idle" || step === "resolved") {
    let next = { ...state, round, battle: emptyBattle() };
    const drawn: Record<string, Card[]> = {};
    for (const id of playerIds) {
      const take = takeCard(next);
      next = take.next;
      if (!take.card) return { ...next, phase: "finished", battle: { ...next.battle, message: "Deck ended." } };
      drawn[id] = [take.card];
    }
    const cmp = compareTop(drawn, playerIds);
    const pot = totalCardsInDrawn(drawn);
    if (!cmp.tied && cmp.winnerId) {
      const players = next.players.map((p) =>
        p.id === cmp.winnerId ? { ...p, wonCards: p.wonCards + pot } : p
      );
      return {
        ...next,
        players,
        battle: { step: "resolved", drawn, pot, winnerId: cmp.winnerId, message: "Battle resolved." }
      };
    }
    return {
      ...next,
      battle: { step: "warBurn", drawn, pot, winnerId: null, message: "War! Burning 3 cards…" }
    };
  }

  if (step === "warBurn") {
    let next = state;
    const drawn = { ...state.battle.drawn };
    for (let burn = 0; burn < 3; burn += 1) {
      for (const id of playerIds) {
        const take = takeCard(next);
        next = take.next;
        if (!take.card) return { ...next, phase: "finished", battle: { ...next.battle, message: "Deck ended." } };
        drawn[id] = [...(drawn[id] ?? []), take.card];
      }
    }
    const pot = totalCardsInDrawn(drawn);
    return {
      ...next,
      round: state.round,
      battle: { step: "warBattle", drawn, pot, winnerId: null, message: "War battle…" }
    };
  }

  if (step === "warBattle") {
    let next = state;
    const drawn = { ...state.battle.drawn };
    for (const id of playerIds) {
      const take = takeCard(next);
      next = take.next;
      if (!take.card) return { ...next, phase: "finished", battle: { ...next.battle, message: "Deck ended." } };
      drawn[id] = [...(drawn[id] ?? []), take.card];
    }
    const cmp = compareTop(drawn, playerIds);
    const pot = totalCardsInDrawn(drawn);
    if (!cmp.tied && cmp.winnerId) {
      const players = next.players.map((p) =>
        p.id === cmp.winnerId ? { ...p, wonCards: p.wonCards + pot } : p
      );
      return {
        ...next,
        players,
        battle: { step: "resolved", drawn, pot, winnerId: cmp.winnerId, message: "War resolved." }
      };
    }
    return {
      ...next,
      battle: { step: "warBurn", drawn, pot, winnerId: null, message: "War again! Burning 3 cards…" }
    };
  }

  return state;
}

export function restart(state: WarState, actorId: string): WarState {
  if (state.hostId !== actorId) return state;
  return { ...createInitialState(state.roomId, state.hostId), players: state.players };
}


