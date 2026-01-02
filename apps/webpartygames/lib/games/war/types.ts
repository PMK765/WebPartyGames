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
  step: "idle" | "battle" | "war" | "resolved";
  faceUp: Record<string, Card | null>;
  warDepth: number;
  pot: Card[];
  winnerId: string | null;
  message: string | null;
};

export type WarState = {
  roomId: string;
  hostId: string;
  phase: WarPhase;
  players: WarPlayer[];
  piles: Record<string, Card[]>;
  round: number;
  ready: Record<string, boolean>;
  revealNonce: number;
  revealAt: number | null;
  battle: WarBattleState;
};


