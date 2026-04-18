export type GameId = "genshin" | "hsr" | "zzz" | "wuwa" | "uma"

export interface GameConfig {
  id: GameId
  name: string
  shortName: string
  currency: string
  pullItem: string
  /** Separate weapon banner pull item (only WuWa has this; null = same as pullItem) */
  weaponPullItem: string | null
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
  /** Hour of day (0-23, local time) when daily rewards reset */
  dailyResetHour: number
  accentVar: string
  patchCycle: {
    durationDays: number
    patchDay: string
    phase2OffsetDays: number
    livestreamOffsetDays: number
  }
  /** Whether this game uses a fixed patch cycle (false = manual banner dates) */
  hasPatchCycle: boolean
  /** Sub-lane configuration for timeline (e.g., Uma has character + support lanes) */
  timelineLanes?: string[]
  /** Secondary pull item for games with two banner types (Uma support card tickets) */
  secondaryPullItem?: string | null
  /** Spark system: guaranteed pick after N pulls on a single banner (0 = no spark) */
  sparkThreshold: number
  /** Whether spark counter carries across banners (false = resets each banner) */
  sparkCarries: boolean
  /** Whether the game uses a 50/50 system */
  has5050: boolean
}

export const GAMES: Record<GameId, GameConfig> = {
  genshin: {
    id: "genshin",
    name: "Genshin Impact",
    shortName: "GI",
    currency: "Primogems",
    pullItem: "Intertwined Fate",
    weaponPullItem: null,
    paidCurrency: "Genesis Crystals",
    currencyPerPull: 160,
    baseRate5Star: 0.006,
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    weaponSoftPityStart: 64,
    weaponBaseRate: 0.007,
    weaponGuaranteed: false,
    weaponMaxFatePoints: 0,
    monthlyPass: "Blessing of Welkin Moon",
    monthlyPassDaily: 90,
    dailyCommissionIncome: 60,
    dailyResetHour: 4,
    accentVar: "--genshin",
    patchCycle: {
      durationDays: 42,
      patchDay: "Wednesday",
      phase2OffsetDays: 20,
      livestreamOffsetDays: 30,
    },
    hasPatchCycle: true,
    sparkThreshold: 0,
    sparkCarries: false,
    has5050: true,
  },
  hsr: {
    id: "hsr",
    name: "Honkai Star Rail",
    shortName: "HSR",
    currency: "Stellar Jade",
    pullItem: "Star Rail Special Pass",
    weaponPullItem: null,
    paidCurrency: "Oneiric Shard",
    currencyPerPull: 160,
    baseRate5Star: 0.006,
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    weaponSoftPityStart: 64,
    weaponBaseRate: 0.007,
    weaponGuaranteed: false,
    weaponMaxFatePoints: 0,
    monthlyPass: "Express Supply Pass",
    monthlyPassDaily: 90,
    dailyCommissionIncome: 60,
    dailyResetHour: 4,
    accentVar: "--hsr",
    patchCycle: {
      durationDays: 42,
      patchDay: "Wednesday",
      phase2OffsetDays: 20,
      livestreamOffsetDays: 30,
    },
    hasPatchCycle: true,
    sparkThreshold: 0,
    sparkCarries: false,
    has5050: true,
  },
  zzz: {
    id: "zzz",
    name: "Zenless Zone Zero",
    shortName: "ZZZ",
    currency: "Polychrome",
    pullItem: "Encrypted Master Tape",
    weaponPullItem: null,
    paidCurrency: "Monochromes",
    currencyPerPull: 160,
    baseRate5Star: 0.006,
    pity5Star: 90,
    softPityStart: 74,
    weaponPity: 80,
    weaponSoftPityStart: 64,
    weaponBaseRate: 0.007,
    weaponGuaranteed: false,
    weaponMaxFatePoints: 0,
    monthlyPass: "Inter-Knot Membership",
    monthlyPassDaily: 90,
    dailyCommissionIncome: 60,
    dailyResetHour: 4,
    accentVar: "--zzz",
    patchCycle: {
      durationDays: 42,
      patchDay: "Wednesday",
      phase2OffsetDays: 21,
      livestreamOffsetDays: 30,
    },
    hasPatchCycle: true,
    sparkThreshold: 0,
    sparkCarries: false,
    has5050: true,
  },
  wuwa: {
    id: "wuwa",
    name: "Wuthering Waves",
    shortName: "WuWa",
    currency: "Astrite",
    pullItem: "Radiant Tide",
    weaponPullItem: "Forging Tide",
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
    dailyResetHour: 4,
    accentVar: "--wuwa",
    patchCycle: {
      durationDays: 42,
      patchDay: "Thursday",
      phase2OffsetDays: 21,
      livestreamOffsetDays: 29,
    },
    hasPatchCycle: true,
    sparkThreshold: 0,
    sparkCarries: false,
    has5050: true,
  },
  uma: {
    id: "uma",
    name: "Umamusume: Pretty Derby",
    shortName: "Uma",
    currency: "Carats",
    pullItem: "Trainee Scout Ticket",
    weaponPullItem: null,
    secondaryPullItem: "Support Card Scout Ticket",
    paidCurrency: "Paid Carats",
    currencyPerPull: 150,
    baseRate5Star: 0.03,
    pity5Star: 200,
    softPityStart: 200,
    weaponPity: 200,
    weaponSoftPityStart: 200,
    weaponBaseRate: 0.03,
    weaponGuaranteed: false,
    weaponMaxFatePoints: 0,
    monthlyPass: "Daily Carat Pack",
    monthlyPassDaily: 50,
    dailyCommissionIncome: 75,
    dailyResetHour: 23,
    accentVar: "--uma",
    patchCycle: {
      durationDays: 14,
      patchDay: "N/A",
      phase2OffsetDays: 0,
      livestreamOffsetDays: 0,
    },
    hasPatchCycle: false,
    timelineLanes: ["character", "support"],
    sparkThreshold: 200,
    sparkCarries: false,
    has5050: false,
  },
}

export const GAME_IDS: GameId[] = ["genshin", "hsr", "zzz", "wuwa", "uma"]
