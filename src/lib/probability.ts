import { GAMES, type GameId } from "./games"

/**
 * Community-mined per-pull rate increment after soft pity.
 *
 * HoYoverse character banners (Genshin, HSR, ZZZ):
 *   Pulls 1-73: 0.6% flat
 *   Pull 74+: base 0.6% + 6.0% per pull past 73
 *   Pull 90: hard pity (100%)
 *
 * HoYoverse weapon banners:
 *   Pulls 1-62: 0.7% flat (Genshin) or similar
 *   Pull 63+: base + 7.0% per pull past 62
 *   Pull 80: hard pity (100%)
 *
 * Wuthering Waves character banner:
 *   Pulls 1-65: 0.8% flat
 *   Pull 66+: base 0.8% + 6.0% per pull past 65
 *   Pull 80: hard pity (100%)
 *
 * Wuthering Waves weapon banner:
 *   Pulls 1-55: 0.8% flat
 *   Pull 56+: base + 6.0% per pull past 55
 *   Pull 80: hard pity (100%)
 *
 * Sources: community data mining, paimon.moe aggregate stats,
 * starrailstation.com aggregate data.
 */

const SOFT_PITY_INCREMENT: Record<string, number> = {
  "genshin:char": 0.06,
  "genshin:weapon": 0.07,
  "hsr:char": 0.06,
  "hsr:weapon": 0.07,
  "zzz:char": 0.06,
  "zzz:weapon": 0.07,
  "wuwa:char": 0.06,
  "wuwa:weapon": 0.06,
}

/**
 * Builds the per-pull probability table for hitting a 5-star
 * using community-mined escalating soft pity rates.
 *
 * After soft pity starts, each subsequent pull adds a fixed
 * increment (~6-7%) on top of the base rate, capping at 100%
 * at hard pity.
 */
function buildRateTable(
  baseRate: number,
  softPity: number,
  hardPity: number,
  increment: number
): number[] {
  const table: number[] = []

  for (let pull = 1; pull <= hardPity; pull++) {
    if (pull < softPity) {
      table.push(baseRate)
    } else if (pull < hardPity) {
      const pullsIntoPity = pull - softPity + 1
      table.push(Math.min(baseRate + increment * pullsIntoPity, 1.0))
    } else {
      table.push(1.0)
    }
  }

  return table
}

// Cache rate tables: "gameId:char" or "gameId:weapon"
const rateTableCache: Record<string, number[]> = {}

function getCharRateTable(gameId: GameId): number[] {
  const key = `${gameId}:char`
  if (!rateTableCache[key]) {
    const c = GAMES[gameId]
    const increment = SOFT_PITY_INCREMENT[key] ?? 0.06
    rateTableCache[key] = buildRateTable(c.baseRate5Star, c.softPityStart, c.pity5Star, increment)
  }
  return rateTableCache[key]
}

function getWeaponRateTable(gameId: GameId): number[] {
  const key = `${gameId}:weapon`
  if (!rateTableCache[key]) {
    const c = GAMES[gameId]
    const increment = SOFT_PITY_INCREMENT[key] ?? 0.07
    rateTableCache[key] = buildRateTable(c.weaponBaseRate, c.weaponSoftPityStart, c.weaponPity, increment)
  }
  return rateTableCache[key]
}

/**
 * Probability of getting at least one 5-star within N pulls,
 * starting from a known pity count.
 */
function probabilityOfAnyHit(
  table: number[],
  hardPity: number,
  currentPity: number,
  availablePulls: number
): number {
  if (availablePulls <= 0) return 0

  let pNoHit = 1.0
  let pity = currentPity

  for (let i = 0; i < availablePulls; i++) {
    pity++
    if (pity > hardPity) return 1.0
    const rate = table[pity - 1]
    pNoHit *= (1 - rate)
    if (pNoHit <= 0) return 1.0
  }

  return 1 - pNoHit
}

/**
 * Probability of getting the featured character, accounting for 50/50.
 */
export function probabilityOfFeaturedCharacter(
  gameId: GameId,
  currentPity: number,
  availablePulls: number,
  isGuaranteed: boolean
): number {
  if (availablePulls <= 0) return 0

  const table = getCharRateTable(gameId)
  const hardPity = GAMES[gameId].pity5Star

  if (isGuaranteed) {
    return probabilityOfAnyHit(table, hardPity, currentPity, availablePulls)
  }

  // On 50/50: sum over each possible first-hit position
  let totalProb = 0
  let pSurvival = 1.0
  let pity = currentPity

  for (let k = 0; k < availablePulls; k++) {
    pity++
    if (pity > hardPity) {
      const remaining = availablePulls - k - 1
      const pSecond = probabilityOfAnyHit(table, hardPity, 0, remaining)
      totalProb += pSurvival * (0.5 + 0.5 * pSecond)
      return Math.min(totalProb, 1.0)
    }

    const rate = table[pity - 1]
    const pHitHere = pSurvival * rate
    const remaining = availablePulls - k - 1
    const pSecond = probabilityOfAnyHit(table, hardPity, 0, remaining)
    totalProb += pHitHere * (0.5 + 0.5 * pSecond)

    pSurvival *= (1 - rate)
    if (pSurvival <= 1e-10) break
  }

  return Math.min(totalProb, 1.0)
}

/**
 * Probability of getting the featured weapon.
 *
 * For WuWa (weaponGuaranteed=true): just need to hit any 5-star weapon.
 * For HoYoverse games: fate points system. Need up to 3 hits worst case.
 *   - Hit 1: 50% correct weapon (if correct, done). 50% wrong (1 fate point).
 *   - Hit 2: 50% correct (if correct, done). 50% wrong (2 fate points).
 *   - Hit 3: guaranteed correct weapon.
 *
 * With existing fate points, fewer hits needed.
 */
export function probabilityOfFeaturedWeapon(
  gameId: GameId,
  currentPity: number,
  availablePulls: number,
  isGuaranteed: boolean,
  _fatePoints: number
): number {
  if (availablePulls <= 0) return 0

  const config = GAMES[gameId]
  const table = getWeaponRateTable(gameId)
  const hardPity = config.weaponPity

  if (config.weaponGuaranteed || isGuaranteed) {
    // WuWa or already guaranteed: just need any 5-star weapon hit
    return probabilityOfAnyHit(table, hardPity, currentPity, availablePulls)
  }

  // All weapon banners now use a simple 50/50 system (same as character).
  // Lose the 50/50 → next 5-star is guaranteed to be featured.
  let totalProb = 0
  let pSurvival = 1.0
  let pity = currentPity

  for (let k = 0; k < availablePulls; k++) {
    pity++
    if (pity > hardPity) {
      const remaining = availablePulls - k - 1
      const pSecond = probabilityOfAnyHit(table, hardPity, 0, remaining)
      totalProb += pSurvival * (0.5 + 0.5 * pSecond)
      return Math.min(totalProb, 1.0)
    }

    const rate = table[pity - 1]
    const pHitHere = pSurvival * rate
    const remaining = availablePulls - k - 1
    const pSecond = probabilityOfAnyHit(table, hardPity, 0, remaining)
    totalProb += pHitHere * (0.5 + 0.5 * pSecond)

    pSurvival *= (1 - rate)
    if (pSurvival <= 1e-10) break
  }

  return Math.min(totalProb, 1.0)
}

/**
 * Combined probability of getting both character AND weapon.
 *
 * Two modes depending on whether the game has separate pull items per banner:
 *
 * 1. Separate pools (e.g., WuWa has Radiant Tide for chars, Forging Tide for weapons):
 *    Pulls are independent → P(both) = P(char) * P(weapon).
 *
 * 2. Shared pool (Genshin, HSR, ZZZ use the same pull item for both banners):
 *    Every pull spent on character is one fewer for weapon. We model this as
 *    sequential pulling: character banner first, weapon banner with the remainder.
 *    P(both) = sum over k of P(char secured at exactly k pulls) * P(weapon with N-k pulls)
 */
export function probabilityOfCharAndWeapon(
  gameId: GameId,
  charPity: number,
  charPulls: number,
  charGuaranteed: boolean,
  weaponPity: number,
  weaponPulls: number,
  weaponGuaranteed: boolean,
  weaponFatePoints: number
): number {
  const config = GAMES[gameId]

  // Separate pull items → independent banners
  if (config.weaponPullItem !== null) {
    const pChar = probabilityOfFeaturedCharacter(gameId, charPity, charPulls, charGuaranteed)
    const pWeapon = probabilityOfFeaturedWeapon(
      gameId, weaponPity, weaponPulls, weaponGuaranteed, weaponFatePoints
    )
    return pChar * pWeapon
  }

  // Shared pool: charPulls and weaponPulls represent the same resources.
  // Use charPulls as the total pool size.
  const totalPulls = charPulls

  // Build CDF for character: cdf[k] = P(featured char secured in ≤ k pulls)
  const cdf: number[] = new Array(totalPulls + 1)
  cdf[0] = 0
  for (let k = 1; k <= totalPulls; k++) {
    cdf[k] = probabilityOfFeaturedCharacter(gameId, charPity, k, charGuaranteed)
  }

  // Convolution: for each pull count k where character is secured,
  // compute weapon probability with the remaining pulls.
  let combined = 0
  for (let k = 1; k <= totalPulls; k++) {
    const pCharExactlyK = cdf[k] - cdf[k - 1]
    if (pCharExactlyK <= 1e-10) continue
    const remainingPulls = totalPulls - k
    const pWeapon = probabilityOfFeaturedWeapon(
      gameId, weaponPity, remainingPulls, weaponGuaranteed, weaponFatePoints
    )
    combined += pCharExactlyK * pWeapon
  }

  return Math.min(combined, 1.0)
}

// --- Public API ---

export interface ProbabilityResult {
  /** 0-100 percentage */
  percent: number
  /** Color tier for display */
  tier: "guaranteed" | "high" | "medium" | "low" | "very-low"
  /** Total available pulls used for this calculation */
  pulls: number
}

function toResult(prob: number, pulls: number = 0): ProbabilityResult {
  const percent = Math.min(Math.round(prob * 100), 100)
  let tier: ProbabilityResult["tier"]
  if (percent >= 100) tier = "guaranteed"
  else if (percent >= 75) tier = "high"
  else if (percent >= 50) tier = "medium"
  else if (percent >= 25) tier = "low"
  else tier = "very-low"
  return { percent, tier, pulls }
}

/**
 * Compute probability for character only.
 */
export function computeCharacterProbability(
  gameId: GameId,
  currentPity: number,
  availablePulls: number,
  isGuaranteed: boolean
): ProbabilityResult {
  return toResult(probabilityOfFeaturedCharacter(gameId, currentPity, availablePulls, isGuaranteed), availablePulls)
}

/**
 * Compute combined probability for character + weapon.
 */
export function computeCombinedProbability(
  gameId: GameId,
  charPity: number,
  charPulls: number,
  charGuaranteed: boolean,
  weaponPity: number,
  weaponPulls: number,
  weaponGuaranteed: boolean,
  weaponFatePoints: number
): ProbabilityResult {
  return toResult(
    probabilityOfCharAndWeapon(
      gameId, charPity, charPulls, charGuaranteed,
      weaponPity, weaponPulls, weaponGuaranteed, weaponFatePoints
    ),
    charPulls
  )
}

/**
 * Probability of getting a specific rate-up item in a spark system.
 *
 * Uma uses flat 3% base rate with no soft pity escalation.
 * Spark at 200 pulls guarantees the featured item.
 * No 50/50 system; rate-up share varies per banner (manual input).
 *
 * @param baseRate - per-pull chance of any top-rarity hit (0.03 for Uma)
 * @param rateUpShare - fraction of top-rarity hits that are the featured item (e.g., 0.5)
 * @param availablePulls - total pulls the player can make
 * @param sparkThreshold - pulls needed for spark (200 for Uma, 0 = no spark)
 * @param currentSparkCount - pulls already accumulated toward spark on this banner
 */
export function probabilityWithSpark(
  baseRate: number,
  rateUpShare: number,
  availablePulls: number,
  sparkThreshold: number,
  currentSparkCount: number = 0
): number {
  if (availablePulls <= 0) return 0

  const pullsToSpark = sparkThreshold > 0 ? sparkThreshold - currentSparkCount : Infinity
  const effectiveRate = baseRate * rateUpShare

  // If we can reach spark, guaranteed
  if (availablePulls >= pullsToSpark) return 1.0

  // Otherwise, probability of hitting at least once in N pulls
  const pNoHit = Math.pow(1 - effectiveRate, availablePulls)
  return 1 - pNoHit
}

/**
 * Compute probability for Uma-style gacha (flat rate, spark, no 50/50).
 */
export function computeSparkProbability(
  availablePulls: number,
  baseRate: number,
  rateUpShare: number,
  sparkThreshold: number,
  currentSparkCount: number = 0
): ProbabilityResult {
  const prob = probabilityWithSpark(baseRate, rateUpShare, availablePulls, sparkThreshold, currentSparkCount)
  return toResult(prob, availablePulls)
}

/**
 * Legacy wrapper - computes character-only probability.
 */
export function computeProbability(
  gameId: GameId,
  currentPity: number,
  availablePulls: number,
  isGuaranteed: boolean
): ProbabilityResult {
  return computeCharacterProbability(gameId, currentPity, availablePulls, isGuaranteed)
}
