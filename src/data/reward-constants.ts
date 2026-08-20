/**
 * Fixed reward amounts shared between income PROJECTION (daily-income.ts)
 * and income ACCRUAL (event-rewards.ts).
 *
 * Single source of truth: these two systems must always agree, otherwise
 * projected pull counts diverge from what actually lands in snapshots.
 */

/** Currency from livestream redemption codes (all patch-cycle games) */
export const LIVESTREAM_CODES = 300

/** Patch-day maintenance/update currency (Genshin, HSR, ZZZ, NTE) */
export const PATCH_DAY_CURRENCY = 600

/** WuWa gives tides instead of currency on patch day (7 Radiant + 7 Forging) */
export const WUWA_PATCH_TIDES = 7

/** Hour of day (local) when patch-day rewards become claimable */
export const PATCH_DAY_HOUR = 11

/** Hour of day (local) when livestream codes become claimable */
export const LIVESTREAM_HOUR = 20

/**
 * Monthly shop pull items, credited at the game's daily reset hour on the
 * 1st of each month. Every game's shop currency income comfortably covers
 * the capped stock each month, so these are treated as guaranteed income:
 *
 * - Genshin: Paimon's Bargains, 5 Intertwined Fates (Stardust/Starglitter)
 * - HSR: Embers Exchange, 5 Star Rail Special Passes (Undying Embers)
 * - ZZZ: Signal Shop, 5 Encrypted Master Tapes (Fading Signals)
 * - NTE: Fair Exchange, 5 Solid Dice + 20 Tri-Keys (Lost Pieces)
 * - WuWa: NOT monthly — tide shop stock is per patch, already covered by
 *   the patch-day tide credit (WUWA_PATCH_TIDES)
 * - Uma: no monthly ticket shop
 */
export const MONTHLY_SHOP_PULL_ITEMS: Partial<Record<string, number>> = {
  genshin: 5,
  hsr: 5,
  zzz: 5,
  nte: 5,
}

/** Monthly shop weapon pull items (NTE Tri-Keys) */
export const MONTHLY_SHOP_WEAPON_PULL_ITEMS: Partial<Record<string, number>> = {
  nte: 20,
}
