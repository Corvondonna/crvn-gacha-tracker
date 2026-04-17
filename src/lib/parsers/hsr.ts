import LZString from "lz-string"
import type { PullRecord } from "../db"
import { HSR_CHARACTER_NAMES, HSR_LIGHTCONE_NAMES } from "../../data/item-names-hsr"

/**
 * Parse starrailstation.com .dat export for Honkai Star Rail.
 *
 * File format: 3-byte "srs" header + LZ-string UTF-16 compressed JSON.
 * Decompressed JSON: { version, profiles, data: { stores: { "1_warp-v2": { ... } } } }
 *
 * Pull arrays: items_1 (standard), items_2 (beginner), items_11 (char event),
 *              items_12 (LC event), items_21 (special/rerun)
 *
 * Pull: { uid, itemId, timestamp, gachaType, rarity, pity4, pity5, result, sort }
 *   result: 0=3-star, 2=won 50/50, 3=won/guaranteed, 4=lost 50/50
 * Pulls ordered newest-first (descending sort).
 */

const ITEMS_KEY_MAP: Record<string, string> = {
  items_1: "standard",
  items_2: "beginner",
  items_11: "character",
  items_12: "lightcone",
  items_21: "character",
}

function lookupName(itemId: number): string {
  return (
    HSR_CHARACTER_NAMES[itemId] ??
    HSR_LIGHTCONE_NAMES[itemId] ??
    `Item #${itemId}`
  )
}

function resultToRateUp(result: number): boolean | null {
  if (result === 0) return null // 3-star
  if (result === 2 || result === 3) return true // won
  if (result === 4) return false // lost 50/50
  return null
}

export function decompressHSR(raw: string): unknown {
  // Strip the 3-byte "srs" header
  const compressed = raw.substring(3)
  const json = LZString.decompressFromUTF16(compressed)
  if (!json) throw new Error("Failed to decompress HSR data")
  return JSON.parse(json)
}

export function parseHSR(data: unknown): PullRecord[] {
  const json = data as Record<string, unknown>
  const records: PullRecord[] = []

  // Navigate to warp store
  const dataObj = json.data as Record<string, unknown> | undefined
  const stores = dataObj?.stores as Record<string, unknown> | undefined
  if (!stores) return records

  // Find the warp-v2 store (key is like "1_warp-v2")
  const warpKey = Object.keys(stores).find((k) => k.includes("warp-v2"))
  if (!warpKey) return records

  const warp = stores[warpKey] as Record<string, unknown>

  for (const [itemsKey, bannerType] of Object.entries(ITEMS_KEY_MAP)) {
    const pulls = warp[itemsKey] as Array<Record<string, unknown>> | undefined
    if (!pulls) continue

    // Pulls are newest-first, reverse for chronological order
    const sorted = [...pulls].reverse()

    for (const pull of sorted) {
      const itemId = pull.itemId as number
      const rarity = (pull.rarity as number) ?? 3
      const timestamp = pull.timestamp as number
      const result = (pull.result as number) ?? 0

      records.push({
        gameId: "hsr",
        bannerType,
        itemId: String(itemId),
        itemName: lookupName(itemId),
        rarity,
        pity: (pull.pity5 as number) ?? 0,
        timestamp: new Date(timestamp).toISOString(),
        isRateUp: resultToRateUp(result),
        rawData: pull,
      })
    }
  }

  return records
}

export function detectHSR(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false
  const json = data as Record<string, unknown>

  // Check for decompressed structure
  if (json.version && json.data) {
    const dataObj = json.data as Record<string, unknown>
    if (dataObj.stores) {
      const stores = dataObj.stores as Record<string, unknown>
      return Object.keys(stores).some((k) => k.includes("warp"))
    }
  }
  return false
}
