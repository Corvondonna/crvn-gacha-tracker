/**
 * Umamusume: Pretty Derby "Scenarios" (Career Mode rotations).
 *
 * Each scenario runs for a fixed window. When one ends the next begins.
 * These serve the same visual purpose as patches for HoYoverse/WuWa games,
 * giving the Uma timeline row colored background bands.
 *
 * Source: https://umamusu.wiki/Game:Career_Mode
 */

export interface UmaScenario {
  name: string
  shortName: string
  start: Date
  end: Date
}

export const UMA_SCENARIOS: UmaScenario[] = [
  // 2025-2026
  {
    name: "Trailblazer",
    shortName: "TRAIL",
    start: new Date(2026, 2, 13),  // Mar 13, 2026
    end:   new Date(2026, 5, 28),  // Jun 28, 2026
  },
  {
    name: "Grand Live",
    shortName: "G.LIVE",
    start: new Date(2026, 5, 28),  // Jun 28, 2026
    end:   new Date(2026, 9, 20),  // Oct 20, 2026
  },
  {
    name: "Grand Master",
    shortName: "G.MSTR",
    start: new Date(2026, 9, 20),  // Oct 20, 2026
    end:   new Date(2027, 1, 6),   // Feb 6, 2027
  },
]
