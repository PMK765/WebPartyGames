"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import type { ResistancePublicState, ResistanceSide } from "./types";
import {
  advanceAfterMission,
  beginProposing,
  canStartGame,
  createInitialPublicState,
  finishMission,
  playerSlots,
  proposeTeam,
  revealVotes,
  resetToLobbyKeepPlayers,
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

async function joinRoom(roomId: string, name: string, credits: number) {
  const res = await supabase
    .rpc("resistance_join_room", { p_room_id: roomId, p_name: name, p_credits: credits })
    .maybeSingle<{
      out_room_id: string;
      out_host_id: string;
      out_public_state: ResistancePublicState;
      out_updated_at: string;
    }>();

  if (res.error) return { data: null, error: res.error };
  if (!res.data) return { data: null, error: null };

  return {
    data: {
      room_id: res.data.out_room_id,
      host_id: res.data.out_host_id,
      public_state: res.data.out_public_state,
      updated_at: res.data.out_updated_at
    },
    error: null
  } as const;
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

type SpyRow = { user_id: string; name: string };

async function fetchOtherSpies(roomId: string) {
  const res = await supabase.rpc("resistance_get_spies", { room_id: roomId });
  if (res.error) return { spies: [] as SpyRow[], error: res.error.message };
  return { spies: (res.data as SpyRow[] | null) ?? [], error: null };
}

type RevealRow = { user_id: string; name: string; role: ResistanceSide };

async function fetchRoleReveal(roomId: string) {
  const res = await supabase.rpc("resistance_reveal_roles", { room_id: roomId });
  if (res.error) return { roles: [] as RevealRow[], error: res.error.message };
  return { roles: (res.data as RevealRow[] | null) ?? [], error: null };
}

export function ResistanceGame({ roomId, gameDefinition, onPhaseChange }: Props) {
  const { user, loading: authLoading, error: authError } = useAuth();
  const { profile, credits, loading: profileLoading } = useProfile();

  const [state, setState] = useState<ResistancePublicState | null>(null);
  const [roomHostId, setRoomHostId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [role, setRole] = useState<ResistanceSide | null>(null);
  const [otherSpies, setOtherSpies] = useState<SpyRow[]>([]);
  const [revealedRoles, setRevealedRoles] = useState<RevealRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [nickname, setNickname] = useState("");
  const [nicknameConfirmed, setNicknameConfirmed] = useState(false);

  const [teamDraft, setTeamDraft] = useState<Set<string>>(new Set());
  const [myVote, setMyVote] = useState<boolean | null>(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [missionChoice, setMissionChoice] = useState<"success" | "fail">("success");
  const [missionSubmitted, setMissionSubmitted] = useState(false);
  const [showRole, setShowRole] = useState(true);

  const loading = authLoading || profileLoading;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const myName = useMemo(() => {
    if (!user) return null;
    if (profile?.username?.trim()) return profile.username;
    return guestLabel(user.id);
  }, [profile?.username, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("wpg_resistance_nickname_v1");
    const initial = (saved ?? myName ?? "").trim();
    if (!initial) return;
    setNickname(initial);
  }, [myName]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const init = async () => {
      if (!nicknameConfirmed) return;
      const name = nickname.trim();
      if (!name) return;
      const joined = await joinRoom(roomId, name, credits);
      if (cancelled) return;
      if (joined.error) {
        setError(joined.error.message);
        return;
      }
      if (!joined.data) {
        setError("Failed to join room");
        return;
      }
      setState(joined.data.public_state);
      setRoomHostId(joined.data.host_id);
      onPhaseChange?.(asShellPhase(joined.data.public_state.phase));

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
          const row = (payload.new as RoomRow | null) ?? null;
          if (!row) return;
          setRoomHostId(row.host_id);
          setState(row.public_state);
          onPhaseChange?.(asShellPhase(row.public_state.phase));
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
  }, [credits, nickname, nicknameConfirmed, onPhaseChange, roomId, user]);

  useEffect(() => {
    return;
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!state) return;
    if (state.phase === "lobby") {
      setRole(null);
      setOtherSpies([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      const r = await getMyRole(roomId, user.id);
      if (cancelled) return;
      setRole(r);

      if (r === "spy") {
        const spies = await fetchOtherSpies(roomId);
        if (cancelled) return;
        if (spies.error) setError(spies.error);
        else setOtherSpies(spies.spies.filter((s) => s.user_id !== user.id));
      } else {
        setOtherSpies([]);
      }
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
      roomHostId === user.id ||
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
    if (!nicknameConfirmed) {
      const suggested = nickname.trim() ? nickname : "";

      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-2">
            <div className="text-lg font-semibold tracking-tight text-slate-100">
              Enter a nickname
            </div>
            <div className="text-sm text-slate-300">
              This name is shown to other players in the room.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-3">
            <input
              value={suggested}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Nickname"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-base text-slate-100 outline-none focus:border-emerald-400 placeholder:text-slate-500"
              aria-label="Nickname"
              autoCorrect="off"
              autoCapitalize="words"
              inputMode="text"
            />
            <button
              type="button"
              disabled={!nickname.trim()}
              onClick={() => {
                const next = nickname.trim().slice(0, 24);
                setNickname(next);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("wpg_resistance_nickname_v1", next);
                }
                setNicknameConfirmed(true);
              }}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              Join room
            </button>
            <div className="text-xs text-slate-500">
              Room {roomId}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-300">
        Joining room…
      </div>
    );
  }

  const activePlayers = state.players.filter((p) => !p.isSpectator);
  const spectators = state.players.filter((p) => p.isSpectator);
  const isHost = roomHostId === user.id;
  const leaderId = state.leaderId;
  const isLeader = leaderId === user.id;
  const myIsSpectator = state.players.find((p) => p.id === user.id)?.isSpectator ?? true;

  const lobbyReady = canStartGame(state);
  const myOnMission = state.missionTeamIds.includes(user.id);
  const myOnProposedTeam = state.proposedTeamIds.includes(user.id);

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
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">Your role</div>
            <button
              type="button"
              onClick={() => setShowRole((v) => !v)}
              className="rounded-lg border border-slate-800 bg-slate-950/20 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-slate-700 transition"
            >
              {showRole ? "Hide" : "View"}
            </button>
          </div>

          {showRole ? (
            <div className="space-y-2">
              <div className="text-base font-semibold text-slate-100">
                {role ? (role === "spy" ? "You are a Spy" : "You are Resistance") : "Loading role…"}
              </div>
              {role === "spy" ? (
                <div className="text-xs text-slate-300">
                  Other spies:{" "}
                  {otherSpies.length > 0
                    ? otherSpies.map((s) => s.name).join(", ")
                    : "—"}
                </div>
              ) : null}
              <div className="text-xs text-slate-500">Keep it secret.</div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Hidden</div>
          )}
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

      {state.phase === "roleReveal" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-slate-100">Role reveal</div>
            <div className="text-xs text-slate-400">
              Check your role above. Spies see the other spies.
            </div>
          </div>

          {isHost ? (
            <button
              type="button"
              onClick={() => updateState(beginProposing(state))}
              className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
            >
              Begin mission 1
            </button>
          ) : (
            <div className="text-sm text-slate-300">Waiting for host…</div>
          )}
        </section>
      ) : null}

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

          {state.voteCounts ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4 text-xs text-slate-300">
              Last vote:{" "}
              <span className="font-semibold text-slate-100 tabular-nums">
                {state.voteCounts.approve}
              </span>{" "}
              approve /{" "}
              <span className="font-semibold text-slate-100 tabular-nums">
                {state.voteCounts.reject}
              </span>{" "}
              reject
            </div>
          ) : null}

          {isLeader && !myIsSpectator ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300">Select team:</div>
              <div className="text-xs text-slate-500">
                {teamDraft.size}/{state.teamSize} selected
              </div>
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

              {voteSubmitted ? (
                <div className="text-xs text-slate-400">
                  You voted{" "}
                  <span className="font-semibold text-slate-100">
                    {myVote ? "Approve" : "Reject"}
                  </span>
                  .
                </div>
              ) : null}
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
                  const approve = Number(res.data?.approve_count ?? NaN);
                  const reject = Number(res.data?.reject_count ?? NaN);
                  if (!Number.isFinite(approve) || !Number.isFinite(reject)) {
                    setError("Failed to load vote counts");
                    return;
                  }
                  updateState(revealVotes(state, { approve, reject }));
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

          {myOnMission && !myIsSpectator ? (
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
            Votes and mission cards are secret per user; only aggregate outcomes are shared.
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

          <div className="space-y-3">
            {revealedRoles.length > 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
                <div className="text-xs text-slate-400">Roles</div>
                <div className="mt-2 space-y-2 text-sm">
                  {revealedRoles.map((r) => (
                    <div key={r.user_id} className="flex items-center justify-between gap-3">
                      <div className="text-slate-200">{r.name}</div>
                      <div className="text-xs font-semibold text-slate-100">
                        {r.role === "spy" ? "Spy" : "Resistance"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isHost ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetchRoleReveal(roomId);
                    if (res.error) setError(res.error);
                    else setRevealedRoles(res.roles);
                  }}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-700 hover:bg-slate-900 transition"
                >
                  Reveal roles
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = resetToLobbyKeepPlayers(state);
                    updateState(next);
                    setRole(null);
                    setOtherSpies([]);
                    setRevealedRoles([]);
                    setMyVote(null);
                    setVoteSubmitted(false);
                    setMissionSubmitted(false);
                    setMissionChoice("success");
                    setShowRole(true);
                  }}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
                >
                  Play again (same room)
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-100">Mission history</div>
          <div className="text-xs text-slate-500">
            {state.score.resistance}–{state.score.spies}
          </div>
        </div>
        {state.history.length === 0 ? (
          <div className="text-sm text-slate-300">No missions yet.</div>
        ) : (
          <div className="space-y-2">
            {state.history.map((h) => (
              <div
                key={h.mission}
                className="rounded-2xl border border-slate-800 bg-slate-950/20 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">
                    Mission {h.mission}
                  </div>
                  <div
                    className={[
                      "text-xs font-semibold",
                      h.success ? "text-emerald-300" : "text-rose-300"
                    ].join(" ")}
                  >
                    {h.success ? "Success" : "Sabotaged"}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Team size: {h.teamIds.length} · Fails: {h.failCount}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


