import { GAMES, type GameId } from "./games"

/**
 * Builds the per-pull probability table for hitting a 5-star.
 *
 * Community-accepted model:
 *   rate(n) = baseRate + rampPerPull * (n - softPityStart + 1)
 *   where rampPerPull = (1 - baseRate) / (hardPity - softPityStart + 1)
 */
function buildRateTable(
  baseRate: number,
  softPity: number,
  hardPity: number
): number[] {
  const rampPerPull = (1 - baseRate) / (hardPity - softPity + 1)
  const table: number[] = []

  for (let pull = 1; pull <= hardPity; pull++) {
    if (pull < softPity) {
      table.push(baseRate)
    } else if (pull < hardPity) {
      table.push(baseRate + rampPerPull * (pull - softPity + 1))
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
    rateTableCache[key] = buildRateTable(c.baseRate5Star, c.softPityStart, c.pity5Star)
  }
  return rateTableCache[key]
}

function getWeaponRateTable(gameId: GameId): number[] {
  const key = `${gameId}:weapon`
  if (!rateTableCache[key]) {
    const c = GAMES[gameId]
    rateTableCache[key] = buildRateTable(c.weaponBaseRate, c.weaponSoftPityStart, c.weaponPity)
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
  fatePoints: number
): number {
  if (availablePulls <= 0) return 0

  const config = GAMES[gameId]
  const table = getWeaponRateTable(gameId)
  const hardPity = config.weaponPity

  if (config.weaponGuaranteed || isGuaranteed) {
    // WuWa or already guaranteed: just need any 5-star weapon hit
    return probabilityOfAnyHit(table, hardPity, currentPity, availablePulls)
  }

  // Fate points system (Genshin, HSR, ZZZ)
  // hitsNeeded = maxFatePoints - currentFatePoints + 1, but the last hit is guaranteed
  // With 0 fate points: need up to 3 hits (lose, lose, guaranteed)
  // With 1 fate point: need up to 2 hits (lose, guaranteed)
  // With 2 fate points: next hit is guaranteed

  const maxFP = config.weaponMaxFatePoints // typically 2

  if (fatePoints >= maxFP) {
    // Next hit is guaranteed to be the chosen weapon
    return probabilityOfAnyHit(table, hardPity, currentPity, availablePulls)
  }

  // Simulate the fate points system using recursive probability
  // At each hit: 50% chance correct (done), 50% wrong (gain fate point, continue)
  return fatePointProb(table, hardPity, currentPity, availablePulls, fatePoints, maxFP)
}

/**
 * Recursive probability calculator for the fate points system.
 */
function fatePointProb(
  table: number[],
  hardPity: number,
  currentPity: number,
  remainingPulls: number,
  currentFP: number,
  maxFP: number
): number {
  if (remainingPulls <= 0) return 0

  if (currentFP >= maxFP) {
    // Next 5-star weapon is guaranteed to be correct
    return probabilityOfAnyHit(table, hardPity, currentPity, remainingPulls)
  }

  // Sum over possible positions where next weapon 5-star lands
  let totalProb = 0
  let pSurvival = 1.0
  let pity = currentPity

  for (let k = 0; k < remainingPulls; k++) {
    pity++
    if (pity > hardPity) {
      const pullsLeft = remainingPulls - k - 1
      // 50% correct weapon (done), 50% wrong (fate point + 1, continue)
      const pWrongThenGet = fatePointProb(table, hardPity, 0, pullsLeft, currentFP + 1, maxFP)
      totalProb += pSurvival * (0.5 + 0.5 * pWrongThenGet)
      return Math.min(totalProb, 1.0)
    }

    const rate = table[pity - 1]
    const pHitHere = pSurvival * rate
    const pullsLeft = remainingPulls - k - 1

    const pWrongThenGet = fatePointProb(table, hardPity, 0, pullsLeft, currentFP + 1, maxFP)
    totalProb += pHitHere * (0.5 + 0.5 * pWrongThenGet)

    pSurvival *= (1 - rate)
    if (pSurvival <= 1e-10) break
  }

  return Math.min(totalProb, 1.0)
}

/**
 * Combined probability of getting both character AND weapon.
 *
 * Assumes character pulls and weapon pulls come from separate pools
 * (character banner pulls vs weapon banner pulls), so we split available
 * resources optimally. For simplicity, we assume player pulls character first,
 * then uses remaining pulls on weapon banner.
 *
 * We sum over all possible pull counts where the character is secured,
 * weighted by the probability of securing at that count, then compute
 * weapon probability with the remainder.
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
  // Character probability (from character pull items)
  const pChar = probabilityOfFeaturedCharacter(gameId, charPity, charPulls, charGuaranteed)

  // Weapon probability (from weapon pull items)
  const pWeapon = probabilityOfFeaturedWeapon(
    gameId, weaponPity, weaponPulls, weaponGuaranteed, weaponFatePoints
  )

  // Combined = both must happen (independent banners)
  return pChar * pWeapon
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
