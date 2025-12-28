export type PrecisionShotPhase =
  | "lobby"
  | "choosingPower"
  | "revealing"
  | "finished";

export type PrecisionShotPlayer = {
  id: string;
  name: string;
  credits: number;
  score: number;
};

export type PrecisionShotRoundResult = {
  playerId: string;
  chosenPower: number;
  chaos: number;
  finalPower: number;
  distance: number;
  pointsAwarded: number;
};

export type PrecisionShotState = {
  phase: PrecisionShotPhase;
  roomId: string;
  hostId: string;
  targetValue: number;
  round: number;
  maxRounds: number;
  players: PrecisionShotPlayer[];
  currentChoices: { playerId: string; power: number }[];
  results: PrecisionShotRoundResult[];
  totalScores: Record<string, number>;
};


