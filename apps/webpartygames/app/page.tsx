import type { Metadata } from "next";
import { GameGrid } from "@/components/GameGrid";
import { getAllGames } from "@/lib/games/registry";

export const metadata: Metadata = {
  title: "WebPartyGames",
  description: "Instant browser party games. No logins, just a link."
};

export default function Page() {
  const games = getAllGames();

  return (
    <main className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          WebPartyGames
        </h1>
        <p className="text-lg md:text-xl text-slate-300 max-w-2xl">
          Instant browser party games. No logins, just a link.
        </p>
        <p className="text-sm md:text-base text-slate-400 max-w-3xl">
          Pick a game, start a party, and pass the phone around. MVP is same-device
          multiplayer, designed to be online-ready later.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Games
          </h2>
          <div className="text-sm text-slate-400">1 game</div>
        </div>
        <GameGrid games={games} />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:p-6 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">How it works</h2>
        <ul className="text-sm md:text-base text-slate-300 space-y-2">
          <li>Choose a game.</li>
          <li>Tap Start Party to create a room.</li>
          <li>Play together on the same screen.</li>
        </ul>
        <p className="text-xs md:text-sm text-slate-400">
          No accounts, no servers storing your data. Online multiplayer is designed
          as a future drop-in upgrade via a RealtimeProvider.
        </p>
      </section>
    </main>
  );
}


