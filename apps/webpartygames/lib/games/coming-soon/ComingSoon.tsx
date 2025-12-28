"use client";

export function ComingSoon({ gameName }: { gameName: string }) {
  return (
    <div className="space-y-3">
      <div className="text-lg font-semibold tracking-tight">{gameName}</div>
      <p className="text-sm text-slate-300">
        This game isn’t playable yet. The hub and routing are ready; the game UI
        will land next.
      </p>
      <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 text-xs text-slate-400">
        Online multiplayer is planned via a pluggable RealtimeProvider. MVP games
        start as same-device.
      </div>
    </div>
  );
}


