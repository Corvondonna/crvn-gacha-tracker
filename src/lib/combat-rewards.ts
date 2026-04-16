import { db } from "./db"
import { GAMES, GAME_IDS, type GameId } from "./games"
import { COMBAT_MODES, getCombatModeResets } from "@/data/combat-modes"

export interface CombatRewardResult {
  gameId: GameId
  modeName: string
  amount: number
}

/**
 * Checks for unclaimed combat mode rewards where the reset date
 * has already passed. Claims them by adding currency to the latest
 * resource snapshot.
 *
 * Looks back up to 6 months to catch any missed resets.
 * Uses the combatClaims table to avoid double-claiming.
 *
 * Needs patch start dates for patchRelative modes (Genshin Stygian Onslaught).
 */
export async function claimCombatRewards(
  patchStarts?: Map<string, Date>
): Promise<CombatRewardResult[]> {
  const now = new Date()
  const lookback = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const results: CombatRewardResult[] = []

  // Group rewards by game so we do one snapshot update per game
  const rewardsByGame = new Map<GameId, number>()

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

      const current = rewardsByGame.get(mode.gameId) ?? 0
      rewardsByGame.set(mode.gameId, current + mode.reward)

      results.push({
        gameId: mode.gameId,
        modeName: mode.name,
        amount: mode.reward,
      })
    }
  }

  // Apply accumulated rewards to each game's resource snapshot
  for (const [gameId, totalReward] of rewardsByGame) {
    const snapshots = await db.resources
      .where("gameId")
      .equals(gameId)
      .sortBy("updatedAt")

    const latest = snapshots[snapshots.length - 1]
    if (!latest) continue

    await db.resources.update(latest.id!, {
      currency: latest.currency + totalReward,
      updatedAt: now.toISOString(),
    })
  }

  return results
}
