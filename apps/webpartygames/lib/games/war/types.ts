export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type Rank =
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14;

export type Card = {
  suit: Suit;
  rank: Rank;
};

export type WarPlayer = {
  id: string;
  name: string;
  credits: number;
  wonCards: number;
};

export type WarPhase = "lobby" | "playing" | "finished";

export type WarBattleState = {
  step: "idle" | "battle" | "warBurn" | "warBattle" | "resolved";
  drawn: Record<string, Card[]>;
  pot: number;
  winnerId: string | null;
  message: string | null;
};

export type WarState = {
  roomId: string;
  hostId: string;
  phase: WarPhase;
  players: WarPlayer[];
  deck: Card[];
  deckIndex: number;
  round: number;
  battle: WarBattleState;
  maxRounds: number;
};


