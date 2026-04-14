export type GameId = "genshin" | "hsr" | "zzz" | "wuwa"

export interface GameConfig {
  id: GameId
  name: string
  shortName: string
  currency: string
  pullItem: string
  weaponPullItem: string
  pity5Star: number
  softPityStart: number
  weaponPity: number
  monthlyPass: string
  accentVar: string
  patchCycle: {
    durationDays: number
    patchDay: string
    phase2OffsetDays: number
    livestreamOffsetDays: number
  }
}

export const GAMES: Record<GameId, GameConfig> = {
  genshin: {
    id: "genshin",
    name: "Genshin Impact",
    shortName: "GI",
    currency: "Primogems",
    pullItem: "Intertwined Fate",
    weaponPullItem: "Acquaint Fate",
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    monthlyPass: "Blessing of Welkin Moon",
    accentVar: "--genshin",
    patchCycle: {
      durationDays: 42,
      patchDay: "Wednesday",
      phase2OffsetDays: 20,
      livestreamOffsetDays: 30,
    },
  },
  hsr: {
    id: "hsr",
    name: "Honkai Star Rail",
    shortName: "HSR",
    currency: "Stellar Jade",
    pullItem: "Star Rail Special Pass",
    weaponPullItem: "Star Rail Pass",
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    monthlyPass: "Express Supply Pass",
    accentVar: "--hsr",
    patchCycle: {
      durationDays: 42,
      patchDay: "Wednesday",
      phase2OffsetDays: 20,
      livestreamOffsetDays: 30,
    },
  },
  zzz: {
    id: "zzz",
    name: "Zenless Zone Zero",
    shortName: "ZZZ",
    currency: "Polychrome",
    pullItem: "Encrypted Master Tape",
    weaponPullItem: "Bangboo Ticket",
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    monthlyPass: "Inter-Knot Membership",
    accentVar: "--zzz",
    patchCycle: {
      durationDays: 42,
      patchDay: "Wednesday",
      phase2OffsetDays: 20,
      livestreamOffsetDays: 30,
    },
  },
  wuwa: {
    id: "wuwa",
    name: "Wuthering Waves",
    shortName: "WuWa",
    currency: "Astrite",
    pullItem: "Radiant Tide",
    weaponPullItem: "Forging Tide",
    pity5Star: 80,
    softPityStart: 66,
    weaponPity: 80,
    monthlyPass: "Lunite Subscription",
    accentVar: "--wuwa",
    patchCycle: {
      durationDays: 42,
      patchDay: "Thursday",
      phase2OffsetDays: 21,
      livestreamOffsetDays: 29,
    },
  },
}

export const GAME_IDS: GameId[] = ["genshin", "hsr", "zzz", "wuwa"]
