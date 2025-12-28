"use client";

import { useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import { getLocalRealtimeProvider } from "@/lib/realtime/local";
import { GameShell, type GamePhase } from "@/components/GameShell";
import { TapBattle } from "@/lib/games/tap-battle/TapBattle";
import { ComingSoon } from "@/lib/games/coming-soon/ComingSoon";

type Props = {
  game: GameDefinition;
  roomId: string;
};

export function GameRuntimeClient({ game, roomId }: Props) {
  const realtime = getLocalRealtimeProvider();
  const [phase, setPhase] = useState<GamePhase>("lobby");

  const steps =
    game.slug === "tap-battle"
      ? ["Choose 2–4 players", "Start the round", "Tap fast", "First to target wins"]
      : ["This game is not playable yet", "Check back soon"];

  const content =
    game.slug === "tap-battle" ? (
      <TapBattle
        game={game}
        roomId={roomId}
        realtimeProvider={realtime}
        onPhaseChange={setPhase}
      />
    ) : (
      <ComingSoon gameName={game.name} />
    );

  return (
    <GameShell title={game.name} roomId={roomId} phase={phase} steps={steps}>
      {content}
    </GameShell>
  );
}


