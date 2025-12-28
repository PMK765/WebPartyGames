import type { ResistancePublicState, ResistanceSide } from "./types";

const MAX_PLAYERS = 10;

const TEAM_SIZES: Record<number, readonly number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5]
};

const SPY_COUNTS: Record<number, number> = {
  5: 2,
  6: 2,
  7: 3,
  8: 3,
  9: 3,
  10: 4
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function unique(ids: readonly string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function rotateLeader(players: readonly { id: string }[], leaderId: string | null) {
  if (players.length === 0) return null;
  const idx = leaderId ? players.findIndex((p) => p.id === leaderId) : -1;
  const nextIdx = idx >= 0 ? (idx + 1) % players.length : 0;
  return players[nextIdx].id;
}

export function playerSlots(players: readonly { isSpectator: boolean }[]): number {
  return players.filter((p) => !p.isSpectator).length;
}

export function computeTeamSize(playerCount: number, mission: number): number {
  const capped = clampInt(playerCount, 5, 10);
  const sizes = TEAM_SIZES[capped] ?? TEAM_SIZES[10];
  const idx = clampInt(mission - 1, 0, 4);
  return sizes[idx] ?? sizes[0];
}

export function computeSpyCount(playerCount: number): number {
  const capped = clampInt(playerCount, 5, 10);
  return SPY_COUNTS[capped] ?? 4;
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

export function assignRoles(playerIds: readonly string[], roomId: string): Record<string, ResistanceSide> {
  const players = playerIds.slice(0, MAX_PLAYERS);
  const spyCount = computeSpyCount(players.length);
  const shuffled = deterministicShuffle(players, `${roomId}:roles`);
  const spies = new Set(shuffled.slice(0, spyCount));
  const out: Record<string, ResistanceSide> = {};
  for (const id of players) {
    out[id] = spies.has(id) ? "spy" : "resistance";
  }
  return out;
}

export function createInitialPublicState(roomId: string, hostId: string): ResistancePublicState {
  return {
    roomId,
    hostId,
    phase: "lobby",
    players: [],
    leaderId: hostId,
    mission: 1,
    maxMissions: 5,
    proposalNumber: 1,
    maxProposals: 5,
    teamSize: 2,
    proposedTeamIds: [],
    votesRevealed: false,
    votes: null,
    missionTeamIds: [],
    missionResult: null,
    history: [],
    score: { resistance: 0, spies: 0 },
    winner: null
  };
}

export function addOrUpdatePlayer(
  state: ResistancePublicState,
  player: { id: string; name: string; credits: number }
): ResistancePublicState {
  const existing = state.players.find((p) => p.id === player.id);
  const nonSpectators = state.players.filter((p) => !p.isSpectator);
  const isSpectator = existing?.isSpectator ?? nonSpectators.length >= MAX_PLAYERS;

  const nextPlayers = existing
    ? state.players.map((p) =>
        p.id === player.id ? { ...p, name: player.name, credits: player.credits } : p
      )
    : [
        ...state.players,
        {
          id: player.id,
          name: player.name,
          credits: player.credits,
          isSpectator
        }
      ];

  const leaderId = state.leaderId ?? rotateLeader(nextPlayers.filter((p) => !p.isSpectator), null);

  return { ...state, players: nextPlayers, leaderId };
}

export function removePlayer(state: ResistancePublicState, playerId: string): ResistancePublicState {
  if (!state.players.some((p) => p.id === playerId)) return state;
  const nextPlayers = state.players.filter((p) => p.id !== playerId);
  const active = nextPlayers.filter((p) => !p.isSpectator);

  const hostId = state.hostId === playerId ? (active[0]?.id ?? state.hostId) : state.hostId;
  const leaderId =
    state.leaderId === playerId ? rotateLeader(active, playerId) : state.leaderId;

  const proposedTeamIds = state.proposedTeamIds.filter((id) => id !== playerId);
  const missionTeamIds = state.missionTeamIds.filter((id) => id !== playerId);

  const votes = state.votes
    ? Object.fromEntries(Object.entries(state.votes).filter(([id]) => id !== playerId))
    : null;

  return {
    ...state,
    hostId,
    leaderId,
    players: nextPlayers,
    proposedTeamIds,
    missionTeamIds,
    votes
  };
}

export function canStartGame(state: ResistancePublicState): boolean {
  const activeCount = playerSlots(state.players);
  return activeCount >= 5;
}

export function startGamePublic(state: ResistancePublicState): ResistancePublicState {
  const activePlayers = state.players.filter((p) => !p.isSpectator);
  const activeCount = activePlayers.length;
  const teamSize = computeTeamSize(activeCount, 1);
  const leaderId = state.leaderId ?? activePlayers[0]?.id ?? null;

  return {
    ...state,
    phase: "proposing",
    mission: 1,
    proposalNumber: 1,
    teamSize,
    leaderId,
    proposedTeamIds: [],
    votesRevealed: false,
    votes: null,
    missionTeamIds: [],
    missionResult: null,
    history: [],
    score: { resistance: 0, spies: 0 },
    winner: null
  };
}

export function proposeTeam(
  state: ResistancePublicState,
  leaderId: string,
  teamIds: readonly string[]
): ResistancePublicState {
  if (state.phase !== "proposing") return state;
  if (state.leaderId !== leaderId) return state;

  const activeIds = state.players.filter((p) => !p.isSpectator).map((p) => p.id);
  const cleaned = unique(teamIds).filter((id) => activeIds.includes(id)).slice(0, state.teamSize);
  if (cleaned.length !== state.teamSize) return state;

  return {
    ...state,
    phase: "voting",
    proposedTeamIds: cleaned,
    votesRevealed: false,
    votes: null,
    missionTeamIds: [],
    missionResult: null
  };
}

export function revealVotes(
  state: ResistancePublicState,
  votes: Record<string, boolean>
): ResistancePublicState {
  if (state.phase !== "voting") return state;

  const activeIds = state.players.filter((p) => !p.isSpectator).map((p) => p.id);
  const voteMap: Record<string, boolean> = {};
  for (const id of activeIds) {
    if (typeof votes[id] !== "boolean") return state;
    voteMap[id] = votes[id];
  }

  const approvals = Object.values(voteMap).filter(Boolean).length;
  const rejected = approvals <= Math.floor(activeIds.length / 2);

  if (rejected) {
    const nextProposal = state.proposalNumber + 1;
    const nextLeaderId = rotateLeader(
      state.players.filter((p) => !p.isSpectator),
      state.leaderId
    );

    if (nextProposal > state.maxProposals) {
      return {
        ...state,
        phase: "finished",
        votesRevealed: true,
        votes: voteMap,
        winner: "spies",
        score: { ...state.score, spies: 3 }
      };
    }

    return {
      ...state,
      phase: "proposing",
      proposalNumber: nextProposal,
      leaderId: nextLeaderId,
      votesRevealed: true,
      votes: voteMap,
      proposedTeamIds: []
    };
  }

  return {
    ...state,
    phase: "mission",
    votesRevealed: true,
    votes: voteMap,
    missionTeamIds: state.proposedTeamIds,
    proposedTeamIds: []
  };
}

export function finishMission(
  state: ResistancePublicState,
  failCount: number
): ResistancePublicState {
  if (state.phase !== "mission") return state;

  const success = failCount === 0;
  const score = {
    resistance: state.score.resistance + (success ? 1 : 0),
    spies: state.score.spies + (success ? 0 : 1)
  };

  const history = [
    ...state.history,
    { mission: state.mission, teamIds: state.missionTeamIds, failCount, success }
  ];

  const winner =
    score.resistance >= 3 ? "resistance" : score.spies >= 3 ? "spies" : null;

  return {
    ...state,
    phase: winner ? "finished" : "missionResult",
    missionResult: { failCount, success },
    score,
    history,
    winner
  };
}

export function advanceAfterMission(state: ResistancePublicState): ResistancePublicState {
  if (state.phase !== "missionResult") return state;

  const activeCount = playerSlots(state.players);
  const nextMission = state.mission + 1;
  const nextLeaderId = rotateLeader(
    state.players.filter((p) => !p.isSpectator),
    state.leaderId
  );

  const teamSize = computeTeamSize(activeCount, nextMission);

  return {
    ...state,
    phase: "proposing",
    mission: nextMission,
    proposalNumber: 1,
    leaderId: nextLeaderId,
    teamSize,
    votesRevealed: false,
    votes: null,
    missionTeamIds: [],
    proposedTeamIds: [],
    missionResult: null
  };
}


