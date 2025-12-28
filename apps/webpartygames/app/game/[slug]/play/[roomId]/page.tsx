import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameRuntimeClient } from "@/components/GameRuntimeClient";
import { getGameBySlug } from "@/lib/games/registry";
import type { GameSlug } from "@/lib/games/types";

type PageProps = {
  params: { slug: string; roomId: string };
};

export function generateMetadata({ params }: PageProps): Metadata {
  const game = getGameBySlug(params.slug as GameSlug);

  if (!game) {
    return {
      title: "Play",
      description: "WebPartyGames"
    };
  }

  return {
    title: `Play ${game.name}`,
    description: `Room ${params.roomId} — ${game.name}`
  };
}

export default function Page({ params }: PageProps) {
  const game = getGameBySlug(params.slug as GameSlug);
  if (!game) notFound();

  const roomId = params.roomId.trim();
  if (!roomId) notFound();

  return (
    <main>
      <GameRuntimeClient game={game} roomId={roomId} />
    </main>
  );
}


