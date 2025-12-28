import type { GameDefinition, GameSlug } from "@/lib/games/types";

const GAMES: readonly GameDefinition[] = [
  {
    slug: "tap-battle",
    name: "Tap Battle",
    shortDescription: "Split-screen speed tapping. First to the target wins.",
    description:
      "A fast same-device showdown. Each player taps their zone as quickly as possible. First to reach the target wins the round.",
    minPlayers: 2,
    maxPlayers: 4,
    categories: ["real-time", "party"],
    modes: ["same-device", "online-ready"],
    estimatedMinutes: 2,
    iconName: "hand-tap",
    tags: ["Party", "2–4 players", "Same device", "Real-time"],
    rules: [
      "Choose 2–4 players.",
      "Start the round to reset scores.",
      "Each player taps only their zone.",
      "First to reach the target wins."
    ]
  },
  {
    slug: "emoji-guess",
    name: "Emoji Guess",
    shortDescription: "Guess the phrase from emojis. Quick, loud, chaotic.",
    description:
      "One screen, everyone guesses. Read the emojis, shout your answer, and keep score however you want. Online-ready architecture, same-device MVP.",
    minPlayers: 2,
    maxPlayers: 12,
    categories: ["party"],
    modes: ["same-device", "online-ready"],
    estimatedMinutes: 10,
    iconName: "emoji",
    tags: ["Party", "2–12 players", "Same device", "Online-ready"],
    rules: [
      "One person hosts and reads the prompt.",
      "Everyone guesses out loud.",
      "Award points however you like.",
      "Rotate host and keep playing."
    ]
  },
  {
    slug: "word-duel",
    name: "Word Duel",
    shortDescription: "Turn-based word challenges with fast rounds.",
    description:
      "A simple turn-based word duel on one device. Pass the screen, follow the prompt, and keep the streak alive. Online-ready later.",
    minPlayers: 2,
    maxPlayers: 8,
    categories: ["party", "turn-based"],
    modes: ["same-device", "online-ready"],
    estimatedMinutes: 8,
    iconName: "type",
    tags: ["Party", "2–8 players", "Same device", "Turn-based"],
    rules: [
      "Pick a starting player.",
      "Follow the prompt and enter a word.",
      "Pass the device to the next player.",
      "If someone can’t answer, the round ends."
    ]
  }
] as const;

export function getAllGames() {
  return GAMES;
}

export function getGameBySlug(slug: GameSlug) {
  return GAMES.find((g) => g.slug === slug);
}


