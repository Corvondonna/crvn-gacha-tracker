import type { PullRecord } from "../db"

/**
 * Parse wuwatracker.com JSON export for Wuthering Waves.
 *
 * JSON: { siteVersion, version, date, playerId, pulls: [...] }
 *
 * All pulls in a single flat array. Filter by cardPoolType:
 *   1=character event, 2=weapon event, 3=beginner, 4=standard
 *
 * Pull: { cardPoolType, resourceId, qualityLevel, name, time, group }
 *   qualityLevel: 3/4/5
 *
 * No pity field - must be computed.
 * No rate/result field - 50/50 must be computed against known limited characters.
 * Has human-readable name field.
 * Pulls ordered newest-first - must reverse for pity computation.
 */

const POOL_TYPE_MAP: Record<number, string> = {
  1: "character",
  2: "weapon",
  3: "beginner",
  4: "standard",
}

/** Known limited 5-star characters (not in standard pool) */
const LIMITED_CHARACTERS = new Set([
  "Jinhsi", "Yinlin", "Changli", "Zhezhi", "Xiangli Yao",
  "Jiyan", "Encore", "Calcharo",
  "Shorekeeper", "Camellya", "Carlotta", "Roccia",
  "Brant", "Phoebe", "Zani", "Aemeath",
])

/** Known limited 5-star weapons */
const LIMITED_WEAPONS = new Set([
  "Ages of Harvest", "Verdant Summit", "Lustrous Razor",
  "Stringmaster", "Rime-Draped Sprouts", "Blazing Brilliance",
  "Abyss Surges", "Stellar Symphony", "Cosmos Riptide",
  "Red Spring", "Static Mist", "Scarlet String",
  "Pardoner's Grace", "Lumingloss",
])

export function parseWuWa(data: unknown): PullRecord[] {
  const json = data as Record<string, unknown>
  const rawPulls = json.pulls as Array<Record<string, unknown>> | undefined
  if (!rawPulls) return []

  // Reverse to oldest-first for pity computation
  const sorted = [...rawPulls].reverse()

  // Track pity per banner type
  const pityCounters: Record<string, number> = {}
  const records: PullRecord[] = []

  for (const pull of sorted) {
    const poolType = pull.cardPoolType as number
    const bannerType = POOL_TYPE_MAP[poolType] ?? "unknown"
    const quality = (pull.qualityLevel as number) ?? 3
    const name = (pull.name as string) ?? `Item #${pull.resourceId}`
    const time = (pull.time as string) ?? ""

    // Increment pity counter for this banner
    const pityKey = bannerType
    pityCounters[pityKey] = (pityCounters[pityKey] ?? 0) + 1

    const pity = pityCounters[pityKey]

    // Reset pity on 5-star hit
    if (quality === 5) {
      pityCounters[pityKey] = 0
    }

    // Determine rate-up status for 5-stars
    let isRateUp: boolean | null = null
    if (quality === 5) {
      if (bannerType === "character") {
        isRateUp = LIMITED_CHARACTERS.has(name)
      } else if (bannerType === "weapon") {
        isRateUp = LIMITED_WEAPONS.has(name)
      }
    }

    records.push({
      gameId: "wuwa",
      bannerType,
      itemId: String(pull.resourceId ?? ""),
      itemName: name,
      rarity: quality,
      pity,
      timestamp: time ? new Date(time).toISOString() : "",
      isRateUp,
      rawData: pull,
    })
  }

  return records
}

export function detectWuWa(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false
  const json = data as Record<string, unknown>
  return "siteVersion" in json && "playerId" in json && "pulls" in json
}
