import Dexie, { type EntityTable } from "dexie"
import type { GameId } from "./games"

export interface PullRecord {
  id?: number
  gameId: GameId
  bannerType: string
  itemId: string
  itemName: string
  rarity: number
  pity: number
  timestamp: string
  isRateUp: boolean | null
  rawData: Record<string, unknown>
}

export interface TimelineEntry {
  id?: number
  gameId: GameId
  version: string
  phase: 1 | 2
  startDate: string
  characterName: string | null
  characterPortrait: Blob | null
  valueTier: "limited" | "rerun" | "standard" | "four-star"
  isSpeculation: boolean
  isPriority: boolean
  pullStatus: "none" | "secured" | "failed"
  pullingWeapon: boolean
  /** Sub-lane for games with multiple banner types (Uma: "character" | "support") */
  bannerLane?: "character" | "support"
  /** Banner duration in days (for games without fixed patch cycles, e.g., Uma) */
  bannerDurationDays?: number
  /** Rate-up percentage for this specific banner (Uma: varies per banner) */
  rateUpPercent?: number
  /** Current spark counter for this banner target */
  sparkCount?: number
  /** Support card dupe count (Uma: 0-5 for limit breaking) */
  dupeCount?: number
}

export interface ResourceSnapshot {
  id?: number
  gameId: GameId
  updatedAt: string
  currency: number
  pullItems: number
  /** Dedicated weapon banner pull items (e.g., WuWa Forging Tide). 0 for games without separate weapon pulls. */
  weaponPullItems: number
  paidCurrency: number
  currentPity: number
  isGuaranteed: boolean
  weaponCurrentPity: number
  weaponIsGuaranteed: boolean
  weaponFatePoints: number
  monthlyPassActive: boolean
  monthlyPassExpiry: string | null
  dailyCommissionsActive: boolean
  /** Secondary pull items (Uma: Support Card Scout Tickets) */
  secondaryPullItems?: number
  /** Character banner spark counter (Uma) */
  charSparkCount?: number
  /** Support card banner spark counter (Uma) */
  supportSparkCount?: number
}

export interface CharacterRegistration {
  id?: number
  gameId: GameId
  displayName: string
  internalId: string | null
  portrait: Blob | null
  releaseVersion: string | null
  releasePhase: 1 | 2 | null
  releaseDate: string | null
  valueTier: "limited" | "rerun" | "standard" | "four-star"
}

/** Tracks which combat mode resets have been claimed (rewards added to currency) */
export interface CombatRewardClaim {
  id?: number
  /** Combat mode ID (e.g., "gi-abyss") */
  modeId: string
  /** ISO date string of the reset that was claimed */
  resetDate: string
  /** Amount of currency added */
  amount: number
  /** When the claim was processed */
  claimedAt: string
}

const db = new Dexie("CrvnGachaTracker") as Dexie & {
  pulls: EntityTable<PullRecord, "id">
  timeline: EntityTable<TimelineEntry, "id">
  resources: EntityTable<ResourceSnapshot, "id">
  characters: EntityTable<CharacterRegistration, "id">
  combatClaims: EntityTable<CombatRewardClaim, "id">
}

db.version(1).stores({
  pulls: "++id, gameId, bannerType, timestamp, rarity",
  timeline: "++id, gameId, version, startDate",
  resources: "++id, gameId, updatedAt",
  characters: "++id, gameId, displayName, internalId",
})

db.version(2).stores({
  pulls: "++id, gameId, bannerType, timestamp, rarity",
  timeline: "++id, gameId, version, startDate",
  resources: "++id, gameId, updatedAt",
  characters: "++id, gameId, displayName, internalId",
}).upgrade(tx => {
  return tx.table("timeline").toCollection().modify(entry => {
    if (entry.isPriority === undefined) entry.isPriority = false
    if (entry.pullStatus === undefined) entry.pullStatus = "none"
  })
})

db.version(3).stores({
  pulls: "++id, gameId, bannerType, timestamp, rarity",
  timeline: "++id, gameId, version, startDate",
  resources: "++id, gameId, updatedAt",
  characters: "++id, gameId, displayName, internalId",
}).upgrade(tx => {
  return tx.table("resources").toCollection().modify(entry => {
    if (entry.dailyCommissionsActive === undefined) entry.dailyCommissionsActive = false
  })
})

db.version(4).stores({
  pulls: "++id, gameId, bannerType, timestamp, rarity",
  timeline: "++id, gameId, version, startDate",
  resources: "++id, gameId, updatedAt",
  characters: "++id, gameId, displayName, internalId",
}).upgrade(tx => {
  tx.table("resources").toCollection().modify(entry => {
    if (entry.weaponCurrentPity === undefined) entry.weaponCurrentPity = 0
    if (entry.weaponIsGuaranteed === undefined) entry.weaponIsGuaranteed = false
    if (entry.weaponFatePoints === undefined) entry.weaponFatePoints = 0
  })
  tx.table("timeline").toCollection().modify(entry => {
    if (entry.pullingWeapon === undefined) entry.pullingWeapon = false
  })
})

db.version(5).stores({
  pulls: "++id, gameId, bannerType, timestamp, rarity",
  timeline: "++id, gameId, version, startDate",
  resources: "++id, gameId, updatedAt",
  characters: "++id, gameId, displayName, internalId",
}).upgrade(tx => {
  return tx.table("resources").toCollection().modify(entry => {
    // Rename weaponPullItems -> paidCurrency (was tracking wrong item type)
    if (entry.weaponPullItems !== undefined) {
      entry.paidCurrency = 0 // reset since old value tracked a different item
      delete entry.weaponPullItems
    }
    if (entry.paidCurrency === undefined) entry.paidCurrency = 0
  })
})

db.version(6).stores({
  pulls: "++id, gameId, bannerType, timestamp, rarity",
  timeline: "++id, gameId, version, startDate",
  resources: "++id, gameId, updatedAt",
  characters: "++id, gameId, displayName, internalId",
  combatClaims: "++id, modeId, resetDate",
})

db.version(7).stores({
  pulls: "++id, gameId, bannerType, timestamp, rarity",
  timeline: "++id, gameId, version, startDate",
  resources: "++id, gameId, updatedAt",
  characters: "++id, gameId, displayName, internalId",
  combatClaims: "++id, modeId, resetDate",
}).upgrade(tx => {
  return tx.table("resources").toCollection().modify(entry => {
    if (entry.weaponPullItems === undefined) entry.weaponPullItems = 0
  })
})

db.version(8).stores({
  pulls: "++id, gameId, bannerType, timestamp, rarity",
  timeline: "++id, gameId, version, startDate, bannerLane",
  resources: "++id, gameId, updatedAt",
  characters: "++id, gameId, displayName, internalId",
  combatClaims: "++id, modeId, resetDate",
}).upgrade(tx => {
  tx.table("timeline").toCollection().modify(entry => {
    if (entry.bannerLane === undefined) entry.bannerLane = undefined
    if (entry.bannerDurationDays === undefined) entry.bannerDurationDays = undefined
    if (entry.rateUpPercent === undefined) entry.rateUpPercent = undefined
    if (entry.sparkCount === undefined) entry.sparkCount = undefined
    if (entry.dupeCount === undefined) entry.dupeCount = undefined
  })
  tx.table("resources").toCollection().modify(entry => {
    if (entry.secondaryPullItems === undefined) entry.secondaryPullItems = 0
    if (entry.charSparkCount === undefined) entry.charSparkCount = 0
    if (entry.supportSparkCount === undefined) entry.supportSparkCount = 0
  })
})

export { db }
