"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import { getSupabaseRealtimeProvider } from "@/lib/realtime/supabaseProvider";
import type { PrecisionShotState } from "./types";
import {
  addPlayer,
  createInitialState,
  nextAfterReveal,
  setPlayerPower,
  startRound
} from "./logic";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

type Props = {
  roomId: string;
  gameDefinition: GameDefinition;
  onPhaseChange?: (phase: "lobby" | "playing" | "results") => void;
};

function guestLabel(userId: string) {
  const compact = userId.replaceAll("-", "");
  return `Guest-${compact.slice(-4).toUpperCase()}`;
}

function asShellPhase(phase: PrecisionShotState["phase"]) {
  if (phase === "lobby") return "lobby";
  if (phase === "choosingPower") return "playing";
  return "results";
}

export function PrecisionShotGame({ roomId, gameDefinition, onPhaseChange }: Props) {
  const { user, loading: authLoading, error: authError } = useAuth();
  const { profile, credits, loading: profileLoading } = useProfile();

  const provider = useMemo(() => getSupabaseRealtimeProvider(), []);
  const handleRef = useRef<{ updateState: (s: PrecisionShotState) => void; leave: () => void } | null>(
    null
  );

  const [state, setState] = useState<PrecisionShotState | null>(null);
  const [myPower, setMyPower] = useState(50);
  const didInitRef = useRef(false);

  const loading = authLoading || profileLoading;

  useEffect(() => {
    if (!user) return;

    const handle = provider.joinRoom<PrecisionShotState>(roomId, (next) => {
      setState(next);
      onPhaseChange?.(asShellPhase(next.phase));
    });
    handleRef.current = handle;

    return () => {
      handle.leave();
      handleRef.current = null;
    };
  }, [onPhaseChange, provider, roomId, user]);

  useEffect(() => {
    if (!user) return;
    const handle = handleRef.current;
    if (!handle) return;

    if (!state) {
      if (didInitRef.current) return;
      didInitRef.current = true;
      handle.updateState(createInitialState(roomId, user.id));
      return;
    }

    const displayName = profile?.username?.trim() ? profile.username : guestLabel(user.id);
    const next = addPlayer(state, user.id, displayName, credits);
    if (next !== state) handle.updateState(next);
  }, [credits, profile?.username, roomId, state, user]);

  const update = (next: PrecisionShotState) => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.updateState(next);
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

  const isHost = state.hostId === user.id;
  const me = state.players.find((p) => p.id === user.id) ?? null;
  const isSpectator = !me;

  const choice = state.currentChoices.find((c) => c.playerId === user.id);
  const hasLocked = Boolean(choice);

  const scoreboard = [...state.players].sort((a, b) => b.score - a.score);
  const roundWinners =
    state.phase === "revealing"
      ? state.results.filter((r) => r.pointsAwarded > 0).map((r) => r.playerId)
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="text-sm text-slate-400">{gameDefinition.name}</div>
          <div className="text-xs text-slate-500">
            {state.players.length}/6 players · {state.maxRounds} rounds
          </div>
        </div>
        {isSpectator ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 text-xs text-slate-300">
            Spectating
          </div>
        ) : null}
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Players</div>
            <div className="text-xs text-slate-400">
              Extra users join as spectators.
            </div>
          </div>
          {state.phase === "lobby" && isHost ? (
            <button
              type="button"
              disabled={state.players.length < 2}
              onClick={() => update(startRound(state))}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
            >
              Start game
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scoreboard.map((p) => (
            <div
              key={p.id}
              className={[
                "rounded-2xl border px-4 py-3",
                p.id === user.id
                  ? "border-emerald-400 bg-emerald-500/10"
                  : "border-slate-800 bg-slate-950/20"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">
                  {p.name}
                </div>
                <div className="text-xs text-slate-300">
                  <span className="font-semibold text-slate-100 tabular-nums">
                    {p.credits}
                  </span>{" "}
                  credits
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Score:{" "}
                <span className="font-semibold text-slate-200 tabular-nums">
                  {p.score}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {state.phase === "choosingPower" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-100">
                Round {state.round}/{state.maxRounds}
              </div>
              <div className="text-xs text-slate-400">
                Target is hidden. Pick a power from 0–100.
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2 text-xs text-slate-300">
              Range 0–100
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.players.map((p) => {
              const locked = state.currentChoices.some((c) => c.playerId === p.id);
              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/20 px-4 py-3 flex items-center justify-between"
                >
                  <div className="text-sm font-semibold text-slate-100">
                    {p.name}
                  </div>
                  <div
                    className={[
                      "text-xs font-semibold",
                      locked ? "text-emerald-300" : "text-slate-400"
                    ].join(" ")}
                  >
                    {locked ? "Locked" : "Waiting"}
                  </div>
                </div>
              );
            })}
          </div>

          {!isSpectator ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">
                  Your power
                </div>
                <div className="text-sm font-semibold text-slate-100 tabular-nums">
                  {myPower}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={myPower}
                onChange={(e) => setMyPower(Number(e.target.value))}
                className="w-full accent-emerald-400"
              />
              <button
                type="button"
                disabled={hasLocked}
                onClick={() => update(setPlayerPower(state, user.id, myPower))}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40"
              >
                {hasLocked ? "Locked in" : "Lock in"}
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-300">
              You’re spectating this round.
            </div>
          )}
        </section>
      ) : null}

      {state.phase === "revealing" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-100">
                Reveal
              </div>
              <div className="text-xs text-slate-400">
                Closest final power to the target wins.
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2 text-xs text-slate-300">
              Target{" "}
              <span className="font-semibold text-slate-100 tabular-nums">
                {state.targetValue}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr>
                  <th className="py-2 pr-4">Player</th>
                  <th className="py-2 pr-4">Chosen</th>
                  <th className="py-2 pr-4">Chaos</th>
                  <th className="py-2 pr-4">Final</th>
                  <th className="py-2 pr-4">Distance</th>
                  <th className="py-2 pr-4">+1</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {state.results
                  .slice()
                  .sort((a, b) => a.distance - b.distance)
                  .map((r) => {
                    const player = state.players.find((p) => p.id === r.playerId);
                    const isWinner = roundWinners.includes(r.playerId);
                    return (
                      <tr
                        key={r.playerId}
                        className={isWinner ? "text-emerald-200" : "text-slate-200"}
                      >
                        <td className="py-2 pr-4 font-semibold">
                          {player?.name ?? r.playerId}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{r.chosenPower}</td>
                        <td className="py-2 pr-4 tabular-nums">
                          {r.chaos >= 0 ? `+${r.chaos}` : r.chaos}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{r.finalPower}</td>
                        <td className="py-2 pr-4 tabular-nums">{r.distance}</td>
                        <td className="py-2 pr-4 tabular-nums">
                          {r.pointsAwarded}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
            {isHost ? (
              <button
                type="button"
                onClick={() => {
                  const next = nextAfterReveal(state);
                  update(next);
                }}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
              >
                Next
              </button>
            ) : (
              <div className="text-sm text-slate-300">Waiting for host…</div>
            )}
          </div>
        </section>
      ) : null}

      {state.phase === "finished" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-100">
                Final scores
              </div>
              <div className="text-xs text-slate-400">
                {state.maxRounds} rounds complete.
              </div>
            </div>
            {isHost ? (
              <button
                type="button"
                onClick={() => {
                  let next = createInitialState(state.roomId, state.hostId);
                  for (const p of state.players) {
                    next = addPlayer(next, p.id, p.name, p.credits);
                  }
                  update(next);
                }}
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-emerald-400 hover:bg-slate-900 transition"
              >
                Play again
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scoreboard.map((p, idx) => (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-800 bg-slate-950/20 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">
                    {idx === 0 ? "Winner" : "Player"}
                  </div>
                  <div className="text-sm font-semibold text-slate-100 tabular-nums">
                    {p.score}
                  </div>
                </div>
                <div className="mt-1 text-sm text-slate-300">{p.name}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}


