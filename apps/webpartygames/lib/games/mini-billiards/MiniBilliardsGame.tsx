"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { getSupabaseRealtimeProvider } from "@/lib/realtime/supabaseProvider";
import type { MiniBilliardsState } from "./types";
import { addPlayer, applyShot, createInitialState, startGame } from "./logic";

type Props = {
  roomId: string;
  gameDefinition: GameDefinition;
  onPhaseChange?: (phase: "lobby" | "playing" | "results") => void;
};

function guestLabel(userId: string) {
  const compact = userId.replaceAll("-", "");
  return `Guest-${compact.slice(-4).toUpperCase()}`;
}

function asShellPhase(phase: MiniBilliardsState["phase"]) {
  if (phase === "lobby") return "lobby";
  if (phase === "finished") return "results";
  return "playing";
}

export function MiniBilliardsGame({ roomId, gameDefinition, onPhaseChange }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { profile, credits, loading: profileLoading } = useProfile();

  const provider = useMemo(() => getSupabaseRealtimeProvider(), []);
  const handleRef = useRef<{ updateState: (s: MiniBilliardsState) => void; leave: () => void } | null>(
    null
  );

  const [state, setState] = useState<MiniBilliardsState | null>(null);
  const [angle, setAngle] = useState(45);
  const [power, setPower] = useState(55);
  const didInitRef = useRef(false);

  const loading = authLoading || profileLoading;

  useEffect(() => {
    if (!user) return;

    const handle = provider.joinRoom<MiniBilliardsState>(roomId, (next) => {
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

    const name = profile?.username?.trim() ? profile.username : guestLabel(user.id);
    const next = addPlayer(state, user.id, name, credits);
    if (next !== state) handle.updateState(next);
  }, [credits, profile?.username, roomId, state, user]);

  const update = (next: MiniBilliardsState) => {
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
        You’re not signed in.
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
  const isMyTurn = state.currentPlayerId === user.id;

  const currentPlayer = state.players.find((p) => p.id === state.currentPlayerId);
  const scoreboard = [...state.players].sort((a, b) => b.score - a.score);

  const cue = state.balls.find((b) => b.type === "cue") ?? null;
  const tableW = state.table.width;
  const tableH = state.table.height;
  const aimLength = (power / 100) * 80;
  const aimRad = (angle * Math.PI) / 180;
  const aimEnd =
    cue
      ? { x: cue.x + Math.cos(aimRad) * aimLength, y: cue.y + Math.sin(aimRad) * aimLength }
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="text-sm text-slate-400">{gameDefinition.name}</div>
          <div className="text-xs text-slate-500">
            Turn {state.turnCount}/{state.maxTurns}
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
              {state.players.length}/4 players · Extra users spectate.
            </div>
          </div>
          {state.phase === "lobby" && isHost ? (
            <button
              type="button"
              disabled={state.players.length < 2}
              onClick={() => update(startGame(state))}
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
                p.id === state.currentPlayerId
                  ? "border-emerald-400 bg-emerald-500/10"
                  : "border-slate-800 bg-slate-950/20"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">{p.name}</div>
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

      {state.phase !== "lobby" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-300">
              Turn:{" "}
              <span className="font-semibold text-slate-100">
                {currentPlayer?.name ?? state.currentPlayerId}
              </span>
            </div>
            <div className="text-xs text-slate-500">
              Pot target balls for +1 each. Pot cue ball: −1.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3">
            <svg
              viewBox={`0 0 ${tableW} ${tableH}`}
              className="w-full h-auto"
              aria-label="Mini billiards table"
            >
              <rect
                x={0}
                y={0}
                width={tableW}
                height={tableH}
                rx={16}
                fill="rgb(2 6 23)"
                stroke="rgb(30 41 59)"
                strokeWidth={2}
              />

              {state.pockets.map((p) => (
                <circle key={p.id} cx={p.x} cy={p.y} r={p.radius} fill="rgb(15 23 42)" />
              ))}

              {aimEnd && state.phase === "aiming" ? (
                <line
                  x1={cue?.x ?? 0}
                  y1={cue?.y ?? 0}
                  x2={aimEnd.x}
                  y2={aimEnd.y}
                  stroke="rgb(16 185 129)"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  opacity={0.9}
                />
              ) : null}

              {state.balls.map((b) => (
                <circle
                  key={b.id}
                  cx={b.x}
                  cy={b.y}
                  r={b.radius}
                  fill={b.type === "cue" ? "rgb(226 232 240)" : "rgb(56 189 248)"}
                  opacity={0.95}
                />
              ))}
            </svg>
          </div>

          {state.phase === "aiming" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">Angle</div>
                  <div className="text-sm font-semibold text-slate-100 tabular-nums">
                    {angle}°
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  disabled={!isMyTurn || isSpectator}
                  className="w-full accent-emerald-400 disabled:opacity-40"
                />
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">Power</div>
                  <div className="text-sm font-semibold text-slate-100 tabular-nums">
                    {power}
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={power}
                  onChange={(e) => setPower(Number(e.target.value))}
                  disabled={!isMyTurn || isSpectator}
                  className="w-full accent-emerald-400 disabled:opacity-40"
                />
              </div>

              <div className="md:col-span-2">
                {isSpectator ? (
                  <div className="text-sm text-slate-300">You’re spectating.</div>
                ) : isMyTurn ? (
                  <button
                    type="button"
                    onClick={() => update(applyShot(state, angle, power))}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
                  >
                    Shoot
                  </button>
                ) : (
                  <div className="text-sm text-slate-300">Waiting for {currentPlayer?.name ?? "player"}…</div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {state.phase === "finished" ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-100">Game over</div>
              <div className="text-xs text-slate-400">
                {state.turnCount} turns played.
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


