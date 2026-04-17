import type { PullRecord } from "../db"
import { GI_CHARACTER_NAMES, GI_WEAPON_NAMES } from "../../data/item-names-genshin"

/**
 * Parse paimon.moe JSON export for Genshin Impact.
 *
 * Top-level keys:
 *   wish-counter-character-event  -> character banner
 *   wish-counter-weapon-event     -> weapon banner
 *   wish-counter-standard         -> standard banner
 *
 * Each has { total, legendary, rare, guaranteed, pulls: [...] }
 * Pull: { type, code, id, time, pity, rate? }
 *   rate absent = 3-star
 *   rate 0 = off-banner (lost 50/50)
 *   rate 1 = on-banner featured
 *   rate 2 = on-banner 4-star
 * Pulls ordered oldest-first.
 */

const BANNER_KEY_MAP: Record<string, string> = {
  "wish-counter-character-event": "character",
  "wish-counter-weapon-event": "weapon",
  "wish-counter-standard": "standard",
}

/**
 * Known 5-star IDs for the pity <= 10 edge case.
 * The primary rarity signal is pity > 10 (guaranteed 5-star, since 4-star pity caps at 10).
 * This set only matters for very early 5-star pulls (pity 1-10).
 */
const FIVE_STAR_CHARACTERS = new Set([
  // Standard pool
  "diluc", "jean", "keqing", "mona", "qiqi", "tighnari", "dehya",
  // Limited (through 6.x patches)
  "venti", "klee", "tartaglia", "zhongli", "albedo", "ganyu", "xiao",
  "hu_tao", "eula", "kaedehara_kazuha", "kamisato_ayaka", "yoimiya",
  "raiden_shogun", "sangonomiya_kokomi", "arataki_itto", "shenhe",
  "yae_miko", "kamisato_ayato", "yelan", "nilou", "nahida", "wanderer",
  "alhaitham", "baizhu", "lyney", "neuvillette", "wriothesley", "furina",
  "navia", "chiori", "arlecchino", "clorinde", "sigewinne", "emilie",
  "mualani", "kinich", "xilonen", "citlali", "mavuika", "yumemizuki_mizuki",
  // Natlan / post-5.0
  "skirk", "columbina", "escoffier", "nefer", "lauma", "zibai",
])

const FIVE_STAR_WEAPONS = new Set([
  // Standard
  "skyward_harp", "skyward_blade", "skyward_pride", "skyward_spine",
  "skyward_atlas", "wolfs_gravestone", "amos_bow",
  "lost_prayer_to_the_sacred_winds", "aquila_favonia",
  "primordial_jade_winged_spear",
  // Limited
  "primordial_jade_cutter", "staff_of_homa", "engulfing_lightning",
  "mistsplitter_reforged", "thundering_pulse", "elegy_for_the_end",
  "freedom_sworn", "song_of_broken_pines", "redhorn_stonethresher",
  "kaguras_verity", "haran_geppaku_futsu", "aqua_simulacra",
  "key_of_khaj_nisut", "a_thousand_floating_dreams",
  "tulaytullahs_remembrance", "light_of_foliar_incision",
  "the_first_great_magic", "tome_of_the_eternal_flow",
  "splendor_of_tranquil_waters", "cashflow_supervision", "absolution",
  "uraku_misugiri", "silvershower_heartstrings", "lumidouce_elegy",
  "surfs_up", "fang_of_the_mountain_king", "peak_patrol_song",
  "starcallers_watch", "cranes_echoing_call",
  "astral_vultures_crimson_plumage",
  // Post-5.0 weapons
  "crimson_moons_semblance", "lightbearing_moonshard",
  "reliquary_of_truth", "azurelight", "a_thousand_blazing_suns",
  "nightweavers_looking_glass",
])

function lookupName(id: string, type: string): string {
  if (type === "character") return GI_CHARACTER_NAMES[id] ?? formatSnakeCase(id)
  return GI_WEAPON_NAMES[id] ?? formatSnakeCase(id)
}

function formatSnakeCase(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function inferRarity(pull: Record<string, unknown>): number {
  const rate = pull.rate as number | undefined
  if (rate === undefined) return 3

  // rate=2 is always 4-star (on-banner 4-star)
  if (rate === 2) return 4

  // rate=0 or rate=1: use pity to distinguish 4-star from 5-star.
  // 4-star pity caps at 10 (guaranteed), so pity > 10 means this is
  // tracking 5-star pity and the pull is definitively a 5-star.
  const id = pull.id as string
  const pity = (pull.pity as number) ?? 0
  if (pity > 10) return 5

  // For pity <= 10, check known 5-star sets (handles early 5-star pulls)
  if (FIVE_STAR_CHARACTERS.has(id) || FIVE_STAR_WEAPONS.has(id)) return 5

  // Default to 4-star for low-pity unknown items
  return 4
}

export function parseGenshin(data: unknown): PullRecord[] {
  const json = data as Record<string, unknown>
  const records: PullRecord[] = []

  for (const [key, bannerType] of Object.entries(BANNER_KEY_MAP)) {
    const banner = json[key] as Record<string, unknown> | undefined
    if (!banner?.pulls) continue

    const pulls = banner.pulls as Array<Record<string, unknown>>

    for (const pull of pulls) {
      const id = pull.id as string
      const type = pull.type as string
      const rarity = inferRarity(pull)

      records.push({
        gameId: "genshin",
        bannerType,
        itemId: id,
        itemName: lookupName(id, type),
        rarity,
        pity: (pull.pity as number) ?? 0,
        timestamp: (pull.time as string) ?? "",
        isRateUp: pull.rate !== undefined ? (pull.rate as number) !== 0 : null,
        rawData: pull,
      })
    }
  }

  return records
}

export function detectGenshin(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false
  const json = data as Record<string, unknown>
  return (
    "wish-counter-character-event" in json ||
    "wish-counter-weapon-event" in json ||
    "wish-counter-standard" in json ||
    "wish-uid" in json
  )
}
