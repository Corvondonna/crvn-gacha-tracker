import { db, type ResourceSnapshot } from "./db"
import { GAMES, GAME_IDS, type GameId } from "./games"

/**
 * Calculates the number of full days between two dates,
 * using a 4:00 AM reset boundary (like in-game daily resets).
 *
 * A "day" ticks over at 4:00 AM local time.
 * If lastUpdate was 3:59 AM Apr 15 and now is 4:01 AM Apr 15, that's 1 day.
 * If lastUpdate was 4:01 AM Apr 15 and now is 3:59 AM Apr 16, that's 0 days.
 */
function daysSinceLastUpdate(lastUpdate: Date, now: Date): number {
  const RESET_HOUR = 4

  // Shift both dates back by RESET_HOUR so the day boundary aligns with midnight
  const shiftedLast = new Date(lastUpdate)
  shiftedLast.setHours(shiftedLast.getHours() - RESET_HOUR)

  const shiftedNow = new Date(now)
  shiftedNow.setHours(shiftedNow.getHours() - RESET_HOUR)

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

/**
 * Projects the total currency income from today until a future target date.
 * Accounts for monthly pass expiry if set.
 *
 * Returns the projected currency amount (not pulls).
 */
export function projectIncomeUntil(
  gameId: GameId,
  snapshot: ResourceSnapshot,
  targetDate: Date
): number {
  const config = GAMES[gameId]
  const now = new Date()

  if (targetDate <= now) return 0

  const totalDays = Math.floor((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  if (totalDays <= 0) return 0

  let income = 0

  // Daily commissions: full duration
  if (snapshot.dailyCommissionsActive) {
    income += config.dailyCommissionIncome * totalDays
  }

  // Monthly pass: respect expiry date
  if (snapshot.monthlyPassActive) {
    if (snapshot.monthlyPassExpiry) {
      const expiry = new Date(snapshot.monthlyPassExpiry)
      if (expiry > now) {
        // Pass is still active. Count days until expiry or target, whichever is sooner.
        const passEnd = expiry < targetDate ? expiry : targetDate
        const passDays = Math.floor((passEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        income += config.monthlyPassDaily * Math.max(0, passDays)
      }
      // else: already expired, no income from pass
    } else {
      // No expiry set, assume active for the full duration
      income += config.monthlyPassDaily * totalDays
    }
  }

  return income
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

    const lastUpdate = new Date(latest.updatedAt)
    const days = daysSinceLastUpdate(lastUpdate, now)

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
        const welkinActiveDays = Math.max(0, daysSinceLastUpdate(lastUpdate, expiry))
        welkinDays = welkinActiveDays
      }
    }

    // Calculate total income
    const config = GAMES[gameId]
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
