import Link from "next/link";
import type { GameDefinition } from "@/lib/games/types";

type Props = {
  game: GameDefinition;
};

export function GameCard({ game }: Props) {
  const playersLabel =
    game.minPlayers === game.maxPlayers
      ? `${game.minPlayers} players`
      : `${game.minPlayers}–${game.maxPlayers} players`;

  return (
    <Link
      href={`/game/${game.slug}`}
      className="group block rounded-2xl border border-slate-800 bg-slate-900/40 p-5 hover:border-emerald-400 hover:bg-slate-900/60 transition"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">{game.name}</h3>
          <p className="text-sm text-slate-300">{game.shortDescription}</p>
        </div>
        <div className="shrink-0 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
          <div className="font-semibold text-slate-100">{playersLabel}</div>
          <div className="text-slate-400">{game.estimatedMinutes} min</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {game.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-xs text-slate-300"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}


