import { useState, useCallback, useEffect, useMemo } from "react"
import { GAMES, GAME_IDS, type GameId } from "@/lib/games"
import { db, type PullRecord } from "@/lib/db"
import { parseImport, type ParseResult } from "@/lib/parsers"

type BannerFilter = "all" | "character" | "weapon" | "standard" | "lightcone" | "wengine" | "bangboo" | "beginner"

const BANNER_LABELS: Record<string, string> = {
  all: "All",
  character: "Character Event",
  weapon: "Weapon Event",
  standard: "Standard",
  lightcone: "Light Cone Event",
  wengine: "W-Engine Event",
  bangboo: "Bangboo",
  beginner: "Beginner",
}

const BANNER_LABELS_SHORT: Record<string, string> = {
  all: "All",
  character: "Character",
  weapon: "Weapon",
  standard: "Standard",
  lightcone: "Light Cone",
  wengine: "W-Engine",
  bangboo: "Bangboo",
  beginner: "Beginner",
}

const GAME_BANNERS: Record<GameId, BannerFilter[]> = {
  genshin: ["all", "character", "weapon", "standard"],
  hsr: ["all", "character", "lightcone", "standard"],
  zzz: ["all", "character", "wengine", "bangboo", "standard"],
  wuwa: ["all", "character", "weapon", "standard"],
}

const GAME_BANNER_CARDS: Record<GameId, BannerFilter[]> = {
  genshin: ["character", "weapon", "standard"],
  hsr: ["character", "lightcone", "standard"],
  zzz: ["character", "wengine", "standard"],
  wuwa: ["character", "weapon", "standard"],
}

function rarityColor(rarity: number): string {
  if (rarity === 5) return "hsl(45, 90%, 60%)"
  if (rarity === 4) return "hsl(270, 60%, 65%)"
  return "hsl(var(--muted-foreground))"
}

function rarityBg(rarity: number): string {
  if (rarity === 5) return "hsla(45, 90%, 60%, 0.08)"
  if (rarity === 4) return "hsla(270, 60%, 65%, 0.06)"
  return "transparent"
}

function formatTimestamp(ts: string): string {
  if (!ts) return ""
  const d = new Date(ts)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%"
  return ((n / total) * 100).toFixed(2) + "%"
}

function avg(nums: number[]): string {
  if (nums.length === 0) return "0"
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
}

/** Chip color for 5-star pulls: green=won, red=lost, yellow=standard/neutral */
function chipColors(pull: PullRecord): { bg: string; border: string; text: string; pityColor: string } {
  if (pull.isRateUp === true) {
    return {
      bg: "hsla(142, 60%, 40%, 0.15)",
      border: "hsla(142, 60%, 40%, 0.35)",
      text: "hsl(142, 60%, 60%)",
      pityColor: "hsl(142, 60%, 70%)",
    }
  }
  if (pull.isRateUp === false) {
    return {
      bg: "hsla(0, 60%, 40%, 0.15)",
      border: "hsla(0, 60%, 40%, 0.35)",
      text: "hsl(0, 60%, 65%)",
      pityColor: "hsl(0, 60%, 75%)",
    }
  }
  // Standard / neutral
  return {
    bg: "hsla(45, 80%, 50%, 0.12)",
    border: "hsla(45, 80%, 50%, 0.3)",
    text: "hsl(45, 80%, 60%)",
    pityColor: "hsl(45, 80%, 70%)",
  }
}

interface DetailedBannerStats {
  bannerType: string
  label: string
  total: number
  fiveStars: PullRecord[]
  fourStars: PullRecord[]
  fourStarChars: PullRecord[]
  fourStarWeapons: PullRecord[]
  pity5: number
  pity4: number
  isGuaranteed: boolean
  hardPity: number
  fiveStarWins: number
  fiveStarChallenges: number
  fourStarWins: number
  fourStarChallenges: number
}

function computeDetailedBannerStats(
  pulls: PullRecord[],
  bannerType: string,
  gameId: GameId
): DetailedBannerStats {
  const bannerPulls = pulls.filter((p) => p.bannerType === bannerType)
  const config = GAMES[gameId]
  const total = bannerPulls.length

  const fiveStars = bannerPulls.filter((p) => p.rarity === 5)
  const fourStars = bannerPulls.filter((p) => p.rarity === 4)

  // Separate 4-stars into characters vs weapons by checking rawData or name heuristics
  // For GI: rawData.type === "character" or "weapon"
  // For others: we check if itemId is in character or weapon tables - simpler to just split on rawData
  const fourStarChars = fourStars.filter((p) => {
    const raw = p.rawData as Record<string, unknown>
    if (raw.type === "character") return true
    if (raw.type === "weapon") return false
    // HSR/ZZZ/WuWa: use rarity + name heuristic or just show all as one group
    // For now, check if the raw has a gachaType or qualityLevel hint
    if (raw.qualityLevel !== undefined) return (raw.cardPoolType as number) !== 2
    return true // default to character
  })
  const fourStarWeapons = fourStars.filter((p) => !fourStarChars.includes(p))

  // Pity counters: count pulls since (after) the last 5-star/4-star
  let pity5 = 0
  for (let i = bannerPulls.length - 1; i >= 0; i--) {
    if (bannerPulls[i].rarity === 5) break
    pity5++
  }

  let pity4 = 0
  for (let i = bannerPulls.length - 1; i >= 0; i--) {
    if (bannerPulls[i].rarity >= 4) break
    pity4++
  }

  const last5Star = [...fiveStars].pop()
  const isGuaranteed = last5Star ? last5Star.isRateUp === false : false

  const isWeaponBanner = bannerType === "weapon" || bannerType === "lightcone" || bannerType === "wengine"
  const hardPity = isWeaponBanner ? config.weaponPity : config.pity5Star

  // 5-star 50/50 record
  const fiveStar5050 = fiveStars.filter((p) => p.isRateUp !== null)
  const fiveStarWins = fiveStar5050.filter((p) => p.isRateUp === true).length

  // 4-star 50/50 record
  const fourStar5050 = fourStars.filter((p) => p.isRateUp !== null)
  const fourStarWins = fourStar5050.filter((p) => p.isRateUp === true).length

  return {
    bannerType,
    label: BANNER_LABELS[bannerType] ?? bannerType,
    total,
    fiveStars,
    fourStars,
    fourStarChars,
    fourStarWeapons,
    pity5,
    pity4,
    isGuaranteed,
    hardPity,
    fiveStarWins,
    fiveStarChallenges: fiveStar5050.length,
    fourStarWins,
    fourStarChallenges: fourStar5050.length,
  }
}

/* ──────────────────────────────────────── */
/*  Banner Detail Card                      */
/* ──────────────────────────────────────── */

function BannerDetailCard({ stats }: { stats: DetailedBannerStats }) {
  const { fiveStars, fourStars, fourStarChars, fourStarWeapons, total } = stats

  const isWeapon = stats.bannerType === "weapon" || stats.bannerType === "lightcone" || stats.bannerType === "wengine"
  const winLabel = isWeapon ? "Win 75:25" : "Win 50:50"

  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: 12,
        background: "hsla(0,0%,100%,0.03)",
        border: "1px solid hsla(0,0%,100%,0.06)",
      }}
    >
      {/* Title + current pity */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--foreground))" }}>
          {stats.label}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {stats.isGuaranteed && (
            <span style={{ fontSize: 10, fontWeight: 600, color: "hsl(45, 90%, 60%)" }}>
              ▲ Guaranteed
            </span>
          )}
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            Pity: <span style={{ fontWeight: 700, color: "hsl(45, 90%, 60%)" }}>{stats.pity5}</span>/{stats.hardPity}
          </span>
        </div>
      </div>

      {/* Stats table */}
      <div style={{ marginBottom: 14 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px 70px", gap: 4, marginBottom: 6 }}>
          <span />
          <span style={thStyle}>Total</span>
          <span style={thStyle}>Percent</span>
          <span style={thStyle}>Pity AVG</span>
        </div>

        {/* 5-star row */}
        <StatsTableRow
          label="5 ★"
          labelColor="hsl(45, 90%, 60%)"
          count={fiveStars.length}
          percent={pct(fiveStars.length, total)}
          avgPity={avg(fiveStars.map((p) => p.pity))}
        />

        {/* 5-star win rate sub-row */}
        {stats.fiveStarChallenges > 0 && (
          <StatsTableRow
            label={`└ ${winLabel}`}
            labelColor="hsl(var(--muted-foreground))"
            count={stats.fiveStarWins}
            percent={pct(stats.fiveStarWins, stats.fiveStarChallenges)}
            indent
          />
        )}

        {/* 4-star row */}
        <StatsTableRow
          label="4 ★"
          labelColor="hsl(270, 60%, 65%)"
          count={fourStars.length}
          percent={pct(fourStars.length, total)}
          avgPity={avg(fourStars.map((p) => p.pity))}
        />

        {/* 4-star character sub-row */}
        {fourStarChars.length > 0 && (
          <StatsTableRow
            label="└ Character"
            labelColor="hsl(var(--muted-foreground))"
            count={fourStarChars.length}
            percent={pct(fourStarChars.length, total)}
            avgPity={avg(fourStarChars.map((p) => p.pity))}
            indent
          />
        )}

        {/* 4-star weapon sub-row */}
        {fourStarWeapons.length > 0 && (
          <StatsTableRow
            label="└ Weapon"
            labelColor="hsl(var(--muted-foreground))"
            count={fourStarWeapons.length}
            percent={pct(fourStarWeapons.length, total)}
            avgPity={avg(fourStarWeapons.map((p) => p.pity))}
            indent
          />
        )}

        {/* 4-star 50/50 sub-row */}
        {stats.fourStarChallenges > 0 && (
          <StatsTableRow
            label="└ Win 50:50"
            labelColor="hsl(var(--muted-foreground))"
            count={stats.fourStarWins}
            percent={pct(stats.fourStarWins, stats.fourStarChallenges)}
            indent
          />
        )}
      </div>

      {/* 5-star chips */}
      {fiveStars.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[...fiveStars].reverse().map((pull, i) => {
            const c = chipColors(pull)
            return (
              <div
                key={pull.id ?? i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  fontSize: 11,
                }}
              >
                <span style={{ color: c.text, fontWeight: 500 }}>
                  {pull.itemName}
                </span>
                <span style={{ color: c.pityColor, fontWeight: 700, fontSize: 12 }}>
                  {pull.pity}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: "hsl(var(--muted-foreground))",
  textAlign: "right",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
}

function StatsTableRow({ label, labelColor, count, percent, avgPity, indent }: {
  label: string
  labelColor: string
  count: number
  percent: string
  avgPity?: string
  indent?: boolean
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 60px 70px 70px",
        gap: 4,
        padding: "3px 0",
        paddingLeft: indent ? 12 : 0,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: indent ? 400 : 600, color: labelColor }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: "hsl(var(--foreground))", textAlign: "right", fontWeight: 600 }}>
        {count}
      </span>
      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "right" }}>
        {percent}
      </span>
      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "right" }}>
        {avgPity ?? ""}
      </span>
    </div>
  )
}

/* ──────────────────────────────────────── */
/*  Main Pulls Page                         */
/* ──────────────────────────────────────── */

export function Pulls() {
  const [selectedGame, setSelectedGame] = useState<GameId>("genshin")
  const [bannerFilter, setBannerFilter] = useState<BannerFilter>("all")
  const [pulls, setPulls] = useState<PullRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ParseResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const loadPulls = useCallback(async () => {
    setLoading(true)
    const allPulls = await db.pulls
      .where("gameId")
      .equals(selectedGame)
      .toArray()
    allPulls.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    setPulls(allPulls)
    setLoading(false)
  }, [selectedGame])

  useEffect(() => { loadPulls() }, [loadPulls])

  useEffect(() => { setBannerFilter("all") }, [selectedGame])

  const processFile = async (file: File) => {
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      let result: ParseResult
      if (file.name.endsWith(".dat")) {
        result = parseImport(null, await file.text())
      } else {
        result = parseImport(JSON.parse(await file.text()))
      }
      setSelectedGame(result.gameId)
      setImportResult(result)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to parse file")
    } finally {
      setImporting(false)
    }
  }

  const confirmImport = async () => {
    if (!importResult) return
    await db.pulls.where("gameId").equals(importResult.gameId).delete()
    await db.pulls.bulkAdd(importResult.records)
    setImportResult(null)
    loadPulls()
  }

  const cancelImport = () => { setImportResult(null); setImportError(null) }

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }, [])
  const handleDragLeave = useCallback(() => { setDragOver(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ""
  }

  // Detailed stats per banner
  const detailedStats = useMemo(() => {
    return GAME_BANNER_CARDS[selectedGame].map((bt) =>
      computeDetailedBannerStats(pulls, bt, selectedGame)
    )
  }, [pulls, selectedGame])

  // Total wishes worth
  const totalWishesWorth = useMemo(() => {
    return pulls.length * GAMES[selectedGame].currencyPerPull
  }, [pulls, selectedGame])

  // Filtered pulls for the list
  const filteredPulls = bannerFilter === "all"
    ? pulls
    : pulls.filter((p) => p.bannerType === bannerFilter)
  const displayPulls = [...filteredPulls].reverse()

  const game = GAMES[selectedGame]
  const accent = `hsl(var(${game.accentVar}))`
  const accentBg = (o: number) => `hsla(var(${game.accentVar}) / ${o})`

  return (
    <div style={{ padding: 24 }}>
      {/* Game selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {GAME_IDS.map((gId) => {
          const g = GAMES[gId]
          const active = gId === selectedGame
          return (
            <button
              key={gId}
              onClick={() => setSelectedGame(gId)}
              style={{
                padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                border: `1px solid ${active ? `hsla(var(${g.accentVar}) / 0.4)` : "hsla(0,0%,100%,0.06)"}`,
                background: active ? `hsla(var(${g.accentVar}) / 0.12)` : "hsla(0,0%,100%,0.03)",
                color: active ? `hsl(var(${g.accentVar}))` : "hsl(var(--muted-foreground))",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {g.shortName}
            </button>
          )
        })}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          padding: 24, borderRadius: 14,
          border: `2px dashed ${dragOver ? accent : "hsla(0,0%,100%,0.1)"}`,
          background: dragOver ? accentBg(0.06) : "hsla(0,0%,100%,0.02)",
          textAlign: "center", marginBottom: 20, transition: "all 0.15s", cursor: "pointer",
        }}
        onClick={() => document.getElementById("pull-file-input")?.click()}
      >
        <input id="pull-file-input" type="file" accept=".json,.dat" onChange={handleFileInput} style={{ display: "none" }} />
        {importing ? (
          <div style={{ fontSize: 13, color: accent }}>Processing...</div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", marginBottom: 4 }}>
              Drop pull history file here
            </div>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
              paimon.moe (.json) · starrailstation (.dat) · zzz.rng.moe (.json) · wuwatracker (.json)
            </div>
          </>
        )}
      </div>

      {/* Import error */}
      {importError && (
        <div
          style={{
            padding: "12px 16px", borderRadius: 10,
            background: "hsla(0, 70%, 50%, 0.1)", border: "1px solid hsla(0, 70%, 50%, 0.2)",
            color: "hsl(0, 70%, 60%)", fontSize: 12, marginBottom: 20,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}
        >
          <span>{importError}</span>
          <button onClick={cancelImport} style={{ background: "none", border: "none", color: "hsl(0, 70%, 60%)", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Import preview */}
      {importResult && (
        <div style={{ padding: "16px 20px", borderRadius: 12, background: accentBg(0.06), border: `1px solid ${accentBg(0.2)}`, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: accent, marginBottom: 10 }}>
            Detected: {GAMES[importResult.gameId].name}
          </div>
          <div style={{ display: "flex", gap: 20, marginBottom: 14, fontSize: 12 }}>
            <span style={{ color: "hsl(var(--foreground))" }}>{importResult.pullCount.toLocaleString()} total pulls</span>
            <span style={{ color: "hsl(45, 90%, 60%)" }}>{importResult.fiveStarCount} five-star</span>
            <span style={{ color: "hsl(270, 60%, 65%)" }}>{importResult.fourStarCount} four-star</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={confirmImport} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: accentBg(0.2), border: `1px solid ${accentBg(0.3)}`, color: accent, cursor: "pointer" }}>
              Import & Replace
            </button>
            <button onClick={cancelImport} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 11, fontWeight: 500, background: "transparent", border: "1px solid hsla(0,0%,100%,0.1)", color: "hsl(var(--muted-foreground))", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Banner Detail Cards (2-column grid) ── */}
      {!loading && pulls.length > 0 && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: detailedStats.length <= 2 ? "1fr 1fr" : "1fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            {detailedStats.map((stats) => (
              <BannerDetailCard key={stats.bannerType} stats={stats} />
            ))}

            {/* Wishes Worth card */}
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 12,
                background: "hsla(0,0%,100%,0.03)",
                border: "1px solid hsla(0,0%,100%,0.06)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                Wishes Worth
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: accent }}>★</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: "hsl(var(--foreground))" }}>
                  {totalWishesWorth.toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                {pulls.length.toLocaleString()} total pulls across all banners
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Banner Filter + Pull List ── */}
      {!loading && pulls.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, marginTop: 10 }}>
            {GAME_BANNERS[selectedGame].map((b) => {
              const active = bannerFilter === b
              return (
                <button
                  key={b}
                  onClick={() => setBannerFilter(b)}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                    border: `1px solid ${active ? accentBg(0.3) : "hsla(0,0%,100%,0.06)"}`,
                    background: active ? accentBg(0.12) : "hsla(0,0%,100%,0.03)",
                    color: active ? accent : "hsl(var(--muted-foreground))",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >
                  {BANNER_LABELS_SHORT[b]}
                </button>
              )
            })}
            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", alignSelf: "center", marginLeft: 8 }}>
              {filteredPulls.length.toLocaleString()} pulls
            </span>
          </div>

          {/* Pull list */}
          <div
            style={{
              display: "flex", flexDirection: "column", gap: 1,
              maxHeight: 500, overflowY: "auto", borderRadius: 10,
              border: "1px solid hsla(0,0%,100%,0.06)",
            }}
          >
            {displayPulls.map((pull, i) => (
              <div
                key={pull.id ?? i}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "7px 14px", background: rarityBg(pull.rarity),
                  gap: 10, fontSize: 12,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: rarityColor(pull.rarity), minWidth: 24 }}>
                  ★{pull.rarity}
                </span>
                <span style={{ flex: 1, fontWeight: pull.rarity >= 4 ? 600 : 400, color: pull.rarity >= 4 ? rarityColor(pull.rarity) : "hsl(var(--muted-foreground))" }}>
                  {pull.itemName}
                </span>
                {pull.rarity === 5 && pull.isRateUp !== null && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                    background: pull.isRateUp ? "hsla(142, 70%, 50%, 0.12)" : "hsla(0, 70%, 50%, 0.12)",
                    color: pull.isRateUp ? "hsl(142, 70%, 50%)" : "hsl(0, 70%, 55%)",
                  }}>
                    {pull.isRateUp ? "Won" : "Lost"}
                  </span>
                )}
                {pull.rarity >= 4 && (
                  <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", minWidth: 46, textAlign: "right" }}>
                    Pity {pull.pity}
                  </span>
                )}
                <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", opacity: 0.6, minWidth: 56, textAlign: "right" }}>
                  {BANNER_LABELS_SHORT[pull.bannerType] ?? pull.bannerType}
                </span>
                <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", opacity: 0.6, minWidth: 130, textAlign: "right" }}>
                  {formatTimestamp(pull.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && pulls.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
          No pull data for {game.name}. Import your history above.
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 40, fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
          Loading...
        </div>
      )}
    </div>
  )
}
