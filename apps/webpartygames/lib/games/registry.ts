import type { GameDefinition, GameSlug } from "@/lib/games/types";

const GAMES: readonly GameDefinition[] = [
  {
    slug: "precision-shot",
    name: "Precision Shot",
    shortDescription: "Secret target. Pick your power. Chaos decides the clutch.",
    description:
      "A chaotic target-shooting party game. Everyone picks a power from 0–100, a hidden chaos offset hits, and the closest final shot wins the round.",
    minPlayers: 2,
    maxPlayers: 6,
    categories: ["party"],
    modes: ["online-ready"],
    estimatedMinutes: 8,
    iconName: "target",
    tags: ["Party", "2–6 players", "Online-ready", "Realtime room"],
    rules: [
      "Join the room (2–6 players).",
      "Each round, pick a power from 0–100.",
      "A hidden chaos offset is applied to everyone.",
      "Closest final shot to the secret target wins +1."
    ]
  },
  {
    slug: "mini-billiards",
    name: "Mini Billiards",
    shortDescription: "Turn-based pool-lite with simple aiming and quick shots.",
    description:
      "A tiny top-down billiards table. Take turns setting angle and power, shoot the cue ball, and pot targets for points.",
    minPlayers: 2,
    maxPlayers: 4,
    categories: ["sports", "turn-based"],
    modes: ["online-ready"],
    estimatedMinutes: 10,
    iconName: "billiards",
    tags: ["Sports", "2–4 players", "Online-ready", "Turn-based"],
    rules: [
      "Join the room (2–4 players).",
      "On your turn, set angle and power.",
      "Pot target balls for +1 each.",
      "Potting the cue ball costs −1."
    ]
  }
] as const;

export function getAllGames() {
  return GAMES;
}

export function getGameBySlug(slug: GameSlug) {
  return GAMES.find((g) => g.slug === slug);
}


