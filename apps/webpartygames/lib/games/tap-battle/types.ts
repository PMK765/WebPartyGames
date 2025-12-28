import type { GamePhase } from "@/components/GameShell";

export type TapBattleState = {
  phase: GamePhase;
  playerCount: 2 | 3 | 4;
  targetTaps: number;
  scores: readonly number[];
  winnerIndex: number | null;
};


