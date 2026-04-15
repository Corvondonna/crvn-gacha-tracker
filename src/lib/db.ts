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
}

export interface ResourceSnapshot {
  id?: number
  gameId: GameId
  updatedAt: string
  currency: number
  pullItems: number
  paidCurrency: number
  currentPity: number
  isGuaranteed: boolean
  weaponCurrentPity: number
  weaponIsGuaranteed: boolean
  weaponFatePoints: number
  monthlyPassActive: boolean
  monthlyPassExpiry: string | null
  dailyCommissionsActive: boolean
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

const db = new Dexie("CrvnGachaTracker") as Dexie & {
  pulls: EntityTable<PullRecord, "id">
  timeline: EntityTable<TimelineEntry, "id">
  resources: EntityTable<ResourceSnapshot, "id">
  characters: EntityTable<CharacterRegistration, "id">
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

export { db }
