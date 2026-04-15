export type GameId = "genshin" | "hsr" | "zzz" | "wuwa"

export interface GameConfig {
  id: GameId
  name: string
  shortName: string
  currency: string
  pullItem: string
  /** Premium currency purchasable with real money (converts 1:1 to currency) */
  paidCurrency: string
  currencyPerPull: number
  baseRate5Star: number
  pity5Star: number
  softPityStart: number
  weaponPity: number
  weaponSoftPityStart: number
  weaponBaseRate: number
  /** Whether weapon banner is 100% guaranteed (no fate points needed) */
  weaponGuaranteed: boolean
  /** Max fate points before guaranteed (only relevant if weaponGuaranteed is false) */
  weaponMaxFatePoints: number
  monthlyPass: string
  monthlyPassDaily: number
  dailyCommissionIncome: number
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
    paidCurrency: "Genesis Crystals",
    currencyPerPull: 160,
    baseRate5Star: 0.006,
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    weaponSoftPityStart: 64,
    weaponBaseRate: 0.007,
    weaponGuaranteed: false,
    weaponMaxFatePoints: 2,
    monthlyPass: "Blessing of Welkin Moon",
    monthlyPassDaily: 90,
    dailyCommissionIncome: 60,
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
    paidCurrency: "Oneiric Shard",
    currencyPerPull: 160,
    baseRate5Star: 0.006,
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    weaponSoftPityStart: 64,
    weaponBaseRate: 0.007,
    weaponGuaranteed: false,
    weaponMaxFatePoints: 2,
    monthlyPass: "Express Supply Pass",
    monthlyPassDaily: 90,
    dailyCommissionIncome: 60,
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
    paidCurrency: "Monochromes",
    currencyPerPull: 160,
    baseRate5Star: 0.006,
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    weaponSoftPityStart: 64,
    weaponBaseRate: 0.007,
    weaponGuaranteed: false,
    weaponMaxFatePoints: 2,
    monthlyPass: "Inter-Knot Membership",
    monthlyPassDaily: 90,
    dailyCommissionIncome: 60,
    accentVar: "--zzz",
    patchCycle: {
      durationDays: 42,
      patchDay: "Wednesday",
      phase2OffsetDays: 21,
      livestreamOffsetDays: 30,
    },
  },
  wuwa: {
    id: "wuwa",
    name: "Wuthering Waves",
    shortName: "WuWa",
    currency: "Astrite",
    pullItem: "Radiant Tide",
    paidCurrency: "Lunites",
    currencyPerPull: 160,
    baseRate5Star: 0.008,
    pity5Star: 80,
    softPityStart: 66,
    weaponPity: 80,
    weaponSoftPityStart: 56,
    weaponBaseRate: 0.008,
    weaponGuaranteed: true,
    weaponMaxFatePoints: 0,
    monthlyPass: "Lunite Subscription",
    monthlyPassDaily: 90,
    dailyCommissionIncome: 60,
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
