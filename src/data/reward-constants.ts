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
