import { GAMES, type GameId } from "./games"
import { PATCH_DATE_OVERRIDES, type PatchDateOverride } from "@/data/patch-anchors"

export interface PatchDates {
  gameId: GameId
  version: string
  phase1Start: Date
  phase2Start: Date
  livestreamDate: Date
  patchEnd: Date
  /** True if phase1Start came from a user override rather than calculation */
  phase1IsManual?: boolean
  /** True if phase2Start came from a user override rather than calculation */
  phase2IsManual?: boolean
}

export interface TimelineNode {
  gameId: GameId
  version: string
  phase: 1 | 2 | "livestream"
  date: Date
  label: string
  characterName: string | null
  isSpeculation: boolean
  /** Sub-lane for games with multiple banner types (e.g., Uma character vs support) */
  bannerLane?: "character" | "support"
}

/**
 * Given a patch start date and version, calculates all key dates
 * for that patch using the game's cycle config.
 *
 * Overrides are checked in order: runtimeOverrides (user DB) > PATCH_DATE_OVERRIDES (hardcoded) > calculated.
 */
export function calculatePatchDates(
  gameId: GameId,
  version: string,
  phase1Start: Date,
  runtimeOverrides?: Map<string, PatchDateOverride>
): PatchDates {
  const cycle = GAMES[gameId].patchCycle
  const key = `${gameId}:${version}`
  const hardcoded = PATCH_DATE_OVERRIDES[key]
  const runtime = runtimeOverrides?.get(key)

  // Phase 1: runtime > hardcoded > calculated
  const phase1IsManual = !!runtime?.phase1Start
  const actualPhase1 = runtime?.phase1Start ?? hardcoded?.phase1Start ?? phase1Start

  // Phase 2: runtime > hardcoded > calculated from phase1
  const phase2IsManual = !!runtime?.phase2Start
  const phase2Start = runtime?.phase2Start ?? hardcoded?.phase2Start ?? new Date(actualPhase1)
  if (!runtime?.phase2Start && !hardcoded?.phase2Start) {
    phase2Start.setDate(phase2Start.getDate() + cycle.phase2OffsetDays)
  }

  // Livestream: hardcoded > calculated from phase1 (no runtime override for livestream)
  const livestreamDate = hardcoded?.livestreamDate ?? new Date(actualPhase1)
  if (!hardcoded?.livestreamDate) {
    livestreamDate.setDate(livestreamDate.getDate() + cycle.livestreamOffsetDays)
  }

  const patchEnd = new Date(actualPhase1)
  patchEnd.setDate(patchEnd.getDate() + cycle.durationDays)

  return { gameId, version, phase1Start: actualPhase1, phase2Start, livestreamDate, patchEnd, phase1IsManual, phase2IsManual }
}

/**
 * Additional per-game version skips beyond the universal x.9 rule.
 * All patch-cycle games (genshin, hsr, zzz, wuwa) skip x.9 automatically.
 * This map holds extra one-off skips like Genshin skipping 6.8.
 */
const EXTRA_SKIPS: Partial<Record<GameId, Set<string>>> = {
  genshin: new Set(["6.8"]),
  nte: new Set(["1.6", "1.7", "1.8"]),
}

/**
 * Minimum version per game. The backward generator stops here
 * to avoid producing nonsensical pre-launch patches (e.g., NTE 0.x).
 */
const MIN_VERSION: Partial<Record<GameId, string>> = {
  nte: "1.0",
}

/**
 * Returns true if a version should be skipped for the given game.
 * Universal rule: x.9 is always skipped (jumps to (x+1).0).
 * Per-game extras handled via EXTRA_SKIPS.
 */
/**
 * Compares two version strings numerically. Returns negative if a < b,
 * zero if equal, positive if a > b.
 */
function compareVersions(a: string, b: string): number {
  const [aMaj, aMin] = a.split(".").map(Number)
  const [bMaj, bMin] = b.split(".").map(Number)
  if (aMaj !== bMaj) return aMaj - bMaj
  return aMin - bMin
}

function shouldSkip(version: string, gameId?: GameId): boolean {
  const minor = parseInt(version.split(".")[1], 10)
  if (minor === 9) return true
  if (gameId) {
    const extras = EXTRA_SKIPS[gameId]
    if (extras?.has(version)) return true
  }
  return false
}

/**
 * Increments a version string by one patch, respecting skips.
 * "4.2" -> "4.3", "2.8" -> "3.0" (skips x.9), "6.7" -> "7.0" (Genshin skips 6.8+6.9)
 */
function incrementVersion(version: string, gameId?: GameId): string {
  const parts = version.split(".")
  const major = parseInt(parts[0], 10)
  const minor = parseInt(parts[1], 10)

  let next: string
  if (minor >= 9) {
    next = `${major + 1}.0`
  } else {
    next = `${major}.${minor + 1}`
  }

  if (shouldSkip(next, gameId)) {
    return incrementVersion(next, gameId)
  }

  return next
}

/**
 * Decrements a version string by one patch, respecting skips.
 */
function decrementVersion(version: string, gameId?: GameId): string {
  const parts = version.split(".")
  const major = parseInt(parts[0], 10)
  const minor = parseInt(parts[1], 10)

  let prev: string
  if (minor <= 0) {
    prev = `${major - 1}.8`
  } else {
    prev = `${major}.${minor - 1}`
  }

  if (shouldSkip(prev, gameId)) {
    return decrementVersion(prev, gameId)
  }

  return prev
}

/**
 * Generates a series of patch dates forward and backward from an anchor.
 * Returns patches covering the requested date range.
 *
 * When dateOverrides are provided, a Phase 1 override on version N shifts
 * that patch's Phase 2 and livestream, and cascades forward: version N+1
 * starts at N's overridden Phase 1 + durationDays (unless N+1 also has
 * its own Phase 1 override).
 */
export function generatePatchSeries(
  gameId: GameId,
  anchorVersion: string,
  anchorDate: Date,
  rangeStart: Date,
  rangeEnd: Date,
  dateOverrides?: Map<string, PatchDateOverride>
): PatchDates[] {
  const cycle = GAMES[gameId].patchCycle
  const patches: PatchDates[] = []

  // Generate forward from anchor
  let currentDate = new Date(anchorDate)
  let currentVersion = anchorVersion

  while (currentDate <= rangeEnd) {
    const patch = calculatePatchDates(gameId, currentVersion, new Date(currentDate), dateOverrides)
    patches.push(patch)
    // Cascade: next patch starts from this patch's actual Phase 1 + duration
    currentDate = new Date(patch.phase1Start)
    currentDate.setDate(currentDate.getDate() + cycle.durationDays)
    currentVersion = incrementVersion(currentVersion, gameId)
  }

  // Generate backward from anchor
  const minVer = MIN_VERSION[gameId]
  currentDate = new Date(anchorDate)
  currentDate.setDate(currentDate.getDate() - cycle.durationDays)
  currentVersion = decrementVersion(anchorVersion, gameId)

  while (currentDate >= rangeStart) {
    if (minVer && compareVersions(currentVersion, minVer) < 0) break
    const patch = calculatePatchDates(gameId, currentVersion, new Date(currentDate), dateOverrides)
    patches.push(patch)
    // Cascade backward: previous patch ends where this one starts
    currentDate = new Date(patch.phase1Start)
    currentDate.setDate(currentDate.getDate() - cycle.durationDays)
    currentVersion = decrementVersion(currentVersion, gameId)
  }

  // Include one extra patch before rangeStart so its Phase 2 / livestream
  // nodes that fall within range still appear
  if (currentDate.getTime() < rangeStart.getTime() && (!minVer || compareVersions(currentVersion, minVer) >= 0)) {
    const extraPatch = calculatePatchDates(gameId, currentVersion, new Date(currentDate), dateOverrides)
    if (extraPatch.patchEnd.getTime() >= rangeStart.getTime()) {
      patches.push(extraPatch)
    }
  }

  // Sort chronologically
  patches.sort((a, b) => a.phase1Start.getTime() - b.phase1Start.getTime())

  return patches
}

/**
 * Converts patch dates into timeline nodes.
 * Each patch produces up to 3 nodes: Phase 1, Phase 2, and Livestream.
 * Patches whose Phase 1 starts after today are marked as speculation.
 */
export function patchesToNodes(patches: PatchDates[]): TimelineNode[] {
  const nodes: TimelineNode[] = []
  const now = new Date()

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i]
    // A patch is speculative if it hasn't started yet
    const isSpec = patch.phase1Start.getTime() > now.getTime()

    nodes.push({
      gameId: patch.gameId,
      version: patch.version,
      phase: 1,
      date: patch.phase1Start,
      label: `${formatDate(patch.phase1Start)} (${patch.version})`,
      characterName: null,
      isSpeculation: isSpec,
    })

    nodes.push({
      gameId: patch.gameId,
      version: patch.version,
      phase: 2,
      date: patch.phase2Start,
      label: `${formatDate(patch.phase2Start)} (${patch.version} P2)`,
      characterName: null,
      isSpeculation: isSpec,
    })

    // Livestream previews the NEXT patch
    const nextPatch = patches[i + 1]
    if (nextPatch) {
      nodes.push({
        gameId: patch.gameId,
        version: nextPatch.version,
        phase: "livestream",
        date: patch.livestreamDate,
        label: `${formatDate(patch.livestreamDate)} (${nextPatch.version} Preview)`,
        characterName: null,
        isSpeculation: patch.livestreamDate.getTime() > now.getTime(),
      })
    }
  }

  return nodes
}

/**
 * Formats a date as "MM.DD" for compact timeline labels.
 */
export function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${month}.${day}`
}

/**
 * Returns the start of the month for a given date.
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * Generates an array of month start dates between two dates.
 */
export function getMonthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = []
  const current = startOfMonth(start)

  while (current <= end) {
    months.push(new Date(current))
    current.setMonth(current.getMonth() + 1)
  }

  return months
}
