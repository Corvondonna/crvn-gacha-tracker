import { db, type ResourceSnapshot } from "./db"
import { GAMES, GAME_IDS, type GameId } from "./games"
import { COMBAT_MODES, getCombatModeResets } from "@/data/combat-modes"

/**
 * Calculates the number of full days between two dates,
 * using a game-specific reset boundary.
 *
 * HoYoverse/WuWa: 4:00 AM local time
 * Umamusume: 11:00 PM (23:00) PH time
 *
 * A "day" ticks over at the reset hour.
 */
function daysSinceLastUpdate(lastUpdate: Date, now: Date, resetHour: number = 4): number {
  // Shift both dates back by resetHour so the day boundary aligns with midnight
  const shiftedLast = new Date(lastUpdate)
  shiftedLast.setHours(shiftedLast.getHours() - resetHour)

  const shiftedNow = new Date(now)
  shiftedNow.setHours(shiftedNow.getHours() - resetHour)

  // Get calendar day difference
  const lastDay = new Date(shiftedLast.getFullYear(), shiftedLast.getMonth(), shiftedLast.getDate())
  const nowDay = new Date(shiftedNow.getFullYear(), shiftedNow.getMonth(), shiftedNow.getDate())

  const diffMs = nowDay.getTime() - lastDay.getTime()
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)))
}

/**
 * Calculates daily income for a game based on active income sources.
 */
function getDailyIncome(gameId: GameId, snapshot: ResourceSnapshot): number {
  const config = GAMES[gameId]
  let daily = 0

  if (snapshot.dailyCommissionsActive) {
    daily += config.dailyCommissionIncome
  }

  if (snapshot.monthlyPassActive) {
    // Check if the pass hasn't expired
    if (snapshot.monthlyPassExpiry) {
      const expiry = new Date(snapshot.monthlyPassExpiry)
      if (expiry > new Date()) {
        daily += config.monthlyPassDaily
      }
    } else {
      // No expiry set, assume active
      daily += config.monthlyPassDaily
    }
  }

  return daily
}

export interface ProjectedIncome {
  currency: number
  pullItems: number
  weaponPullItems: number
}

/**
 * Projects total income from today until a future target date.
 * Returns projected currency, character pull items, and weapon pull items.
 */
export function projectIncomeUntil(
  gameId: GameId,
  snapshot: ResourceSnapshot,
  targetDate: Date,
  patchStarts?: Map<string, Date>
): ProjectedIncome {
  const config = GAMES[gameId]
  const now = new Date()

  const zero: ProjectedIncome = { currency: 0, pullItems: 0, weaponPullItems: 0 }
  if (targetDate <= now) return zero

  const totalDays = Math.max(0, Math.floor((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))

  let income = 0
  let bonusPullItems = 0
  let bonusWeaponPullItems = 0

  // Daily commissions: full duration
  if (snapshot.dailyCommissionsActive) {
    income += config.dailyCommissionIncome * totalDays
  }

  // Monthly pass: respect expiry date
  if (snapshot.monthlyPassActive) {
    if (snapshot.monthlyPassExpiry) {
      const expiry = new Date(snapshot.monthlyPassExpiry)
      if (expiry > now) {
        const passEnd = expiry < targetDate ? expiry : targetDate
        const passDays = Math.floor((passEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        income += config.monthlyPassDaily * Math.max(0, passDays)
      }
    } else {
      income += config.monthlyPassDaily * totalDays
    }
  }

  // Combat mode rewards between now and target date
  for (const mode of COMBAT_MODES) {
    if (mode.gameId !== gameId) continue

    const gamePatchStarts = new Map<string, Date>()
    if (patchStarts) {
      for (const [key, date] of patchStarts) {
        if (key.startsWith(gameId + ":")) gamePatchStarts.set(key, date)
      }
    }

    const resets = getCombatModeResets(mode, now, targetDate, gamePatchStarts)
    income += resets.length * mode.reward
  }

  // Monthly pass renewal bonus: +300 paid currency per renewal
  // If the pass expires before the target, assume the player renews each 30 days
  if (snapshot.monthlyPassActive && snapshot.monthlyPassExpiry) {
    const PASS_RENEWAL_BONUS = 300
    const PASS_DURATION_DAYS = 30
    const expiry = new Date(snapshot.monthlyPassExpiry)
    if (expiry > now && expiry < targetDate) {
      // Count how many renewals happen between expiry and target
      const msPerDay = 24 * 60 * 60 * 1000
      const daysAfterExpiry = Math.floor((targetDate.getTime() - expiry.getTime()) / msPerDay)
      const renewals = Math.ceil(daysAfterExpiry / PASS_DURATION_DAYS)
      income += PASS_RENEWAL_BONUS * renewals
    }
  }

  // Patch-based fixed income
  if (patchStarts) {
    const LIVESTREAM_CODES = 300
    const PATCH_DAY_CURRENCY = 600 // Genshin, HSR, ZZZ
    const WUWA_PATCH_TIDES = 7    // WuWa gives 7 Radiant Tide + 7 Forging Tide instead
    const PATCH_DAY_HOUR = 11     // Patch day currency available at 11:00 AM
    const LIVESTREAM_HOUR = 20    // Livestream codes available at 8:00 PM

    for (const [key, patchStart] of patchStarts) {
      if (!key.startsWith(gameId + ":")) continue

      // Patch day reward: awarded at 11:00 AM on patch start day
      const patchRewardTime = new Date(patchStart)
      patchRewardTime.setHours(PATCH_DAY_HOUR, 0, 0, 0)
      if (patchRewardTime > now && patchRewardTime <= targetDate) {
        if (gameId === "wuwa") {
          bonusPullItems += WUWA_PATCH_TIDES
          bonusWeaponPullItems += WUWA_PATCH_TIDES
        } else {
          income += PATCH_DAY_CURRENCY
        }
      }

      // Livestream codes: awarded at 8:00 PM on livestream day
      const livestreamDate = new Date(patchStart)
      livestreamDate.setDate(livestreamDate.getDate() + config.patchCycle.livestreamOffsetDays)
      livestreamDate.setHours(LIVESTREAM_HOUR, 0, 0, 0)
      if (livestreamDate > now && livestreamDate <= targetDate) {
        income += LIVESTREAM_CODES
      }
    }
  }

  // Monthly pull item bonus: HoYoverse games give 5 pullItems on the 1st of each month
  if (gameId !== "wuwa") {
    const MONTHLY_PULL_ITEMS = 5
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const current = new Date(startMonth)
    current.setMonth(current.getMonth() + 1) // start from next 1st

    while (current <= targetDate) {
      if (current > now) {
        bonusPullItems += MONTHLY_PULL_ITEMS
      }
      current.setMonth(current.getMonth() + 1)
    }
  }

  return { currency: income, pullItems: bonusPullItems, weaponPullItems: bonusWeaponPullItems }
}

export interface IncomeAccumulation {
  gameId: GameId
  days: number
  amount: number
}

/**
 * Runs on app load. For each game with a resource snapshot,
 * calculates elapsed days since last update and accumulates
 * daily income into the currency total.
 *
 * Returns per-game accumulation details.
 */
export async function accumulateDailyIncome(): Promise<IncomeAccumulation[]> {
  const now = new Date()
  const results: IncomeAccumulation[] = []

  for (const gameId of GAME_IDS) {
    // Get the latest snapshot for this game
    const snapshots = await db.resources
      .where("gameId")
      .equals(gameId)
      .sortBy("updatedAt")

    const latest = snapshots[snapshots.length - 1]
    if (!latest) continue

    const config = GAMES[gameId]
    const resetHour = config.dailyResetHour
    const lastUpdate = new Date(latest.updatedAt)
    const days = daysSinceLastUpdate(lastUpdate, now, resetHour)

    if (days <= 0) continue

    const dailyIncome = getDailyIncome(gameId, latest)
    if (dailyIncome <= 0) continue

    // Check if monthly pass expires partway through the elapsed days
    let effectiveDays = days
    let welkinDays = days
    if (latest.monthlyPassActive && latest.monthlyPassExpiry) {
      const expiry = new Date(latest.monthlyPassExpiry)
      if (expiry < now) {
        // Pass expired during the gap. Calculate how many days it was still active.
        const welkinActiveDays = Math.max(0, daysSinceLastUpdate(lastUpdate, expiry, resetHour))
        welkinDays = welkinActiveDays
      }
    }
    let totalIncome = 0

    if (latest.dailyCommissionsActive) {
      totalIncome += config.dailyCommissionIncome * effectiveDays
    }

    if (latest.monthlyPassActive) {
      totalIncome += config.monthlyPassDaily * welkinDays
    }

    if (totalIncome <= 0) continue

    // Update the snapshot with new currency and timestamp
    const newCurrency = latest.currency + totalIncome
    const passStillActive = latest.monthlyPassActive &&
      (!latest.monthlyPassExpiry || new Date(latest.monthlyPassExpiry) > now)

    await db.resources.update(latest.id!, {
      currency: newCurrency,
      updatedAt: now.toISOString(),
      monthlyPassActive: passStillActive,
    })

    results.push({ gameId, days, amount: totalIncome })
  }

  return results
}
