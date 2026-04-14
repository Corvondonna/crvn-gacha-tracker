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
}

export interface ResourceSnapshot {
  id?: number
  gameId: GameId
  updatedAt: string
  currency: number
  pullItems: number
  weaponPullItems: number
  currentPity: number
  isGuaranteed: boolean
  monthlyPassActive: boolean
  monthlyPassExpiry: string | null
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

export { db }
