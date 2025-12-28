import type { GameDefinition } from "@/lib/games/types";
import { GameCard } from "@/components/GameCard";

type Props = {
  games: readonly GameDefinition[];
};

export function GameGrid({ games }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {games.map((game) => (
        <GameCard key={game.slug} game={game} />
      ))}
    </div>
  );
}


