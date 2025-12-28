"use client";

import { useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import { GameShell, type GamePhase } from "@/components/GameShell";
import { PrecisionShotGame } from "@/lib/games/precision-shot/PrecisionShotGame";
import { MiniBilliardsGame } from "@/lib/games/mini-billiards/MiniBilliardsGame";

type Props = {
  game: GameDefinition;
  roomId: string;
};

export function GameRuntimeClient({ game, roomId }: Props) {
  const [phase, setPhase] = useState<GamePhase>("lobby");

  const steps =
    game.slug === "precision-shot"
      ? ["Join the room", "Host starts the game", "Pick power each round", "Closest wins +1"]
      : ["Join the room", "Host starts the game", "Aim and shoot on your turn", "Pot targets for points"];

  const content =
    game.slug === "precision-shot" ? (
      <PrecisionShotGame roomId={roomId} gameDefinition={game} onPhaseChange={setPhase} />
    ) : (
      <MiniBilliardsGame roomId={roomId} gameDefinition={game} onPhaseChange={setPhase} />
    );

  return (
    <GameShell title={game.name} roomId={roomId} phase={phase} steps={steps}>
      {content}
    </GameShell>
  );
}


