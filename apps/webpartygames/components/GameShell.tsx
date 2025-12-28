"use client";

import type { ReactNode } from "react";

export type GamePhase = "lobby" | "playing" | "results";

type Props = {
  title: string;
  roomId: string;
  phase: GamePhase;
  steps: readonly string[];
  children: ReactNode;
};

function PhasePill({
  label,
  active
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={[
        "rounded-full border px-3 py-1 text-xs font-semibold transition",
        active
          ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
          : "border-slate-800 bg-slate-950/30 text-slate-400"
      ].join(" ")}
    >
      {label}
    </div>
  );
}

export function GameShell({ title, roomId, phase, steps, children }: Props) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {title}
            </h1>
            <div className="text-sm text-slate-400">
              Room <span className="font-mono tracking-widest">{roomId}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PhasePill label="Lobby" active={phase === "lobby"} />
            <PhasePill label="Playing" active={phase === "playing"} />
            <PhasePill label="Results" active={phase === "results"} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:p-5">
          <div className="text-sm font-semibold text-slate-100">
            Quick steps
          </div>
          <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm text-slate-300">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:p-6">
        {children}
      </section>
    </div>
  );
}


