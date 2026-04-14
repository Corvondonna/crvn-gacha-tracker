import type { GameId } from "@/lib/games"

export interface PatchAnchor {
  gameId: GameId
  version: string
  phase1Start: Date
}

/**
 * Known verified patch start dates. The timeline engine uses these
 * as reference points to calculate all other dates forward and backward.
 *
 * One anchor per game is enough. Pick the most recently verified date.
 */
export const PATCH_ANCHORS: PatchAnchor[] = [
  // Genshin Impact 6.5 - Apr 8, 2026 (Wed)
  { gameId: "genshin", version: "6.5", phase1Start: new Date(2026, 3, 8) },

  // Honkai Star Rail 4.2 - Apr 22, 2026 (Wed)
  { gameId: "hsr", version: "4.2", phase1Start: new Date(2026, 3, 22) },

  // Zenless Zone Zero 2.7 - Mar 25, 2026 (Wed)
  { gameId: "zzz", version: "2.7", phase1Start: new Date(2026, 2, 25) },

  // Wuthering Waves 3.2 - Mar 19, 2026 (Thu)
  { gameId: "wuwa", version: "3.2", phase1Start: new Date(2026, 2, 19) },
]
