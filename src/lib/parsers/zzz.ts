import type { PullRecord } from "../db"
import { ZZZ_AGENT_NAMES, ZZZ_WENGINE_NAMES } from "../../data/item-names-zzz"

/**
 * Parse zzz.rng.moe JSON export for Zenless Zone Zero.
 *
 * JSON: { version, game, data: { profiles: { "1": { stores: { "0": {
 *   gachaTypes: {...}, items: { "1001": [...], "2001": [...], ... }
 * }}}}}}
 *
 * Banner types: 1001=standard, 2001=character, 3001=W-Engine, 5001=Bangboo, 12001=secondary char
 *
 * Pull: { uid, id, timestamp, rarity, gacha, gachaType, pity, no, result }
 *   rarity: 2=B-rank(3-star), 3=A-rank(4-star), 4=S-rank(5-star)
 *   result: 0=B-rank, 1=featured/on-banner, 2=off-banner, 3=guaranteed/standard
 * Pulls ordered oldest-first.
 */

const BANNER_TYPE_MAP: Record<string, string> = {
  "1001": "standard",
  "2001": "character",
  "3001": "wengine",
  "5001": "bangboo",
  "12001": "character",
}

/** ZZZ rarity to normalized 3/4/5 scale */
function normalizeRarity(zzzRarity: number): number {
  if (zzzRarity === 4) return 5 // S-rank
  if (zzzRarity === 3) return 4 // A-rank
  return 3 // B-rank
}

function lookupName(itemId: number): string {
  return (
    ZZZ_AGENT_NAMES[itemId] ??
    ZZZ_WENGINE_NAMES[itemId] ??
    `Item #${itemId}`
  )
}

function resultToRateUp(result: number): boolean | null {
  if (result === 0) return null // B-rank
  if (result === 1) return true // featured
  if (result === 2) return false // off-banner
  if (result === 3) return null // guaranteed/standard pool
  return null
}

export function parseZZZ(data: unknown): PullRecord[] {
  const json = data as Record<string, unknown>
  const records: PullRecord[] = []

  // Navigate to items
  const dataObj = json.data as Record<string, unknown> | undefined
  const profiles = dataObj?.profiles as Record<string, unknown> | undefined
  if (!profiles) return records

  // Get first profile
  const profileKey = Object.keys(profiles)[0]
  if (!profileKey) return records

  const profile = profiles[profileKey] as Record<string, unknown>
  const stores = profile?.stores as Record<string, unknown> | undefined
  if (!stores) return records

  const storeKey = Object.keys(stores)[0]
  if (!storeKey) return records

  const store = stores[storeKey] as Record<string, unknown>
  const items = store?.items as Record<string, unknown[]> | undefined
  if (!items) return records

  for (const [bannerKey, bannerType] of Object.entries(BANNER_TYPE_MAP)) {
    const pulls = items[bannerKey] as Array<Record<string, unknown>> | undefined
    if (!pulls) continue

    for (const pull of pulls) {
      const itemId = pull.id as number
      const rarity = normalizeRarity((pull.rarity as number) ?? 2)
      const timestamp = pull.timestamp as number

      records.push({
        gameId: "zzz",
        bannerType,
        itemId: String(itemId),
        itemName: lookupName(itemId),
        rarity,
        pity: (pull.pity as number) ?? 0,
        timestamp: new Date(timestamp).toISOString(),
        isRateUp: resultToRateUp((pull.result as number) ?? 0),
        rawData: pull,
      })
    }
  }

  return records
}

export function detectZZZ(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false
  const json = data as Record<string, unknown>
  return json.game === "zzz" || (json.version !== undefined && json.data !== undefined && !("siteVersion" in json))
}
