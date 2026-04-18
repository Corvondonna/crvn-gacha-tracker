import { db } from "./db"
import { type GameId, GAMES } from "./games"
import { COMBAT_MODES, getCombatModeResets } from "@/data/combat-modes"

export interface CombatRewardResult {
  gameId: GameId
  modeName: string
  amount: number
}

/**
 * Tracks which combat mode resets have passed and adds rewards to
 * resource snapshots. For GI, HSR, and ZZZ the reward currency is
 * auto-converted into pull items (÷160). WuWa keeps raw currency.
 *
 * Looks back up to 6 months to catch any missed resets.
 * Uses the combatClaims table to avoid double-counting.
 */
export async function claimCombatRewards(
  patchStarts?: Map<string, Date>
): Promise<CombatRewardResult[]> {
  const now = new Date()
  const results: CombatRewardResult[] = []

  // Determine the earliest valid lookback per game: the latest snapshot's updatedAt.
  // Only claim resets that happened AFTER the snapshot was saved, because the user's
  // recorded currency already accounts for everything before that point.
  const snapshotDateByGame = new Map<GameId, Date>()
  for (const gid of ["genshin", "hsr", "zzz", "wuwa"] as GameId[]) {
    const snaps = await db.resources
      .where("gameId")
      .equals(gid)
      .sortBy("updatedAt")
    const latest = snaps[snaps.length - 1]
    if (latest) {
      snapshotDateByGame.set(gid, new Date(latest.updatedAt))
    }
  }

  // Accumulate total rewards per game before writing snapshots
  const rewardsByGame = new Map<GameId, number>()

  for (const mode of COMBAT_MODES) {
    // No snapshot means no resource tracking for this game yet; skip.
    const snapshotDate = snapshotDateByGame.get(mode.gameId)
    if (!snapshotDate) continue

    // Only look back to the snapshot date, not 6 months
    const lookback = snapshotDate

    // Build game-specific patch starts for patchRelative
    const gamePatchStarts = new Map<string, Date>()
    if (patchStarts) {
      for (const [key, date] of patchStarts) {
        if (key.startsWith(mode.gameId + ":")) gamePatchStarts.set(key, date)
      }
    }

    const resets = getCombatModeResets(mode, lookback, now, gamePatchStarts)

    for (const resetDate of resets) {
      if (resetDate > now) continue // not yet passed
      if (resetDate <= snapshotDate) continue // already accounted for in snapshot

      const resetKey = resetDate.toISOString().split("T")[0]

      // Check if already claimed
      const existing = await db.combatClaims
        .where({ modeId: mode.id, resetDate: resetKey })
        .first()

      if (existing) continue

      // Claim it
      await db.combatClaims.add({
        modeId: mode.id,
        resetDate: resetKey,
        amount: mode.reward,
        claimedAt: now.toISOString(),
      })

      rewardsByGame.set(
        mode.gameId,
        (rewardsByGame.get(mode.gameId) ?? 0) + mode.reward
      )

      results.push({
        gameId: mode.gameId,
        modeName: mode.name,
        amount: mode.reward,
      })
    }
  }

  // Apply accumulated rewards to each game's latest resource snapshot
  for (const [gameId, totalReward] of rewardsByGame) {
    const snapshots = await db.resources
      .where("gameId")
      .equals(gameId)
      .sortBy("updatedAt")
    const latest = snapshots[snapshots.length - 1]
    if (!latest?.id) continue

    const game = GAMES[gameId]
    const newCurrency = (latest.currency ?? 0) + totalReward

    // GI, HSR, ZZZ: auto-convert currency into pull items (÷160)
    if (gameId !== "wuwa") {
      const extraPulls = Math.floor(newCurrency / game.currencyPerPull)
      await db.resources.update(latest.id, {
        currency: newCurrency % game.currencyPerPull,
        pullItems: (latest.pullItems ?? 0) + extraPulls,
      })
    } else {
      // WuWa: keep as raw currency
      await db.resources.update(latest.id, { currency: newCurrency })
    }
  }

  return results
}

/**
 * One-time cleanup: the old claimCombatRewards() incorrectly added
 * combat reward currency directly to resource snapshots. This reads
 * all claims from the combatClaims table, sums them per game, and
 * subtracts those amounts from the latest resource snapshot.
 *
 * Uses a localStorage flag to run only once.
 */
export async function reverseCombatRewardInflation(): Promise<void> {
  const FLAG = "combat-reward-inflation-fixed"
  if (localStorage.getItem(FLAG)) return

  const allClaims = await db.combatClaims.toArray()
  if (allClaims.length === 0) {
    localStorage.setItem(FLAG, "1")
    return
  }

  // Sum claimed amounts per game using combat mode lookup
  const modeGameMap = new Map<string, GameId>()
  for (const mode of COMBAT_MODES) {
    modeGameMap.set(mode.id, mode.gameId)
  }

  const totalByGame = new Map<GameId, number>()
  for (const claim of allClaims) {
    const gameId = modeGameMap.get(claim.modeId)
    if (!gameId) continue
    totalByGame.set(gameId, (totalByGame.get(gameId) ?? 0) + claim.amount)
  }

  // Subtract from each game's latest snapshot
  for (const [gameId, total] of totalByGame) {
    const snapshots = await db.resources
      .where("gameId")
      .equals(gameId)
      .sortBy("updatedAt")

    const latest = snapshots[snapshots.length - 1]
    if (!latest) continue

    await db.resources.update(latest.id!, {
      currency: Math.max(0, latest.currency - total),
    })
  }

  localStorage.setItem(FLAG, "1")
}
