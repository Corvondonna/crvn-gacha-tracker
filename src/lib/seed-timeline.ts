import { db, type TimelineEntry } from "./db"
import type { GameId } from "./games"

interface SeedEntry {
  gameId: GameId
  version: string
  phase: 1 | 2
  characterName: null
  valueTier: TimelineEntry["valueTier"]
  isSpeculation: boolean
  isPriority: boolean
  pullStatus: TimelineEntry["pullStatus"]
  pullingWeapon: boolean
}

function slot(gameId: GameId, version: string, phase: 1 | 2, isSpeculation = false): SeedEntry {
  return {
    gameId,
    version,
    phase,
    characterName: null,
    valueTier: "limited",
    isSpeculation,
    isPriority: false,
    pullStatus: "none",
    pullingWeapon: false,
  }
}

// Genshin Impact
const GENSHIN_ENTRIES: SeedEntry[] = [
  slot("genshin", "6.2", 1),
  slot("genshin", "6.2", 2),
  slot("genshin", "6.3", 1),
  slot("genshin", "6.3", 2),
  slot("genshin", "6.4", 1),
  slot("genshin", "6.4", 2),
  slot("genshin", "6.5", 1),
  slot("genshin", "6.5", 2),
  slot("genshin", "6.6", 1, true),
  slot("genshin", "6.6", 2, true),
  slot("genshin", "6.7", 1, true),
]

// Honkai Star Rail
const HSR_ENTRIES: SeedEntry[] = [
  slot("hsr", "3.8", 1),
  slot("hsr", "3.8", 2),
  slot("hsr", "4.0", 1),
  slot("hsr", "4.0", 2),
  slot("hsr", "4.1", 1),
  slot("hsr", "4.1", 2),
  slot("hsr", "4.2", 1),
  slot("hsr", "4.2", 2),
]

// Zenless Zone Zero
const ZZZ_ENTRIES: SeedEntry[] = [
  slot("zzz", "2.5", 1),
  slot("zzz", "2.5", 2),
  slot("zzz", "2.6", 1),
  slot("zzz", "2.6", 2),
  slot("zzz", "2.7", 1),
  slot("zzz", "2.7", 2),
  slot("zzz", "2.8", 1, true),
  slot("zzz", "2.8", 2, true),
]

// Wuthering Waves
const WUWA_ENTRIES: SeedEntry[] = [
  slot("wuwa", "3.0", 1),
  slot("wuwa", "3.0", 2),
  slot("wuwa", "3.1", 1),
  slot("wuwa", "3.1", 2),
  slot("wuwa", "3.2", 1),
  slot("wuwa", "3.2", 2),
  slot("wuwa", "3.3", 1),
  slot("wuwa", "3.3", 2),
  slot("wuwa", "3.4", 1, true),
  slot("wuwa", "3.4", 2, true),
]

// Neverness to Everness
const NTE_ENTRIES: SeedEntry[] = [
  slot("nte", "1.0", 1),
  slot("nte", "1.0", 2),
  slot("nte", "1.1", 1),
  slot("nte", "1.1", 2),
  slot("nte", "1.2", 1, true),
  slot("nte", "1.2", 2, true),
  slot("nte", "1.3", 1, true),
  slot("nte", "1.3", 2, true),
  slot("nte", "1.4", 1, true),
  slot("nte", "1.4", 2, true),
  slot("nte", "1.5", 1, true),
  slot("nte", "1.5", 2, true),
]

const ALL_ENTRIES = [
  ...GENSHIN_ENTRIES,
  ...HSR_ENTRIES,
  ...ZZZ_ENTRIES,
  ...WUWA_ENTRIES,
  ...NTE_ENTRIES,
]

/**
 * Seeds the timeline with empty slots for known patch phases.
 *
 * First-run bootstrap ONLY: runs when the timeline table is completely
 * empty. The previous per-slot backfill re-added any missing
 * gameId:version:phase on every Timeline mount, which resurrected
 * entries the user had deliberately deleted.
 */
export async function seedTimeline(): Promise<number> {
  const existingCount = await db.timeline.count()
  if (existingCount > 0) return 0

  let added = 0
  for (const entry of ALL_ENTRIES) {
    await db.timeline.add({
      ...entry,
      startDate: new Date().toISOString(), // placeholder, actual date computed from anchors
      characterPortrait: null,
    })
    added++
  }

  return added
}
