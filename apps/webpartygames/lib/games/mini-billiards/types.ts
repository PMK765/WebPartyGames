export type MiniBilliardsPhase = "lobby" | "aiming" | "simulating" | "finished";

export type MiniBilliardsPlayer = {
  id: string;
  name: string;
  credits: number;
  score: number;
};

export type Ball = {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: "cue" | "target";
};

export type Pocket = {
  id: string;
  x: number;
  y: number;
  radius: number;
};

export type MiniBilliardsState = {
  phase: MiniBilliardsPhase;
  roomId: string;
  hostId: string;
  currentPlayerId: string;
  players: MiniBilliardsPlayer[];
  balls: Ball[];
  pockets: Pocket[];
  turnCount: number;
  maxTurns: number;
  table: { width: number; height: number };
};


