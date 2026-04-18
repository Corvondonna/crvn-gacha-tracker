import type { GameId } from "@/lib/games"

export type CombatIcon =
  | "gate" | "theatre" | "flower"       // Genshin
  | "crystal" | "dove" | "hourglass"    // HSR
  | "shield" | "cobra" | "void"         // ZZZ
  | "tower" | "ship" | "gateway"        // WuWa
  | "coin"                              // HSR weekly

export interface CombatMode {
  id: string
  gameId: GameId
  name: string
  icon: CombatIcon
  /** Currency reward per reset cycle */
  reward: number
  /** Minor modes render smaller on the timeline */
  isMinor?: boolean
  /** Reset schedule type */
  schedule:
    | { type: "monthly"; dayOfMonth: number }
    | { type: "interval"; intervalDays: number; anchor: Date }
    | { type: "patchRelative"; offsetDays: number }
    | { type: "weekly"; dayOfWeek: number }
}

/**
 * All permanent combat modes across games.
 *
 * Genshin: monthly resets + patch-relative
 * HSR: 42-day cycles staggered by 14 days (matches patch cycle)
 * ZZZ: 14-day cycles offset by 7 days
 * WuWa: 28-day cycles offset by 14 days
 */
export const COMBAT_MODES: CombatMode[] = [
  // --- Genshin Impact ---
  {
    id: "gi-imaginarium",
    gameId: "genshin",
    name: "Imaginarium Theatre",
    icon: "theatre",
    reward: 1000,
    schedule: { type: "monthly", dayOfMonth: 1 },
  },
  {
    id: "gi-abyss",
    gameId: "genshin",
    name: "Spiral Abyss",
    icon: "gate",
    reward: 800,
    schedule: { type: "monthly", dayOfMonth: 16 },
  },
  {
    id: "gi-stygian",
    gameId: "genshin",
    name: "Stygian Onslaught",
    icon: "flower",
    reward: 450,
    schedule: { type: "patchRelative", offsetDays: 7 },
  },

  // --- Honkai Star Rail ---
  // 42-day cycles, staggered: AS -> PF (+14d) -> MoC (+14d)
  {
    id: "hsr-as",
    gameId: "hsr",
    name: "Apocalyptic Shadow",
    icon: "hourglass",
    reward: 800,
    schedule: { type: "interval", intervalDays: 42, anchor: new Date(2026, 2, 16, 4, 0, 0) }, // Mar 16 4AM
  },
  {
    id: "hsr-pf",
    gameId: "hsr",
    name: "Pure Fiction",
    icon: "dove",
    reward: 800,
    schedule: { type: "interval", intervalDays: 42, anchor: new Date(2026, 2, 30, 4, 0, 0) }, // Mar 30 4AM
  },
  {
    id: "hsr-moc",
    gameId: "hsr",
    name: "Memory of Chaos",
    icon: "crystal",
    reward: 800,
    schedule: { type: "interval", intervalDays: 42, anchor: new Date(2026, 3, 13, 4, 0, 0) }, // Apr 13 4AM
  },

  // --- Zenless Zone Zero ---
  // 14-day cycles, offset by 7 days
  {
    id: "zzz-shiyu",
    gameId: "zzz",
    name: "Shiyu Defense",
    icon: "shield",
    reward: 780,
    schedule: { type: "interval", intervalDays: 14, anchor: new Date(2026, 3, 3, 4, 0, 0) }, // Apr 3 4AM
  },
  {
    id: "zzz-deadly",
    gameId: "zzz",
    name: "Deadly Assault",
    icon: "cobra",
    reward: 300,
    schedule: { type: "interval", intervalDays: 14, anchor: new Date(2026, 3, 10, 4, 0, 0) }, // Apr 10 4AM
  },

  // --- Wuthering Waves ---
  // 28-day cycles, offset by 14 days
  {
    id: "wuwa-toa",
    gameId: "wuwa",
    name: "Tower of Adversity",
    icon: "tower",
    reward: 800,
    schedule: { type: "interval", intervalDays: 28, anchor: new Date(2026, 2, 2, 4, 0, 0) }, // Mar 2 4AM
  },
  {
    id: "wuwa-ww",
    gameId: "wuwa",
    name: "Whimpering Wastes",
    icon: "ship",
    reward: 800,
    schedule: { type: "interval", intervalDays: 28, anchor: new Date(2026, 2, 16, 4, 0, 0) }, // Mar 16 4AM
  },

  // --- Weekly resets (Monday 4 AM) ---
  {
    id: "hsr-currency-wars",
    gameId: "hsr",
    name: "Currency Wars",
    icon: "coin",
    reward: 160,
    isMinor: true,
    schedule: { type: "weekly", dayOfWeek: 1 }, // Monday
  },
  {
    id: "zzz-lost-void",
    gameId: "zzz",
    name: "Lost Void",
    icon: "void",
    reward: 160,
    isMinor: true,
    schedule: { type: "weekly", dayOfWeek: 1 }, // Monday
  },
  {
    id: "wuwa-thousand-gateways",
    gameId: "wuwa",
    name: "Thousand Gateways",
    icon: "gateway",
    reward: 160,
    isMinor: true,
    schedule: { type: "weekly", dayOfWeek: 1 }, // Monday
  },
]

/**
 * Generate all reset dates for a combat mode within a date range.
 */
export function getCombatModeResets(
  mode: CombatMode,
  rangeStart: Date,
  rangeEnd: Date,
  patchStarts?: Map<string, Date> // version -> date, for patchRelative modes
): Date[] {
  const resets: Date[] = []
  const schedule = mode.schedule

  if (schedule.type === "monthly") {
    // Generate reset on dayOfMonth at 4:00 AM for each month in range
    const startMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    const endMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 1, 1)

    const current = new Date(startMonth)
    while (current < endMonth) {
      const resetDate = new Date(current.getFullYear(), current.getMonth(), schedule.dayOfMonth, 4, 0, 0)
      if (resetDate >= rangeStart && resetDate <= rangeEnd) {
        resets.push(resetDate)
      }
      current.setMonth(current.getMonth() + 1)
    }
  } else if (schedule.type === "interval") {
    // Generate from anchor forward and backward at fixed intervals
    const anchorMs = schedule.anchor.getTime()
    const intervalMs = schedule.intervalDays * 24 * 60 * 60 * 1000
    const rangeStartMs = rangeStart.getTime()
    const rangeEndMs = rangeEnd.getTime()

    // Find the first reset at or after rangeStart
    const cyclesSinceAnchor = Math.floor((rangeStartMs - anchorMs) / intervalMs)
    let currentMs = anchorMs + cyclesSinceAnchor * intervalMs
    if (currentMs < rangeStartMs) currentMs += intervalMs

    // Go one interval back to catch edge cases
    currentMs -= intervalMs

    while (currentMs <= rangeEndMs) {
      if (currentMs >= rangeStartMs) {
        resets.push(new Date(currentMs))
      }
      currentMs += intervalMs
    }
  } else if (schedule.type === "patchRelative" && patchStarts) {
    // Generate reset at offsetDays after each patch start, at 4:00 AM
    for (const patchDate of patchStarts.values()) {
      const resetDate = new Date(patchDate.getTime() + schedule.offsetDays * 24 * 60 * 60 * 1000)
      resetDate.setHours(4, 0, 0, 0)
      if (resetDate >= rangeStart && resetDate <= rangeEnd) {
        resets.push(resetDate)
      }
    }
  } else if (schedule.type === "weekly") {
    // Generate every week on the specified day (0=Sun, 1=Mon, ...) at 4:00 AM
    const current = new Date(rangeStart)
    current.setHours(4, 0, 0, 0)
    // Advance to first matching day of week
    const diff = (schedule.dayOfWeek - current.getDay() + 7) % 7
    current.setDate(current.getDate() + diff)
    if (current < rangeStart) current.setDate(current.getDate() + 7)

    while (current <= rangeEnd) {
      resets.push(new Date(current))
      current.setDate(current.getDate() + 7)
    }
  }

  return resets.sort((a, b) => a.getTime() - b.getTime())
}
