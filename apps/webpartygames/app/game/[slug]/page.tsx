import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyCTA } from "@/components/PartyCTA";
import { getAllGames, getGameBySlug } from "@/lib/games/registry";
import type { GameSlug } from "@/lib/games/types";

type PageProps = {
  params: { slug: string };
};

export function generateMetadata({ params }: PageProps): Metadata {
  const game = getGameBySlug(params.slug as GameSlug);

  if (!game) {
    return {
      title: "Game",
      description: "WebPartyGames"
    };
  }

  return {
    title: game.name,
    description: game.description
  };
}

export function generateStaticParams() {
  return getAllGames().map((g) => ({ slug: g.slug }));
}

export default function Page({ params }: PageProps) {
  const game = getGameBySlug(params.slug as GameSlug);

  if (!game) notFound();

  const playersLabel =
    game.minPlayers === game.maxPlayers
      ? `${game.minPlayers} players`
      : `${game.minPlayers}–${game.maxPlayers} players`;

  return (
    <main className="space-y-10">
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              {game.name}
            </h1>
            <p className="text-slate-300 max-w-2xl">{game.description}</p>
          </div>
          <div className="shrink-0 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
            <div className="font-semibold text-slate-100">{playersLabel}</div>
            <div className="text-slate-400">{game.estimatedMinutes} min</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {game.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1 text-xs text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Rules</h2>
        <ol className="list-decimal pl-5 space-y-2 text-slate-300">
          {game.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>

      <PartyCTA slug={game.slug} />

      <section className="space-y-3 text-sm md:text-base text-slate-300">
        <h2 className="text-lg font-semibold tracking-tight">
          Same-device now, online-ready later
        </h2>
        <p>
          WebPartyGames is built to run instantly in your browser with no logins.
          Today’s MVP is same-device multiplayer, but the game architecture is
          designed to plug in a real online RealtimeProvider later.
        </p>
      </section>
    </main>
  );
}


