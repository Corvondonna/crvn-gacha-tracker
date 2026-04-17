import type { PullRecord } from "../db"
import type { GameId } from "../games"
import { parseGenshin, detectGenshin } from "./genshin"
import { parseHSR, decompressHSR, detectHSR } from "./hsr"
import { parseZZZ, detectZZZ } from "./zzz"
import { parseWuWa, detectWuWa } from "./wuwa"

export interface ParseResult {
  gameId: GameId
  records: PullRecord[]
  pullCount: number
  fiveStarCount: number
  fourStarCount: number
}

/**
 * Auto-detect game and parse pull data from file contents.
 *
 * For HSR .dat files, pass the raw string (including "srs" header).
 * For all other games, pass the parsed JSON object.
 */
export function parseImport(data: unknown, rawString?: string): ParseResult {
  // HSR: if raw string starts with "srs", decompress first
  if (rawString && rawString.startsWith("srs")) {
    const decompressed = decompressHSR(rawString)
    const records = parseHSR(decompressed)
    return buildResult("hsr", records)
  }

  // Try auto-detection on JSON
  if (detectGenshin(data)) {
    return buildResult("genshin", parseGenshin(data))
  }

  if (detectWuWa(data)) {
    return buildResult("wuwa", parseWuWa(data))
  }

  if (detectZZZ(data)) {
    return buildResult("zzz", parseZZZ(data))
  }

  if (detectHSR(data)) {
    return buildResult("hsr", parseHSR(data))
  }

  throw new Error("Could not detect game format. Make sure you exported from a supported tracker site.")
}

function buildResult(gameId: GameId, records: PullRecord[]): ParseResult {
  return {
    gameId,
    records,
    pullCount: records.length,
    fiveStarCount: records.filter((r) => r.rarity === 5).length,
    fourStarCount: records.filter((r) => r.rarity === 4).length,
  }
}
