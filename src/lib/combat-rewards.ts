import { db } from "./db"
import { type GameId } from "./games"
import { COMBAT_MODES, getCombatModeResets } from "@/data/combat-modes"

export interface CombatRewardResult {
  gameId: GameId
  modeName: string
  amount: number
}

/**
 * Tracks which combat mode resets have passed (for toast notifications).
 * Does NOT modify resource snapshots. Combat rewards are projected into
 * probability calculations via projectIncomeUntil() instead.
 *
 * Looks back up to 6 months to catch any missed resets.
 * Uses the combatClaims table to avoid double-counting.
 */
export async function claimCombatRewards(
  patchStarts?: Map<string, Date>
): Promise<CombatRewardResult[]> {
  const now = new Date()
  const lookback = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const results: CombatRewardResult[] = []

  for (const mode of COMBAT_MODES) {
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

      results.push({
        gameId: mode.gameId,
        modeName: mode.name,
        amount: mode.reward,
      })
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
