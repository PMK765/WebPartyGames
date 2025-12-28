"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import type { RealtimeProvider } from "@/lib/realtime/types";
import type { TapBattleState } from "./types";
import type { GamePhase } from "@/components/GameShell";

type Props = {
  roomId: string;
  game: GameDefinition;
  realtimeProvider: RealtimeProvider;
  onPhaseChange?: (phase: GamePhase) => void;
};

function createInitialState(): TapBattleState {
  return {
    phase: "lobby",
    playerCount: 2,
    targetTaps: 50,
    scores: [0, 0],
    winnerIndex: null
  };
}

const PLAYER_COLORS: readonly string[] = [
  "bg-emerald-500/20 border-emerald-400 text-emerald-100",
  "bg-sky-500/20 border-sky-400 text-sky-100",
  "bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-100",
  "bg-amber-500/20 border-amber-400 text-amber-100"
];

export function TapBattle({
  roomId,
  realtimeProvider,
  onPhaseChange
}: Props) {
  const [state, setState] = useState<TapBattleState>(createInitialState);
  const handleRef = useRef<{
    updateState: (s: TapBattleState) => void;
    leave: () => void;
  } | null>(null);

  useEffect(() => {
    let didReceive = false;
    const handle = realtimeProvider.joinRoom<TapBattleState>(roomId, (next) => {
      didReceive = true;
      setState(next);
      onPhaseChange?.(next.phase);
    });
    handleRef.current = handle;

    if (!didReceive) {
      handle.updateState(createInitialState());
    }

    return () => {
      handle.leave();
      handleRef.current = null;
    };
  }, [onPhaseChange, realtimeProvider, roomId]);

  const players = useMemo(
    () => Array.from({ length: state.playerCount }, (_, i) => i),
    [state.playerCount]
  );

  const update = (next: TapBattleState) => {
    const h = handleRef.current;
    if (!h) return;
    h.updateState(next);
  };

  const setPlayerCount = (count: 2 | 3 | 4) => {
    update({
      ...state,
      playerCount: count,
      scores: Array.from({ length: count }, () => 0),
      winnerIndex: null,
      phase: "lobby"
    });
  };

  const setTarget = (targetTaps: number) => {
    const clamped = Math.max(10, Math.min(200, Math.round(targetTaps)));
    update({ ...state, targetTaps: clamped });
  };

  const startRound = () => {
    update({
      ...state,
      phase: "playing",
      scores: Array.from({ length: state.playerCount }, () => 0),
      winnerIndex: null
    });
  };

  const backToLobby = () => {
    update({ ...state, phase: "lobby", winnerIndex: null });
  };

  const playAgain = () => {
    update({
      ...state,
      phase: "playing",
      scores: Array.from({ length: state.playerCount }, () => 0),
      winnerIndex: null
    });
  };

  const tap = (playerIndex: number) => {
    if (state.phase !== "playing") return;
    if (state.winnerIndex !== null) return;

    const nextScores = state.scores.map((v, i) =>
      i === playerIndex ? v + 1 : v
    );
    const winnerIndex = nextScores[playerIndex] >= state.targetTaps ? playerIndex : null;
    const phase: GamePhase = winnerIndex === null ? "playing" : "results";

    update({
      ...state,
      scores: nextScores,
      winnerIndex,
      phase
    });
  };

  if (state.phase === "lobby") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="text-lg font-semibold tracking-tight">
            Choose players
          </div>
          <div className="flex flex-wrap gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPlayerCount(n as 2 | 3 | 4)}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                  state.playerCount === n
                    ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                    : "border-slate-800 bg-slate-950/30 text-slate-200 hover:border-slate-700"
                ].join(" ")}
              >
                {n} players
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-lg font-semibold tracking-tight">Target taps</div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              inputMode="numeric"
              value={String(state.targetTaps)}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                setTarget(raw);
              }}
              className="w-full md:w-40 rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              aria-label="Target taps"
            />
            <div className="text-sm text-slate-400">
              Recommended: 50 for ~2 minutes
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-300">
            Split the screen. Each player taps only their zone.
          </div>
          <button
            type="button"
            onClick={startRound}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            Start round
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "results") {
    const winner =
      state.winnerIndex === null ? null : `Player ${state.winnerIndex + 1}`;

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-5 md:p-6 space-y-2">
          <div className="text-xs uppercase tracking-widest text-slate-400">
            Winner
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {winner ?? "No winner"}
          </div>
          <div className="text-sm text-slate-300">
            Target was {state.targetTaps} taps.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {players.map((i) => (
            <div
              key={i}
              className={[
                "rounded-2xl border p-4",
                PLAYER_COLORS[i] ?? "border-slate-800 bg-slate-950/30 text-slate-100"
              ].join(" ")}
            >
              <div className="text-sm font-semibold">Player {i + 1}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                {state.scores[i] ?? 0}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
          <button
            type="button"
            onClick={backToLobby}
            className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-700 hover:bg-slate-900 transition"
          >
            Back to lobby
          </button>
          <button
            type="button"
            onClick={playAgain}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            Play again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-300">
          Target: <span className="font-semibold">{state.targetTaps}</span>
        </div>
        <button
          type="button"
          onClick={backToLobby}
          className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-slate-700 hover:bg-slate-900 transition"
        >
          Quit
        </button>
      </div>

      <div
        className={[
          "grid gap-3",
          state.playerCount === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2"
        ].join(" ")}
      >
        {players.map((i) => (
          <button
            key={i}
            type="button"
            onPointerDown={() => tap(i)}
            className={[
              "select-none rounded-2xl border p-6 md:p-10 text-left transition active:scale-[0.99]",
              "min-h-40 md:min-h-56",
              PLAYER_COLORS[i] ?? "border-slate-800 bg-slate-950/30 text-slate-100"
            ].join(" ")}
            aria-label={`Tap zone for Player ${i + 1}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Player {i + 1}</div>
                <div className="text-xs text-slate-300/80">Tap here</div>
              </div>
              <div className="text-4xl font-semibold tabular-nums">
                {state.scores[i] ?? 0}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}


