export type GameCategory = "party" | "real-time" | "turn-based" | "sports";

export type GameMode = "same-device" | "online-ready";

export const GAME_SLUGS = ["precision-shot", "mini-billiards"] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export type GameDefinition = {
  slug: GameSlug;
  name: string;
  shortDescription: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  categories: readonly GameCategory[];
  modes: readonly GameMode[];
  estimatedMinutes: number;
  iconName: string;
  tags: readonly string[];
  rules: readonly string[];
};


