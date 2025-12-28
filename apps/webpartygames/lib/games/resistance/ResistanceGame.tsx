"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import type { ResistancePublicState, ResistanceSide } from "./types";
import {
  advanceAfterMission,
  canStartGame,
  createInitialPublicState,
  finishMission,
  playerSlots,
  proposeTeam,
  revealVotes,
  startGamePublic
} from "./logic";

type Props = {
  roomId: string;
  gameDefinition: GameDefinition;
  onPhaseChange?: (phase: "lobby" | "playing" | "results") => void;
};

function guestLabel(userId: string) {
  const compact = userId.replaceAll("-", "");
  return `Guest-${compact.slice(-4).toUpperCase()}`;
}

function asShellPhase(phase: ResistancePublicState["phase"]) {
  if (phase === "lobby") return "lobby";
  if (phase === "finished") return "results";
  return "playing";
}

type RoomRow = {
  room_id: string;
  host_id: string;
  public_state: ResistancePublicState;
  updated_at: string;
};

type MemberRow = {
  room_id: string;
  user_id: string;
  name: string;
  credits: number;
  joined_at: string;
};

async function fetchRoom(roomId: string) {
  return supabase
    .from("resistance_rooms")
    .select("room_id,host_id,public_state,updated_at")
    .eq("room_id", roomId)
    .maybeSingle<RoomRow>();
}

async function upsertRoom(roomId: string, hostId: string) {
  const initial = createInitialPublicState(roomId, hostId);
  return supabase
    .from("resistance_rooms")
    .upsert({ room_id: roomId, host_id: hostId, public_state: initial }, { onConflict: "room_id" })
    .select("room_id,host_id,public_state,updated_at")
    .single<RoomRow>();
}

async function upsertMember(roomId: string, userId: string, name: string, credits: number) {
  return supabase
    .from("resistance_members")
    .upsert(
      { room_id: roomId, user_id: userId, name, credits },
      { onConflict: "room_id,user_id" }
    );
}

async function fetchMembers(roomId: string) {
  return supabase
    .from("resistance_members")
    .select("room_id,user_id,name,credits,joined_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true })
    .returns<MemberRow[]>();
}

async function getMyRole(roomId: string, userId: string) {
  const res = await supabase
    .from("resistance_roles")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle<{ role: ResistanceSide }>();

  return res.data?.role ?? null;
}

export function ResistanceGame({ roomId, gameDefinition, onPhaseChange }: Props) {
  const { user, loading: authLoading, error: authError } = useAuth();
  const { profile, credits, loading: profileLoading } = useProfile();

  const [state, setState] = useState<ResistancePublicState | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [role, setRole] = useState<ResistanceSide | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [teamDraft, setTeamDraft] = useState<Set<string>>(new Set());
  const [myVote, setMyVote] = useState<boolean | null>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [missionChoice, setMissionChoice] = useState<"success" | "fail">("success");
  const [missionSubmitted, setMissionSubmitted] = useState(false);

  const loading = authLoading || profileLoading;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const myName = useMemo(() => {
    if (!user) return null;
    if (profile?.username?.trim()) return profile.username;
    return guestLabel(user.id);
  }, [profile?.username, user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const init = async () => {
      const roomRes = await fetchRoom(roomId);
      if (cancelled) return;

      if (!roomRes.data) {
        const created = await upsertRoom(roomId, user.id);
        if (cancelled) return;
        if (created.error) {
          setError(created.error.message);
          return;
        }
        setState(created.data.public_state);
        onPhaseChange?.(asShellPhase(created.data.public_state.phase));
      } else {
        setState(roomRes.data.public_state);
        onPhaseChange?.(asShellPhase(roomRes.data.public_state.phase));
      }

      const list = await fetchMembers(roomId);
      if (!cancelled) {
        if (list.error) setError(list.error.message);
        else setMembers(list.data ?? []);
      }
    };

    void init();

    const channel = supabase
      .channel(`resistance-db:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resistance_rooms", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const next = (payload.new as RoomRow | null)?.public_state ?? null;
          if (!next) return;
          setState(next);
          onPhaseChange?.(asShellPhase(next.phase));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resistance_members", filter: `room_id=eq.${roomId}` },
        async () => {
          const list = await fetchMembers(roomId);
          if (list.error) setError(list.error.message);
          else setMembers(list.data ?? []);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [onPhaseChange, roomId, user]);

  useEffect(() => {
    if (!user) return;
    if (!myName) return;
    void upsertMember(roomId, user.id, myName, credits);
  }, [credits, myName, roomId, user]);

  useEffect(() => {
    if (!user) return;
    if (!state) return;
    if (state.hostId !== user.id) return;

    const sorted = [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    const players: ResistancePublicState["players"] = [];
    const spectators: ResistancePublicState["players"] = [];

    for (const m of sorted) {
      const entry = { id: m.user_id, name: m.name, credits: m.credits, isSpectator: false };
      if (players.length < 10) players.push(entry);
      else spectators.push({ ...entry, isSpectator: true });
    }

    const nextPlayers = [...players, ...spectators];
    const nextLeaderId = state.leaderId ?? (players[0]?.id ?? null);
    const nextHostId = players.some((p) => p.id === state.hostId) ? state.hostId : (players[0]?.id ?? state.hostId);

    const shouldUpdate =
      JSON.stringify(nextPlayers) !== JSON.stringify(state.players) ||
      nextLeaderId !== state.leaderId ||
      nextHostId !== state.hostId;

    if (!shouldUpdate) return;

    void supabase
      .from("resistance_rooms")
      .update({
        public_state: { ...state, hostId: nextHostId, leaderId: nextLeaderId, players: nextPlayers }
      })
      .eq("room_id", roomId);
  }, [members, roomId, state, user]);

  useEffect(() => {
    if (!user) return;
    if (!state) return;
    if (state.phase === "lobby") return;

    let cancelled = false;
    const run = async () => {
      const r = await getMyRole(roomId, user.id);
      if (cancelled) return;
      setRole(r);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [roomId, state, user]);

  useEffect(() => {
    const phase = state?.phase ?? null;
    if (phase !== "voting") {
      setMyVote(null);
      setVoteSubmitted(false);
    }
    if (phase !== "mission") {
      setMissionSubmitted(false);
      setMissionChoice("success");
    }
  }, [state]);

  const updateState = (next: ResistancePublicState) => {
    if (!user) return;
    if (!state) return;
    const canWrite =
      state.hostId === user.id ||
      (state.phase === "proposing" && state.leaderId === user.id);
    if (!canWrite) return;
    void supabase
      .from("resistance_rooms")
      .update({ public_state: next })
      .eq("room_id", roomId);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-300">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-300">
        {authError ? `Auth error: ${authError}` : "You’re not signed in."}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-300">
        Joining room…
      </div>
    );
  }

  const activePlayers = state.players.filter((p) => !p.isSpectator);
  const spectators = state.players.filter((p) => p.isSpectator);
  const isHost = state.hostId === user.id;
  const leaderId = state.leaderId;
  const isLeader = leaderId === user.id;
  const myIsSpectator = state.players.find((p) => p.id === user.id)?.isSpectator ?? true;

  const lobbyReady = canStartGame(state);

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-900 bg-rose-950/20 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="text-sm text-slate-400">{gameDefinition.name}</div>
          <div className="text-xs text-slate-500">
            {playerSlots(state.players)}/10 players · {spectators.length} spectators
          </div>
        </div>
        {myIsSpectator ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 text-xs text-slate-300">
            Spectating
          </div>
        ) : null}
      </div>

      {state.phase !== "lobby" ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 space-y-2">
          <div className="text-xs text-slate-400">Your role</div>
          <div className="text-sm font-semibold text-slate-100">
            {role ? (role === "spy" ? "Spy" : "Resistance") : "Loading role…"}
          </div>
          <div className="text-xs text-slate-500">
            Keep it secret.
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Players</div>
            <div className="text-xs text-slate-400">
              Base rules are tuned for 5–10 players. Extra users spectate.
            </div>
          </div>
          {state.phase === "lobby" && isHost ? (
            <button
              type="button"
              disabled={!lobbyReady}
              onClick={async () => {
                const next = startGamePublic(state);
                updateState(next);
                const ids = next.players.filter((p) => !p.isSpectator).map((p) => p.id);
                void supabase.rpc("resistance_deal_roles", { room_id: roomId, player_ids: ids });
              }}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              Start game
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {activePlayers.map((p) => (
            <div
              key={p.id}
              className={[
                "rounded-2xl border px-4 py-3",
                p.id === user.id ? "border-emerald-400 bg-emerald-500/10" : "border-slate-800 bg-slate-950/20"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">{p.name}</div>
                <div className="text-xs text-slate-300">
                  <span className="font-semibold text-slate-100 tabular-nums">{p.credits}</span>{" "}
                  credits
                </div>
              </div>
            </div>
          ))}
        </div>

        {spectators.length > 0 ? (
          <div className="text-xs text-slate-400">
            Spectators: {spectators.map((s) => s.name).join(", ")}
          </div>
        ) : null}
      </section>

      {state.phase === "proposing" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-100">
                Mission {state.mission}/5 · Proposal {state.proposalNumber}/5
              </div>
              <div className="text-xs text-slate-400">
                Leader chooses a team of {state.teamSize}.
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2 text-xs text-slate-300">
              Leader{" "}
              <span className="font-semibold text-slate-100">
                {state.players.find((p) => p.id === leaderId)?.name ?? leaderId ?? "—"}
              </span>
            </div>
          </div>

          {isLeader && !myIsSpectator ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300">Select team:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {activePlayers.map((p) => {
                  const selected = teamDraft.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(teamDraft);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        setTeamDraft(next);
                      }}
                      className={[
                        "rounded-2xl border px-4 py-3 text-left transition",
                        selected
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                          : "border-slate-800 bg-slate-950/20 text-slate-200 hover:border-slate-700"
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold">{p.name}</div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={teamDraft.size !== state.teamSize}
                onClick={() => {
                  const next = proposeTeam(state, user.id, Array.from(teamDraft));
                  if (next === state) return;
                  setTeamDraft(new Set());
                  setMyVote(null);
                  updateState(next);
                }}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
              >
                Propose team
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-300">
              Waiting for leader to propose a team…
            </div>
          )}
        </section>
      ) : null}

      {state.phase === "voting" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-100">Vote</div>
            <div className="text-xs text-slate-400">
              Approve or reject the proposed team.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="text-xs text-slate-400">Proposed team</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.proposedTeamIds.map((id) => {
                const p = state.players.find((x) => x.id === id);
                return (
                  <span
                    key={id}
                    className="rounded-full border border-slate-800 bg-slate-950/30 px-3 py-1 text-xs text-slate-200"
                  >
                    {p?.name ?? id}
                  </span>
                );
              })}
            </div>
          </div>

          {!myIsSpectator ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={voteSubmitted}
                  onClick={() => setMyVote(true)}
                  className={[
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-40",
                    myVote === true
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-800 bg-slate-950/20 text-slate-200 hover:border-slate-700"
                  ].join(" ")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={voteSubmitted}
                  onClick={() => setMyVote(false)}
                  className={[
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-40",
                    myVote === false
                      ? "border-rose-400 bg-rose-500/10 text-rose-100"
                      : "border-slate-800 bg-slate-950/20 text-slate-200 hover:border-slate-700"
                  ].join(" ")}
                >
                  Reject
                </button>
              </div>

              <button
                type="button"
                disabled={voteSubmitted || myVote === null}
                onClick={async () => {
                  if (myVote === null) return;
                  const res = await supabase.rpc("resistance_cast_vote", {
                    room_id: roomId,
                    mission_number: state.mission,
                    proposal_number: state.proposalNumber,
                    vote: myVote
                  });
                  if (res.error) {
                    setError(res.error.message);
                    return;
                  }
                  setVoteSubmitted(true);
                }}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
              >
                {voteSubmitted ? "Vote submitted" : "Submit vote"}
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-300">Spectators don’t vote.</div>
          )}

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-xs text-slate-400">
              Votes are revealed after everyone votes and the host reveals.
            </div>
            {isHost ? (
              <button
                type="button"
                onClick={async () => {
                  const res = await supabase.rpc("resistance_finalize_vote", {
                    room_id: roomId,
                    mission_number: state.mission,
                    proposal_number: state.proposalNumber
                  });
                  if (res.error) {
                    setError(res.error.message);
                    return;
                  }
                  const votes = (res.data?.votes as Record<string, boolean> | null) ?? null;
                  if (!votes) {
                    setError("Failed to load votes");
                    return;
                  }
                  updateState(revealVotes(state, votes));
                }}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
              >
                Reveal votes
              </button>
            ) : (
              <div className="text-sm text-slate-300">Waiting for host…</div>
            )}
          </div>
        </section>
      ) : null}

      {state.phase === "mission" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-100">Mission</div>
            <div className="text-xs text-slate-400">
              Team members submit Success (and spies may choose Fail).
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
            <div className="text-xs text-slate-400">Mission team</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.missionTeamIds.map((id) => {
                const p = state.players.find((x) => x.id === id);
                return (
                  <span
                    key={id}
                    className="rounded-full border border-slate-800 bg-slate-950/30 px-3 py-1 text-xs text-slate-200"
                  >
                    {p?.name ?? id}
                  </span>
                );
              })}
            </div>
          </div>

          {state.missionTeamIds.includes(user.id) && !myIsSpectator ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300">Your card</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMissionChoice("success")}
                  className={[
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                    missionChoice === "success"
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-800 bg-slate-950/20 text-slate-200 hover:border-slate-700"
                  ].join(" ")}
                >
                  Success
                </button>
                <button
                  type="button"
                  disabled={role !== "spy"}
                  onClick={() => setMissionChoice("fail")}
                  className={[
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-40",
                    missionChoice === "fail"
                      ? "border-rose-400 bg-rose-500/10 text-rose-100"
                      : "border-slate-800 bg-slate-950/20 text-slate-200 hover:border-slate-700"
                  ].join(" ")}
                >
                  Fail
                </button>
              </div>

              <button
                type="button"
                disabled={missionSubmitted || (missionChoice === "fail" && role !== "spy")}
                onClick={async () => {
                  const res = await supabase.rpc("resistance_submit_mission_card", {
                    room_id: roomId,
                    mission_number: state.mission,
                    card: missionChoice
                  });
                  if (res.error) {
                    setError(res.error.message);
                    return;
                  }
                  setMissionSubmitted(true);
                }}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
              >
                {missionSubmitted ? "Submitted" : "Submit"}
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-300">
              {myIsSpectator ? "Spectators watch." : "You are not on the mission team."}
            </div>
          )}

          {isHost ? (
            <button
              type="button"
              onClick={async () => {
                const res = await supabase.rpc("resistance_finalize_mission", {
                  room_id: roomId,
                  mission_number: state.mission
                });
                if (res.error) {
                  setError(res.error.message);
                  return;
                }
                const failCount = Number(res.data?.fail_count ?? 0);
                updateState(finishMission(state, failCount));
                setMissionSubmitted(false);
              }}
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-emerald-400 hover:bg-slate-900 transition"
            >
              Reveal mission result
            </button>
          ) : (
            <div className="text-sm text-slate-300">Waiting for host…</div>
          )}
        </section>
      ) : null}

      {state.phase === "missionResult" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-100">Result</div>
              <div className="text-xs text-slate-400">
                Mission {state.mission} {state.missionResult?.success ? "succeeded" : "failed"}.
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2 text-xs text-slate-300">
              Fails{" "}
              <span className="font-semibold text-slate-100 tabular-nums">
                {state.missionResult?.failCount ?? 0}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
              <div className="text-xs text-slate-400">Resistance</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
                {state.score.resistance}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
              <div className="text-xs text-slate-400">Spies</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
                {state.score.spies}
              </div>
            </div>
          </div>

          {isHost ? (
            <button
              type="button"
              onClick={() => {
                updateState(advanceAfterMission(state));
                setMyVote(null);
                setMissionSubmitted(false);
              }}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
            >
              Next mission
            </button>
          ) : (
            <div className="text-sm text-slate-300">Waiting for host…</div>
          )}

          <div className="text-xs text-slate-500">
            This is a faithful base-flow prototype. Voting is currently host-revealed; next iteration makes votes server-authoritative.
          </div>
        </section>
      ) : null}

      {state.phase === "finished" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-100">Game over</div>
            <div className="text-xs text-slate-400">
              Winner:{" "}
              <span className="font-semibold text-slate-100">
                {state.winner === "spies" ? "Spies" : "Resistance"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
              <div className="text-xs text-slate-400">Resistance</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
                {state.score.resistance}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
              <div className="text-xs text-slate-400">Spies</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
                {state.score.spies}
              </div>
            </div>
          </div>

          {isHost ? (
            <button
              type="button"
              onClick={() => {
                const next = createInitialPublicState(roomId, state.hostId);
                updateState(next);
                setRole(null);
                setMyVote(null);
                setMissionSubmitted(false);
              }}
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-emerald-400 hover:bg-slate-900 transition"
            >
              New game
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}


