export type ResistanceSide = "resistance" | "spy";

export type ResistancePhase =
  | "lobby"
  | "proposing"
  | "voting"
  | "mission"
  | "missionResult"
  | "finished";

export type ResistancePlayer = {
  id: string;
  name: string;
  credits: number;
  isSpectator: boolean;
};

export type ResistanceMissionRecord = {
  mission: number;
  teamIds: string[];
  failCount: number;
  success: boolean;
};

export type ResistancePublicState = {
  roomId: string;
  hostId: string;
  phase: ResistancePhase;
  players: ResistancePlayer[];

  leaderId: string | null;
  mission: number;
  maxMissions: number;
  proposalNumber: number;
  maxProposals: number;
  teamSize: number;

  proposedTeamIds: string[];
  votesRevealed: boolean;
  votes: Record<string, boolean> | null;

  missionTeamIds: string[];
  missionResult: { failCount: number; success: boolean } | null;
  history: ResistanceMissionRecord[];

  score: { resistance: number; spies: number };
  winner: "resistance" | "spies" | null;
};


