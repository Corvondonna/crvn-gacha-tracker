import { db } from "./db"
import { generatePatchSeries } from "./timeline"
import { PATCH_ANCHORS } from "@/data/patch-anchors"

/**
 * Seeds the timeline with empty slots for known patch phases.
 *
 * First-run bootstrap ONLY: runs when the timeline table is completely
 * empty (fresh install or recovery), never on normal loads — per-slot
 * backfilling used to resurrect entries the user had deleted.
 *
 * Slots are DERIVED from PATCH_ANCHORS via the patch cycle math instead
 * of hardcoded version lists, so the seed can never go stale. Each slot
 * gets its real calculated start date. Patches starting more than one
 * full cycle in the future are marked speculation. Uma is not seeded
 * (manual banner dates).
 */
export async function seedTimeline(): Promise<number> {
  const existingCount = await db.timeline.count()
  if (existingCount > 0) return 0

  const now = new Date()
  const rangeStart = new Date(now)
  rangeStart.setMonth(rangeStart.getMonth() - 4)
  const rangeEnd = new Date(now)
  rangeEnd.setMonth(rangeEnd.getMonth() + 6)

  // Anything starting beyond one typical cycle from now is unannounced
  const speculationCutoff = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000)

  let added = 0
  for (const anchor of PATCH_ANCHORS) {
    const patches = generatePatchSeries(
      anchor.gameId, anchor.version, anchor.phase1Start, rangeStart, rangeEnd
    )
    for (const p of patches) {
      for (const phase of [1, 2] as const) {
        const startDate = phase === 1 ? p.phase1Start : p.phase2Start
        await db.timeline.add({
          gameId: p.gameId,
          version: p.version,
          phase,
          startDate: startDate.toISOString(),
          characterName: null,
          characterPortrait: null,
          valueTier: "limited",
          isSpeculation: startDate > speculationCutoff,
          isPriority: false,
          pullStatus: "none",
          pullingWeapon: false,
        })
        added++
      }
    }
  }

  return added
}
