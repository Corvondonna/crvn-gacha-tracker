import { db } from "./db"
import { type GameId, GAMES, GAME_IDS } from "./games"

export interface EventRewardResult {
  gameId: GameId
  eventType: "patch-day" | "livestream"
  version: string
  amount: number
  pullItems?: number
  weaponPullItems?: number
}

const LIVESTREAM_CODES = 300
const PATCH_DAY_CURRENCY = 600
const WUWA_PATCH_TIDES = 7
const PATCH_DAY_HOUR = 11
const LIVESTREAM_HOUR = 20

/**
 * On app load, checks for patch day and livestream events that have
 * passed since the last resource snapshot update. Adds the rewards
 * to stored currency (or pull items for WuWa patch day).
 *
 * Uses the eventClaims table to avoid double-counting.
 */
export async function accumulateEventRewards(
  patchStarts: Map<string, Date>
): Promise<EventRewardResult[]> {
  const now = new Date()
  const results: EventRewardResult[] = []

  // Get latest snapshot date per game (only claim events after this date)
  const snapshotByGame = new Map<GameId, { id: number; updatedAt: Date }>()
  for (const gid of GAME_IDS) {
    if (gid === "uma") continue // Uma has no patch cycle events
    const snaps = await db.resources
      .where("gameId")
      .equals(gid)
      .sortBy("updatedAt")
    const latest = snaps[snaps.length - 1]
    if (latest?.id) {
      snapshotByGame.set(gid, { id: latest.id, updatedAt: new Date(latest.updatedAt) })
    }
  }

  // Accumulate rewards per game
  const currencyByGame = new Map<GameId, number>()
  const pullItemsByGame = new Map<GameId, number>()
  const weaponPullItemsByGame = new Map<GameId, number>()

  for (const [key, patchStart] of patchStarts) {
    const colonIdx = key.indexOf(":")
    if (colonIdx === -1) continue
    const gameId = key.substring(0, colonIdx) as GameId
    const version = key.substring(colonIdx + 1)

    const snap = snapshotByGame.get(gameId)
    if (!snap) continue

    const config = GAMES[gameId]

    // --- Patch day reward (11:00 AM on patch start) ---
    const patchRewardTime = new Date(patchStart)
    patchRewardTime.setHours(PATCH_DAY_HOUR, 0, 0, 0)

    if (patchRewardTime <= now && patchRewardTime > snap.updatedAt) {
      const claimKey = `${gameId}:${version}:patch-day`
      const existing = await db.eventClaims
        .where("eventKey")
        .equals(claimKey)
        .first()

      if (!existing) {
        if (gameId === "wuwa") {
          pullItemsByGame.set(gameId, (pullItemsByGame.get(gameId) ?? 0) + WUWA_PATCH_TIDES)
          weaponPullItemsByGame.set(gameId, (weaponPullItemsByGame.get(gameId) ?? 0) + WUWA_PATCH_TIDES)
          await db.eventClaims.add({
            eventKey: claimKey,
            gameId,
            eventType: "patch-day",
            version,
            amount: 0,
            claimedAt: now.toISOString(),
          })
          results.push({ gameId, eventType: "patch-day", version, amount: 0, pullItems: WUWA_PATCH_TIDES, weaponPullItems: WUWA_PATCH_TIDES })
        } else {
          currencyByGame.set(gameId, (currencyByGame.get(gameId) ?? 0) + PATCH_DAY_CURRENCY)
          await db.eventClaims.add({
            eventKey: claimKey,
            gameId,
            eventType: "patch-day",
            version,
            amount: PATCH_DAY_CURRENCY,
            claimedAt: now.toISOString(),
          })
          results.push({ gameId, eventType: "patch-day", version, amount: PATCH_DAY_CURRENCY })
        }
      }
    }

    // --- Livestream codes (8:00 PM, offset days after patch start) ---
    const livestreamDate = new Date(patchStart)
    livestreamDate.setDate(livestreamDate.getDate() + config.patchCycle.livestreamOffsetDays)
    livestreamDate.setHours(LIVESTREAM_HOUR, 0, 0, 0)

    if (livestreamDate <= now && livestreamDate > snap.updatedAt) {
      const claimKey = `${gameId}:${version}:livestream`
      const existing = await db.eventClaims
        .where("eventKey")
        .equals(claimKey)
        .first()

      if (!existing) {
        currencyByGame.set(gameId, (currencyByGame.get(gameId) ?? 0) + LIVESTREAM_CODES)
        await db.eventClaims.add({
          eventKey: claimKey,
          gameId,
          eventType: "livestream",
          version,
          amount: LIVESTREAM_CODES,
          claimedAt: now.toISOString(),
        })
        results.push({ gameId, eventType: "livestream", version, amount: LIVESTREAM_CODES })
      }
    }
  }

  // Apply accumulated currency to snapshots
  for (const [gameId, totalCurrency] of currencyByGame) {
    const snap = snapshotByGame.get(gameId)
    if (!snap) continue

    const latest = await db.resources.get(snap.id)
    if (!latest) continue

    await db.resources.update(snap.id, {
      currency: (latest.currency ?? 0) + totalCurrency,
    })
  }

  // Apply pull items (WuWa patch day)
  for (const [gameId, totalPulls] of pullItemsByGame) {
    const snap = snapshotByGame.get(gameId)
    if (!snap) continue

    const latest = await db.resources.get(snap.id)
    if (!latest) continue

    await db.resources.update(snap.id, {
      pullItems: (latest.pullItems ?? 0) + totalPulls,
      weaponPullItems: (latest.weaponPullItems ?? 0) + (weaponPullItemsByGame.get(gameId) ?? 0),
    })
  }

  return results
}
