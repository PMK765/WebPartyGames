"use client";

import { useState } from "react";
import type { GameDefinition } from "@/lib/games/types";
import { GameShell, type GamePhase } from "@/components/GameShell";
import { MiniBilliardsGame } from "@/lib/games/mini-billiards/MiniBilliardsGame";
import { ResistanceGame } from "@/lib/games/resistance/ResistanceGame";
import { WarGame } from "@/lib/games/war/WarGame";

type Props = {
  game: GameDefinition;
  roomId: string;
};

export function GameRuntimeClient({ game, roomId }: Props) {
  const [phase, setPhase] = useState<GamePhase>("lobby");

  const steps =
    game.slug === "resistance"
      ? ["Join the room", "Host starts the game", "Vote on teams", "Spies sabotage missions"]
      : game.slug === "war"
        ? ["Join the room", "Host starts the game", "Flip cards", "War on ties"]
      : ["Join the room", "Host starts the game", "Aim and shoot on your turn", "Pot targets for points"];

  const content =
    game.slug === "resistance" ? (
      <ResistanceGame roomId={roomId} gameDefinition={game} onPhaseChange={setPhase} />
    ) : game.slug === "war" ? (
      <WarGame roomId={roomId} gameDefinition={game} onPhaseChange={setPhase} />
    ) : (
      <MiniBilliardsGame roomId={roomId} gameDefinition={game} onPhaseChange={setPhase} />
    );

  return (
    <GameShell title={game.name} roomId={roomId} phase={phase} steps={steps}>
      {content}
    </GameShell>
  );
}


