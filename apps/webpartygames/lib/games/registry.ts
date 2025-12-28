import type { GameDefinition, GameSlug } from "@/lib/games/types";

const GAMES: readonly GameDefinition[] = [
  {
    slug: "resistance",
    name: "The Resistance",
    shortDescription: "Social deduction: vote on teams, run missions, find the spies.",
    description:
      "A phone-first social deduction game. Players vote to approve mission teams; spies try to sabotage missions without being discovered.",
    minPlayers: 5,
    maxPlayers: 10,
    categories: ["party"],
    modes: ["online-ready"],
    estimatedMinutes: 25,
    iconName: "mask",
    tags: ["Party", "5–10 players", "Online-ready", "Hidden roles"],
    rules: [
      "Everyone gets a secret role: Resistance or Spy.",
      "Each mission, the leader proposes a team.",
      "Everyone votes to approve or reject the team.",
      "Approved teams run a mission; spies may sabotage."
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


