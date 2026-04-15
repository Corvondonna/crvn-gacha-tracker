import { db, type TimelineEntry } from "./db"
import type { GameId } from "./games"

interface SeedEntry {
  gameId: GameId
  version: string
  phase: 1 | 2
  characterName: string | null
  valueTier: TimelineEntry["valueTier"]
  isSpeculation: boolean
  isPriority: boolean
  pullStatus: TimelineEntry["pullStatus"]
  pullingWeapon: boolean
}

// Genshin Impact late 2025 + 2026 banners
const GENSHIN_ENTRIES: SeedEntry[] = [
  // 6.2 - Dec 3, 2025
  { gameId: "genshin", version: "6.2", phase: 1, characterName: "Durin", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "genshin", version: "6.2", phase: 2, characterName: "Varesa", valueTier: "rerun", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 6.3 - Jan 14, 2026
  { gameId: "genshin", version: "6.3", phase: 1, characterName: "Columbina", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "genshin", version: "6.3", phase: 2, characterName: "Zibai", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 6.4 - Feb 25, 2026
  { gameId: "genshin", version: "6.4", phase: 1, characterName: "Varka", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "genshin", version: "6.4", phase: 2, characterName: "Escoffier", valueTier: "rerun", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 6.5 - Apr 8, 2026
  { gameId: "genshin", version: "6.5", phase: 1, characterName: "Linnea", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "genshin", version: "6.5", phase: 2, characterName: "Lauma", valueTier: "rerun", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 6.6 - May 20, 2026 (leaked)
  { gameId: "genshin", version: "6.6", phase: 1, characterName: "Nicole", valueTier: "limited", isSpeculation: true, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "genshin", version: "6.6", phase: 2, characterName: "Lohen", valueTier: "limited", isSpeculation: true, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 6.7 - Jul 1, 2026 (speculation)
  { gameId: "genshin", version: "6.7", phase: 1, characterName: "Sandrone", valueTier: "limited", isSpeculation: true, isPriority: false, pullStatus: "none", pullingWeapon: false },
]

// Honkai Star Rail late 2025 + 2026 banners
const HSR_ENTRIES: SeedEntry[] = [
  // 3.8 - Dec 16, 2025
  { gameId: "hsr", version: "3.8", phase: 1, characterName: "Dahlia", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "hsr", version: "3.8", phase: 2, characterName: "Fugue", valueTier: "rerun", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // HSR skips 3.9, goes directly to 4.0
  // 4.0 - Feb 12, 2026
  { gameId: "hsr", version: "4.0", phase: 1, characterName: "Yao Guang", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "hsr", version: "4.0", phase: 2, characterName: "Sparxie", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 4.1 - Mar 25, 2026
  { gameId: "hsr", version: "4.1", phase: 1, characterName: "Ashveil", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "hsr", version: "4.1", phase: 2, characterName: "Boothill", valueTier: "rerun", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 4.2 - Apr 22, 2026
  { gameId: "hsr", version: "4.2", phase: 1, characterName: "Silver Wolf Lv.999", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "hsr", version: "4.2", phase: 2, characterName: "Evanescia", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
]

// Zenless Zone Zero late 2025 + 2026 banners
const ZZZ_ENTRIES: SeedEntry[] = [
  // 2.5 - Dec 30, 2025
  { gameId: "zzz", version: "2.5", phase: 1, characterName: "Ye Shunguang", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "zzz", version: "2.5", phase: 2, characterName: "Alice Thymefield", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 2.6 - Feb 6, 2026
  { gameId: "zzz", version: "2.6", phase: 1, characterName: "Sunna", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "zzz", version: "2.6", phase: 2, characterName: "Aria", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 2.7 - Mar 25, 2026
  { gameId: "zzz", version: "2.7", phase: 1, characterName: "Nangong Yu", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "zzz", version: "2.7", phase: 2, characterName: "Cissia", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 2.8 - May 6, 2026
  { gameId: "zzz", version: "2.8", phase: 1, characterName: "Promeia", valueTier: "limited", isSpeculation: true, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "zzz", version: "2.8", phase: 2, characterName: "Starlight Billy", valueTier: "limited", isSpeculation: true, isPriority: false, pullStatus: "none", pullingWeapon: false },
]

// Wuthering Waves late 2025 + 2026 banners
const WUWA_ENTRIES: SeedEntry[] = [
  // 3.0 - Dec 25, 2025
  { gameId: "wuwa", version: "3.0", phase: 1, characterName: "Lynae", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "wuwa", version: "3.0", phase: 2, characterName: "Augusta", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 3.1 - Feb 5, 2026
  { gameId: "wuwa", version: "3.1", phase: 1, characterName: "Aemeath", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "wuwa", version: "3.1", phase: 2, characterName: "Luuk Herssen", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 3.2 - Mar 19, 2026
  { gameId: "wuwa", version: "3.2", phase: 1, characterName: "Sigrika", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "wuwa", version: "3.2", phase: 2, characterName: "Lynae", valueTier: "rerun", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 3.3 - Apr 30, 2026
  { gameId: "wuwa", version: "3.3", phase: 1, characterName: "Hiyuki", valueTier: "limited", isSpeculation: false, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "wuwa", version: "3.3", phase: 2, characterName: "Denia", valueTier: "limited", isSpeculation: true, isPriority: false, pullStatus: "none", pullingWeapon: false },
  // 3.4 - Jun 11, 2026 (leaked)
  { gameId: "wuwa", version: "3.4", phase: 1, characterName: "Lucy", valueTier: "limited", isSpeculation: true, isPriority: false, pullStatus: "none", pullingWeapon: false },
  { gameId: "wuwa", version: "3.4", phase: 2, characterName: "Lucilla", valueTier: "limited", isSpeculation: true, isPriority: false, pullStatus: "none", pullingWeapon: false },
]

const ALL_ENTRIES = [
  ...GENSHIN_ENTRIES,
  ...HSR_ENTRIES,
  ...ZZZ_ENTRIES,
  ...WUWA_ENTRIES,
]

/**
 * Seeds the timeline with known 2026 banner data.
 * Only adds entries that don't already exist (won't overwrite user edits).
 */
export async function seedTimeline(): Promise<number> {
  let added = 0

  for (const entry of ALL_ENTRIES) {
    // Check if entry already exists
    const existing = await db.timeline
      .where({ gameId: entry.gameId, version: entry.version })
      .filter((e) => e.phase === entry.phase)
      .first()

    if (!existing) {
      await db.timeline.add({
        ...entry,
        startDate: new Date().toISOString(), // placeholder, actual date computed from anchors
        characterPortrait: null,
      })
      added++
    }
  }

  return added
}
