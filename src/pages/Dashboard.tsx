import { useState, useEffect, useMemo } from "react"
import { GAMES, GAME_IDS, type GameId } from "@/lib/games"
import { db, type TimelineEntry, type ResourceSnapshot } from "@/lib/db"
import { generatePatchSeries, patchesToNodes, type TimelineNode } from "@/lib/timeline"
import { PATCH_ANCHORS } from "@/data/patch-anchors"
import { computeCharacterProbability, computeCombinedProbability, computeSparkProbability, type ProbabilityResult } from "@/lib/probability"
import { projectIncomeUntil } from "@/lib/daily-income"

function probTierColor(tier: ProbabilityResult["tier"]): string {
  switch (tier) {
    case "guaranteed": return "hsl(142, 70%, 50%)"
    case "high": return "hsl(142, 50%, 45%)"
    case "medium": return "hsl(45, 80%, 55%)"
    case "low": return "hsl(25, 80%, 50%)"
    case "very-low": return "hsl(0, 60%, 50%)"
  }
}

interface UpcomingCard {
  gameId: GameId
  version: string
  phase: 1 | 2
  date: Date
  entry: TimelineEntry | null
  resource: ResourceSnapshot | null
}

export function Dashboard() {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [resources, setResources] = useState<Map<GameId, ResourceSnapshot>>(new Map())
  const [portraitUrls, setPortraitUrls] = useState<Map<string, string>>(new Map())

  // Load timeline entries and resources
  useEffect(() => {
    async function load() {
      const allEntries = await db.timeline.toArray()
      setEntries(allEntries)

      const resMap = new Map<GameId, ResourceSnapshot>()
      for (const gid of GAME_IDS) {
        const snaps = await db.resources
          .where("gameId")
          .equals(gid)
          .sortBy("updatedAt")
        const latest = snaps[snaps.length - 1]
        if (latest) resMap.set(gid, latest)
      }
      setResources(resMap)
    }
    load()
  }, [])

  // Build portrait URLs
  useEffect(() => {
    const urls = new Map<string, string>()
    for (const e of entries) {
      if (e.characterPortrait) {
        const key = `${e.gameId}:${e.version}:${e.phase}`
        urls.set(key, URL.createObjectURL(e.characterPortrait))
      }
    }
    setPortraitUrls(urls)
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  }, [entries])

  // Find next upcoming registered character per game
  const upcomingCards = useMemo(() => {
    const now = new Date()
    // Use start of today so targets persist through their banner day
    // and shift to the next target at midnight of the following day
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const rangeEnd = new Date(now)
    rangeEnd.setMonth(rangeEnd.getMonth() + 12)

    const cards: UpcomingCard[] = []
    const patchStartMap = new Map<string, Date>()

    for (const anchor of PATCH_ANCHORS) {
      const patches = generatePatchSeries(
        anchor.gameId, anchor.version, anchor.phase1Start, now, rangeEnd
      )
      for (const p of patches) {
        patchStartMap.set(`${p.gameId}:${p.version}`, p.phase1Start)
      }
      const nodes = patchesToNodes(patches)

      // Find the first future node that has a registered character
      // Uses start of today so the target stays visible through the entire banner day
      const futureNodes = nodes
        .filter((n) => n.date >= today)
        .sort((a, b) => a.date.getTime() - b.date.getTime())

      let found: TimelineNode | null = null
      let foundEntry: TimelineEntry | null = null

      for (const node of futureNodes) {
        const entry = entries.find(
          (e) => e.gameId === node.gameId && e.version === node.version && e.phase === node.phase
        )
        if (entry?.characterName) {
          found = node
          foundEntry = entry
          break
        }
      }

      if (found && foundEntry) {
        cards.push({
          gameId: anchor.gameId,
          version: found.version,
          phase: found.phase as 1 | 2,
          date: found.date,
          entry: foundEntry,
          resource: resources.get(anchor.gameId) ?? null,
        })
      } else {
        // No registered character found, show the first future node anyway
        const firstNode = futureNodes[0]
        if (firstNode) {
          const entry = entries.find(
            (e) => e.gameId === firstNode.gameId && e.version === firstNode.version && e.phase === firstNode.phase
          )
          cards.push({
            gameId: anchor.gameId,
            version: firstNode.version,
            phase: firstNode.phase as 1 | 2,
            date: firstNode.date,
            entry: entry ?? null,
            resource: resources.get(anchor.gameId) ?? null,
          })
        }
      }
    }

    // Uma: find next target from timeline entries directly (no patch cycle)
    const umaEntries = entries
      .filter((e) => e.gameId === "uma" && e.characterName)
      .filter((e) => new Date(e.startDate) >= today)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

    const umaTarget = umaEntries[0]
    if (umaTarget) {
      cards.push({
        gameId: "uma",
        version: umaTarget.version,
        phase: umaTarget.phase,
        date: new Date(umaTarget.startDate),
        entry: umaTarget,
        resource: resources.get("uma") ?? null,
      })
    } else {
      // Show placeholder card for Uma even with no targets
      cards.push({
        gameId: "uma",
        version: "-",
        phase: 1,
        date: now,
        entry: null,
        resource: resources.get("uma") ?? null,
      })
    }

    return { cards, patchStartMap }
  }, [entries, resources])

  return (
    <div style={{ padding: 48, height: "100%", overflowY: "auto" }}>
      <h1
        className="animate-fade-in"
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 4,
          color: "hsl(var(--foreground))",
        }}
      >
        Corvon Gacha Lab
      </h1>
      <p
        className="animate-fade-in"
        style={{
          fontSize: 13,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 32,
          animationDelay: "0.05s",
        }}
      >
        Personal gacha tracker across five games.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {upcomingCards.cards.map((card, cardIndex) => {
          const game = GAMES[card.gameId]
          const accent = `hsl(var(${game.accentVar}))`
          const accentBg = (opacity: number) => `hsla(var(${game.accentVar}) / ${opacity})`
          const portraitKey = `${card.gameId}:${card.version}:${card.phase}`
          const portraitUrl = portraitUrls.get(portraitKey) ?? null
          const hasCharacter = !!card.entry?.characterName

          // Compute pulls and probability
          let totalPulls = 0
          let prob: ProbabilityResult | null = null
          const isPullingWeapon = card.entry?.pullingWeapon ?? false
          const isUma = card.gameId === "uma"
          const umaBannerLane = card.entry?.bannerLane

          if (card.resource) {
            const res = card.resource
            const projected = projectIncomeUntil(card.gameId, res, card.date, upcomingCards.patchStartMap)
            const paidCurrency = res.paidCurrency ?? 0
            const totalCurrency = (res.currency ?? 0) + paidCurrency + projected.currency
            const currencyPulls = Math.floor(totalCurrency / game.currencyPerPull)

            if (isUma) {
              const tickets = umaBannerLane === "support"
                ? (res.secondaryPullItems ?? 0)
                : (res.pullItems ?? 0)
              totalPulls = tickets + currencyPulls
              const sparkCount = umaBannerLane === "support"
                ? (res.supportSparkCount ?? 0)
                : (res.charSparkCount ?? 0)
              const rateUpShare = card.entry?.rateUpPercent ? card.entry.rateUpPercent / 100 : 0.5

              if (totalPulls > 0) {
                const copiesNeeded = umaBannerLane === "support"
                  ? (card.entry?.dupeCount ?? 0) + 1
                  : 1
                prob = computeSparkProbability(
                  totalPulls, game.baseRate5Star, rateUpShare,
                  game.sparkThreshold, sparkCount, copiesNeeded
                )
              }
            } else {
              const charPullItems = (res.pullItems ?? 0) + projected.pullItems
              totalPulls = charPullItems + currencyPulls
              const currentPity = res.currentPity ?? 0
              const isGuaranteed = res.isGuaranteed ?? false

              if (totalPulls > 0 || currentPity > 0) {
                if (isPullingWeapon) {
                  const weaponPity = res.weaponCurrentPity ?? 0
                  const weaponGuaranteed = res.weaponIsGuaranteed ?? false
                  const weaponFP = 0
                  const weaponPullItemCount = game.weaponPullItem
                    ? (res.weaponPullItems ?? 0) + projected.weaponPullItems
                    : charPullItems
                  const totalWeaponPulls = weaponPullItemCount + currencyPulls

                  prob = computeCombinedProbability(
                    card.gameId,
                    currentPity, totalPulls, isGuaranteed,
                    weaponPity, totalWeaponPulls, weaponGuaranteed, weaponFP
                  )
                } else {
                  prob = computeCharacterProbability(card.gameId, currentPity, totalPulls, isGuaranteed)
                }
              }
            }
          }

          // Days until release
          const now = new Date()
          const daysUntil = Math.max(0, Math.ceil((card.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

          return (
            <div
              key={card.gameId}
              className="glass animate-fade-up"
              style={{
                border: `1px solid ${accentBg(0.2)}`,
                borderRadius: 10,
                overflow: "hidden",
                display: "flex",
                flexDirection: "row",
                alignItems: "stretch",
                animationDelay: `${0.1 + cardIndex * 0.08}s`,
              }}
            >
              {/* Portrait - left side */}
              <div
                style={{
                  width: 88,
                  minHeight: 88,
                  flexShrink: 0,
                  background: accentBg(0.06),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {portraitUrl ? (
                  <img
                    src={portraitUrl}
                    alt={card.entry?.characterName ?? ""}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: accent,
                      opacity: 0.6,
                    }}
                  >
                    {game.shortName}
                  </div>
                )}
              </div>

              {/* Info - right side */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  padding: "14px 20px",
                  gap: 24,
                }}
              >
                {/* Game badge */}
                <div
                  style={{
                    width: 40,
                    flexShrink: 0,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: accent,
                      letterSpacing: "0.3px",
                    }}
                  >
                    {game.shortName}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                    }}
                  >
                    {daysUntil === 0 ? "Today" : `${daysUntil}d`}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 32, background: "hsla(0,0%,100%,0.06)", flexShrink: 0 }} />

                {/* Character name + version */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: hasCharacter ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {hasCharacter ? card.entry!.characterName : "Unregistered"}
                    </span>
                    {isPullingWeapon && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: accentBg(0.15),
                          color: accent,
                          letterSpacing: "0.3px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        + Weapon
                      </span>
                    )}
                    {isUma && umaBannerLane && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: accentBg(0.15),
                          color: accent,
                          letterSpacing: "0.3px",
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                        }}
                      >
                        LB{card.entry?.dupeCount ?? 0}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 3,
                    }}
                  >
                    {isUma ? (card.entry?.characterName ?? "No target") : `${card.version} Phase ${card.phase}`}
                    {" \u00B7 "}
                    {card.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 32, background: "hsla(0,0%,100%,0.06)", flexShrink: 0 }} />

                {/* Pulls */}
                <div style={{ textAlign: "center", minWidth: 64, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>
                    Pulls
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: accent,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {totalPulls}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 32, background: "hsla(0,0%,100%,0.06)", flexShrink: 0 }} />

                {/* Probability */}
                <div style={{ textAlign: "center", minWidth: 64, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>
                    Probability
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: prob ? probTierColor(prob.tier) : "hsl(var(--muted-foreground))",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {prob ? `${prob.percent}%` : "\u2014"}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
