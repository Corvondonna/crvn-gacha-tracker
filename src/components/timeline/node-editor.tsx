import { useState, useEffect, useRef, useMemo } from "react"
import { GAMES, type GameId } from "@/lib/games"
import { db, type TimelineEntry, type ResourceSnapshot } from "@/lib/db"
import { computeCharacterProbability, computeCombinedProbability, computeSparkProbability, type ProbabilityResult } from "@/lib/probability"
import { projectIncomeUntil } from "@/lib/daily-income"
import { pushToCloud, portraitStoragePath, deletePortraitFromStorage } from "@/lib/sync"
import { DatePicker } from "@/components/ui/date-picker"

interface NodeEditorProps {
  gameId: GameId
  version: string
  phase: 1 | 2
  date: Date
  onClose: () => void
  onSave: () => void
  /** When true, the editor is in "create" mode: version is auto-generated, date is editable */
  isCreateMode?: boolean
  /** Whether the current date came from a user override (vs calculated) */
  isManualDate?: boolean
  /** Patch start dates for income projection (patch day / livestream rewards) */
  patchStartMap?: Map<string, Date>
}

const VALUE_TIERS = [
  { value: "limited", label: "Limited 5-Star" },
  { value: "rerun", label: "Rerun 5-Star" },
  { value: "standard", label: "Standard 5-Star" },
  { value: "four-star", label: "4-Star" },
] as const

const PULL_STATUSES = [
  { value: "none", label: "Not set", icon: "—" },
  { value: "secured", label: "Secured", icon: "✓" },
  { value: "failed", label: "Failed", icon: "✕" },
] as const

function probTierColor(tier: ProbabilityResult["tier"]): string {
  switch (tier) {
    case "guaranteed": return "hsl(142, 70%, 50%)"
    case "high": return "hsl(142, 50%, 45%)"
    case "medium": return "hsl(45, 80%, 55%)"
    case "low": return "hsl(25, 80%, 50%)"
    case "very-low": return "hsl(0, 60%, 50%)"
  }
}

const MONO_FONT = "'JetBrains Mono', 'Fira Code', monospace"

function InfoIcon({ tooltip }: { tooltip: string }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={ref}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        style={{ cursor: "help", flexShrink: 0 }}
      >
        <circle cx="7" cy="7" r="6" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" strokeOpacity="0.5" />
        <text
          x="7"
          y="10.5"
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill="hsl(var(--muted-foreground))"
          style={{ userSelect: "none" }}
        >
          i
        </text>
      </svg>
      {show && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: 260,
            padding: "10px 12px",
            borderRadius: 3,
            background: "hsla(0, 0%, 3%, 0.95)",
            border: "1px solid hsla(0,0%,100%,0.1)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            fontSize: 9,
            fontFamily: MONO_FONT,
            lineHeight: 1.6,
            color: "hsla(0,0%,100%,0.5)",
            whiteSpace: "pre-line",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  )
}

function ProbRow({ label, result, pulls, weaponPulls, formula }: {
  label: string
  result: ProbabilityResult
  pulls: number
  weaponPulls?: number
  formula?: string
}) {
  const color = probTierColor(result.tier)
  const displayPulls = weaponPulls != null ? pulls + weaponPulls : pulls
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: "hsla(0,0%,100%,0.4)" }}>{label}</span>
        {formula && <InfoIcon tooltip={formula} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontFamily: MONO_FONT, color: "hsla(0,0%,100%,0.3)" }}>
          {`${displayPulls} pulls`}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            fontFamily: MONO_FONT,
            color,
            minWidth: 42,
            textAlign: "right",
          }}
        >
          {result.percent}%
        </span>
      </div>
    </div>
  )
}

export function NodeEditor({ gameId, version, phase, date: initialDate, onClose, onSave, isCreateMode, isManualDate: initialIsManual, patchStartMap }: NodeEditorProps) {
  const game = GAMES[gameId]
  const panelRef = useRef<HTMLDivElement>(null)

  const [date, setDate] = useState(initialDate)
  const [dateWasEdited, setDateWasEdited] = useState(false)
  const [isManual, setIsManual] = useState(initialIsManual ?? false)
  const [characterName, setCharacterName] = useState("")
  const [valueTier, setValueTier] = useState<TimelineEntry["valueTier"]>("limited")
  const [isSpeculation, setIsSpeculation] = useState(false)
  const [isPriority, setIsPriority] = useState(false)
  const [pullingWeapon, setPullingWeapon] = useState(false)
  const [pullStatus, setPullStatus] = useState<TimelineEntry["pullStatus"]>("none")
  const [existingId, setExistingId] = useState<number | null>(null)
  const [bannerLane, setBannerLane] = useState<"character" | "support">("character")
  const [rateUpPercent, setRateUpPercent] = useState(50)
  const [dupeCount, setDupeCount] = useState(0)
  const [bannerDurationDays, setBannerDurationDays] = useState(14)
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null)
  const [portraitBlob, setPortraitBlob] = useState<Blob | null>(null)
  const [portraitRemoved, setPortraitRemoved] = useState(false)
  const [resource, setResource] = useState<ResourceSnapshot | null>(null)

  // Load existing entry + resource snapshot
  useEffect(() => {
    async function load() {
      // In create mode, skip loading existing entry
      const entry = isCreateMode ? null : await db.timeline
        .where({ gameId, version })
        .filter((e) => e.phase === phase)
        .first()

      if (entry) {
        console.log(`[node-editor] Loaded entry id=${entry.id}, pullStatus=${entry.pullStatus}, isPriority=${entry.isPriority}, name=${entry.characterName}`)
        setCharacterName(entry.characterName ?? "")
        setValueTier(entry.valueTier)
        setIsSpeculation(entry.isSpeculation)
        setIsPriority(entry.isPriority ?? false)
        setPullingWeapon(entry.pullingWeapon ?? false)
        setPullStatus(entry.pullStatus ?? "none")
        setExistingId(entry.id ?? null)
        setBannerLane(entry.bannerLane ?? "character")
        setRateUpPercent(entry.rateUpPercent ?? 50)
        setDupeCount(entry.dupeCount ?? 0)
        setBannerDurationDays(entry.bannerDurationDays ?? 14)
        if (entry.dateOverride) {
          setIsManual(true)
        }
        if (entry.characterPortrait) {
          setPortraitPreview(URL.createObjectURL(entry.characterPortrait))
          setPortraitBlob(entry.characterPortrait)
        }
      }

      const res = await db.resources
        .where("gameId")
        .equals(gameId)
        .last()
      if (res) setResource(res)
    }
    load()
  }, [gameId, version, phase])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  // Cleanup portrait preview URL
  useEffect(() => {
    return () => {
      if (portraitPreview) URL.revokeObjectURL(portraitPreview)
    }
  }, [portraitPreview])

  const handlePortraitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const img = new Image()
    const url = URL.createObjectURL(file)
    img.src = url

    img.onload = () => {
      const canvas = document.createElement("canvas")
      const maxSize = 128
      let w = img.width
      let h = img.height

      if (w > maxSize || h > maxSize) {
        if (w > h) {
          h = Math.round((h * maxSize) / w)
          w = maxSize
        } else {
          w = Math.round((w * maxSize) / h)
          h = maxSize
        }
      }

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            if (portraitPreview) URL.revokeObjectURL(portraitPreview)
            setPortraitBlob(blob)
            setPortraitPreview(URL.createObjectURL(blob))
            setPortraitRemoved(false)
          }
          URL.revokeObjectURL(url)
        },
        "image/webp",
        0.8
      )
    }
  }

  const handleResetDate = () => {
    setDate(initialDate)
    setDateWasEdited(false)
    setIsManual(false)
  }

  const handleDateChange = (newDate: Date) => {
    setDate(newDate)
    setDateWasEdited(true)
    setIsManual(true)
  }

  const handleSave = async () => {
    const isUma = gameId === "uma"
    // In create mode, generate a unique version from timestamp
    const effectiveVersion = isCreateMode ? `uma-${Date.now()}` : version

    // Compute dateOverride: set if user edited the date, clear if reset
    let dateOverride: string | undefined
    if (game.hasPatchCycle && !isCreateMode) {
      if (dateWasEdited && isManual) {
        dateOverride = date.toISOString()
      } else if (!isManual) {
        dateOverride = undefined // cleared
      } else if (isManual && !dateWasEdited) {
        // Was already manual, user didn't change it: preserve existing override
        dateOverride = date.toISOString()
      }
    }

    const entry: Omit<TimelineEntry, "id"> = {
      gameId,
      version: effectiveVersion,
      phase,
      startDate: date.toISOString(),
      characterName: characterName.trim() || null,
      characterPortrait: portraitBlob,
      // Keep portraitPath in sync: set when a blob exists, clear on explicit removal.
      // Left untouched otherwise (partial update preserves an in-flight download's path).
      ...(portraitBlob
        ? { portraitPath: portraitStoragePath(gameId, effectiveVersion, phase, characterName.trim() || null) }
        : portraitRemoved
          ? { portraitPath: null }
          : {}),
      valueTier,
      isSpeculation,
      isPriority,
      pullStatus,
      pullingWeapon,
      dateOverride,
      ...(isUma && {
        bannerLane,
        rateUpPercent,
        dupeCount,
        bannerDurationDays,
      }),
    }

    if (existingId) {
      const updated = await db.timeline.update(existingId, entry)
      console.log(`[node-editor] Updated id=${existingId}, rows affected=${updated}, pullStatus=${pullStatus}, isPriority=${isPriority}`)
    } else {
      const newId = await db.timeline.add(entry as TimelineEntry)
      console.log(`[node-editor] Added new entry id=${newId}, pullStatus=${pullStatus}, isPriority=${isPriority}`)
    }

    // If the user removed the portrait, delete the Storage file so
    // pull-time recovery can't resurrect it
    if (portraitRemoved && !portraitBlob) {
      deletePortraitFromStorage(gameId, effectiveVersion, phase, characterName.trim() || null)
    }

    // Sync to cloud (includes portrait upload)
    pushToCloud().catch((err) => console.error("Cloud sync failed:", err))

    onSave()
    onClose()
  }

  const handleDelete = async () => {
    if (existingId) {
      await db.timeline.delete(existingId)
      pushToCloud().catch((err) => console.error("Cloud sync failed:", err))
      onSave()
      onClose()
    }
  }

  const handleRemovePortrait = () => {
    if (portraitPreview) URL.revokeObjectURL(portraitPreview)
    setPortraitBlob(null)
    setPortraitPreview(null)
    setPortraitRemoved(true)
  }

  const isUma = gameId === "uma"

  // Compute probabilities from current resource snapshot
  const probabilities = useMemo(() => {
    if (!resource) return null

    const config = GAMES[gameId]
    const projected = projectIncomeUntil(gameId, resource, date, patchStartMap)

    const paidCurrency = resource.paidCurrency ?? 0
    const totalCurrency = (resource.currency ?? 0) + paidCurrency + projected.currency
    const currencyPulls = Math.floor(totalCurrency / config.currencyPerPull)

    if (isUma) {
      // Uma: tickets + currency pulls, spark system
      const tickets = bannerLane === "support"
        ? (resource.secondaryPullItems ?? 0)
        : (resource.pullItems ?? 0)
      const totalPulls = tickets + currencyPulls
      const currentSpark = bannerLane === "support"
        ? (resource.supportSparkCount ?? 0)
        : (resource.charSparkCount ?? 0)
      const rateUpShare = rateUpPercent / 100

      if (totalPulls <= 0) return null

      const copiesNeeded = bannerLane === "support" ? dupeCount + 1 : 1
      const sparkProb = computeSparkProbability(
        totalPulls, config.baseRate5Star, rateUpShare,
        config.sparkThreshold, currentSpark, copiesNeeded
      )

      return {
        charOnly: sparkProb,
        combined: sparkProb,
        totalCharPulls: totalPulls,
        totalWeaponPulls: 0,
        currentPity: currentSpark,
        isGuaranteed: false,
        weaponPity: 0,
        weaponGuaranteed: false,
      }
    }

    const charPullItems = (resource.pullItems ?? 0) + projected.pullItems
    const totalCharPulls = charPullItems + currencyPulls
    const currentPity = resource.currentPity ?? 0
    // Games without a 50/50 (NTE) are always guaranteed — same guard as
    // Dashboard and timeline-view
    const isGuaranteed = !config.has5050 || (resource.isGuaranteed ?? false)

    if (totalCharPulls <= 0 && currentPity <= 0) return null

    const charOnly = computeCharacterProbability(gameId, currentPity, totalCharPulls, isGuaranteed)

    const weaponPity = resource.weaponCurrentPity ?? 0
    const weaponGuaranteed = resource.weaponIsGuaranteed ?? false
    // For separate-pool games (NTE, WuWa), weapon pulls = dedicated items only.
    // Currency is already counted in character pulls, so don't add it again.
    // For shared-pool games, weapon uses the same pool as character.
    const weaponPullItemCount = config.weaponPullItem
      ? (resource.weaponPullItems ?? 0) + projected.weaponPullItems
      : charPullItems
    const totalWeaponPulls = config.weaponPullItem
      ? weaponPullItemCount
      : weaponPullItemCount + currencyPulls

    const combined = computeCombinedProbability(
      gameId,
      currentPity, totalCharPulls, isGuaranteed,
      weaponPity, totalWeaponPulls, weaponGuaranteed,
      // Currency converts into either banner's pull item for
      // separate-pool games; leftover after char goes to weapon
      config.weaponPullItem ? currencyPulls : 0
    )

    return {
      charOnly,
      combined,
      totalCharPulls,
      totalWeaponPulls,
      currentPity,
      isGuaranteed,
      weaponPity,
      weaponGuaranteed,
    }
  }, [resource, gameId, date, isUma, bannerLane, rateUpPercent, dupeCount, patchStartMap])

  const accentColor = `hsl(var(${game.accentVar}))`
  const accentBg = (opacity: number) => `hsla(var(${game.accentVar}) / ${opacity})`

  function Toggle({
    active,
    onToggle,
    label,
  }: {
    active: boolean
    onToggle: () => void
    label: string
  }) {
    return (
      <label
        className="flex items-center cursor-pointer"
        style={{ gap: 10 }}
      >
        <div
          onClick={onToggle}
          style={{
            width: 32,
            height: 18,
            borderRadius: 9,
            position: "relative",
            transition: "background 0.15s",
            background: active ? accentBg(0.3) : "hsla(0,0%,100%,0.08)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2,
              left: active ? 15 : 2,
              width: 14,
              height: 14,
              borderRadius: 7,
              background: "white",
              transition: "left 0.15s",
            }}
          />
        </div>
        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color: "hsla(0,0%,100%,0.4)" }}>
          {label}
        </span>
      </label>
    )
  }

  const MONO = "'JetBrains Mono', 'Fira Code', monospace"

  const SectionLabel = ({ children }: { children: string }) => (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        fontFamily: MONO,
        color: "hsla(0,0%,100%,0.3)",
        textTransform: "uppercase",
        letterSpacing: "1.5px",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: 420,
          background: "hsla(0, 0%, 4%, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${accentBg(0.2)}`,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {/* Accent top bar */}
        <div style={{ height: 2, background: accentColor, opacity: 0.5 }} />

        {/* Header */}
        <div
          style={{
            padding: "16px 24px 14px",
            borderBottom: "1px solid hsla(0,0%,100%,0.06)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: MONO,
                  letterSpacing: "0.8px",
                  color: accentColor,
                }}
              >
                {isCreateMode
                  ? `${game.shortName} // NEW BANNER`
                  : game.hasPatchCycle
                    ? `${game.shortName} // ${version} ${phase === 1 ? "PH1" : "PH2"}`
                    : `${game.shortName} // ${characterName || "EDIT BANNER"}`}
              </div>
              {(isCreateMode || !game.hasPatchCycle) ? (
                <div style={{ marginTop: 4 }}>
                  <DatePicker
                    value={date}
                    onChange={handleDateChange}
                    accentVar={game.accentVar}
                  />
                </div>
              ) : (
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <DatePicker
                    value={date}
                    onChange={handleDateChange}
                    accentVar={game.accentVar}
                  />
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      fontFamily: MONO,
                      letterSpacing: "1px",
                      padding: "2px 5px",
                      borderRadius: 2,
                      background: isManual ? "hsla(45, 80%, 55%, 0.15)" : "hsla(0,0%,100%,0.05)",
                      color: isManual ? "hsl(45, 80%, 55%)" : "hsla(0,0%,100%,0.3)",
                      border: `1px solid ${isManual ? "hsla(45, 80%, 55%, 0.3)" : "hsla(0,0%,100%,0.08)"}`,
                    }}
                  >
                    {isManual ? "MANUAL" : "CALCULATED"}
                  </span>
                  {isManual && (
                    <button
                      onClick={handleResetDate}
                      style={{
                        fontSize: 8,
                        fontWeight: 600,
                        fontFamily: MONO,
                        padding: "2px 5px",
                        borderRadius: 2,
                        background: "hsla(0,0%,100%,0.04)",
                        color: "hsla(0,0%,100%,0.35)",
                        border: "1px solid hsla(0,0%,100%,0.08)",
                        cursor: "pointer",
                        letterSpacing: "0.5px",
                      }}
                    >
                      RESET
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                width: 28,
                height: 28,
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontFamily: MONO,
                color: "hsla(0,0%,100%,0.35)",
                background: "hsla(0,0%,100%,0.04)",
                border: "1px solid hsla(0,0%,100%,0.08)",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form body */}
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Character name */}
          <div>
            <SectionLabel>Target</SectionLabel>
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Character name"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 3,
                fontSize: 12,
                fontFamily: MONO,
                background: "hsla(0,0%,100%,0.04)",
                border: "1px solid hsla(0,0%,100%,0.08)",
                outline: "none",
                color: "hsl(var(--foreground))",
              }}
            />
          </div>

          {/* Uma: Banner type + Rate-up + Spark */}
          {isUma && (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <SectionLabel>Banner Type</SectionLabel>
                <div style={{ display: "flex", gap: 5 }}>
                  {(["character", "support"] as const).map((lane) => {
                    const active = bannerLane === lane
                    return (
                      <button
                        key={lane}
                        onClick={() => setBannerLane(lane)}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: MONO,
                          border: `1px solid ${active ? accentBg(0.4) : "hsla(0,0%,100%,0.06)"}`,
                          background: active ? accentBg(0.15) : "hsla(0,0%,100%,0.02)",
                          color: active ? accentColor : "hsla(0,0%,100%,0.35)",
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {lane === "character" ? "Umamusume" : "Support"}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ width: 80 }}>
                <SectionLabel>Rate-Up %</SectionLabel>
                <input
                  type="number"
                  value={rateUpPercent}
                  onChange={(e) => setRateUpPercent(Math.max(1, Math.min(100, parseInt(e.target.value) || 0)))}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 3,
                    fontSize: 12,
                    fontFamily: MONO,
                    background: "hsla(0,0%,100%,0.04)",
                    border: "1px solid hsla(0,0%,100%,0.08)",
                    outline: "none",
                    color: "hsl(var(--foreground))",
                    textAlign: "center",
                  }}
                />
              </div>
            </div>
          )}
          {/* NOTE: per-entry spark count input removed — spark math reads the
              resource snapshot's charSparkCount/supportSparkCount (Resources
              page), so this field silently did nothing. */}

          {/* Uma: Support card dupe count */}
          {isUma && bannerLane === "support" && (
            <div>
              <SectionLabel>Dupe Count (Limit Break)</SectionLabel>
              <div style={{ display: "flex", gap: 5 }}>
                {[0, 1, 2, 3, 4].map((count) => {
                  const active = dupeCount === count
                  return (
                    <button
                      key={count}
                      onClick={() => setDupeCount(count)}
                      style={{
                        width: 32,
                        height: 28,
                        borderRadius: 3,
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: MONO,
                        border: `1px solid ${active ? accentBg(0.4) : "hsla(0,0%,100%,0.06)"}`,
                        background: active ? accentBg(0.15) : "hsla(0,0%,100%,0.02)",
                        color: active ? accentColor : "hsla(0,0%,100%,0.35)",
                        cursor: "pointer",
                      }}
                    >
                      {count}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Value tier + Portrait row */}
          <div style={{ display: "flex", gap: 16 }}>
            {/* Value tier */}
            <div style={{ flex: 1 }}>
              <SectionLabel>Classification</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                {VALUE_TIERS.map((tier) => {
                  const active = valueTier === tier.value
                  return (
                    <button
                      key={tier.value}
                      onClick={() => setValueTier(tier.value)}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: MONO,
                        border: `1px solid ${active ? accentBg(0.4) : "hsla(0,0%,100%,0.06)"}`,
                        background: active ? accentBg(0.15) : "hsla(0,0%,100%,0.02)",
                        color: active ? accentColor : "hsla(0,0%,100%,0.35)",
                        cursor: "pointer",
                        transition: "all 0.12s",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {tier.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Portrait */}
            <div>
              <SectionLabel>Portrait</SectionLabel>
              {portraitPreview ? (
                <div style={{ position: "relative" }}>
                  <img
                    src={portraitPreview}
                    alt="Portrait"
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 3,
                      objectFit: "cover",
                      border: `1px solid ${accentBg(0.3)}`,
                    }}
                  />
                  <button
                    onClick={handleRemovePortrait}
                    style={{
                      position: "absolute",
                      top: -5,
                      right: -5,
                      width: 16,
                      height: 16,
                      borderRadius: 2,
                      background: "hsla(0, 70%, 50%, 0.9)",
                      color: "white",
                      fontSize: 8,
                      fontFamily: MONO,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 3,
                    border: "1px dashed hsla(0,0%,100%,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                >
                  <span style={{ fontSize: 16, fontFamily: MONO, color: "hsla(0,0%,100%,0.25)" }}>+</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePortraitChange}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Pull Status */}
          <div>
            <SectionLabel>Status</SectionLabel>
            <div style={{ display: "flex", gap: 5 }}>
              {PULL_STATUSES.map((status) => {
                const active = pullStatus === status.value
                const statusColors: Record<string, string> = {
                  none: "hsla(0,0%,100%,0.4)",
                  secured: "hsl(142, 70%, 50%)",
                  failed: "hsl(0, 70%, 55%)",
                }
                const statusBgs: Record<string, string> = {
                  none: "hsla(0,0%,100%,0.02)",
                  secured: "hsla(142, 70%, 50%, 0.1)",
                  failed: "hsla(0, 70%, 55%, 0.1)",
                }
                const statusBorders: Record<string, string> = {
                  none: "hsla(0,0%,100%,0.06)",
                  secured: "hsla(142, 70%, 50%, 0.3)",
                  failed: "hsla(0, 70%, 55%, 0.3)",
                }
                return (
                  <button
                    key={status.value}
                    onClick={() => setPullStatus(status.value)}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: MONO,
                      border: `1px solid ${active ? statusBorders[status.value] : "hsla(0,0%,100%,0.06)"}`,
                      background: active ? statusBgs[status.value] : "hsla(0,0%,100%,0.02)",
                      color: active ? statusColors[status.value] : "hsla(0,0%,100%,0.3)",
                      cursor: "pointer",
                      transition: "all 0.12s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      letterSpacing: "0.3px",
                    }}
                  >
                    <span style={{ fontSize: 11 }}>{status.icon}</span>
                    {status.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Probability Preview */}
          {probabilities && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 3,
                background: "hsla(0,0%,100%,0.02)",
                border: "1px solid hsla(0,0%,100%,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <SectionLabel>Probability</SectionLabel>
              {isUma ? (
                <ProbRow
                  label={bannerLane === "support" ? "Support Card" : "Umamusume"}
                  result={probabilities.charOnly}
                  pulls={probabilities.totalCharPulls}
                  formula={[
                    `Base rate: ${(game.baseRate5Star * 100).toFixed(0)}%`,
                    `Rate-up share: ${rateUpPercent}%`,
                    `Effective rate: ${(game.baseRate5Star * rateUpPercent).toFixed(1)}%`,
                    `Spark: ${probabilities.currentPity}/${game.sparkThreshold}`,
                    ``,
                    `P = 1 - (1 - ${(game.baseRate5Star * rateUpPercent / 100).toFixed(4)})^${probabilities.totalCharPulls}`,
                    ``,
                    probabilities.totalCharPulls >= (game.sparkThreshold - probabilities.currentPity)
                      ? `Can reach spark: GUARANTEED`
                      : `${game.sparkThreshold - probabilities.currentPity - probabilities.totalCharPulls} pulls short of spark`,
                  ].join("\n")}
                />
              ) : (
                <>
                  <ProbRow
                    label="Character only"
                    result={probabilities.charOnly}
                    pulls={probabilities.totalCharPulls}
                    formula={[
                      `Pity: ${probabilities.currentPity}/${game.pity5Star}`,
                      `Status: ${probabilities.isGuaranteed ? "Guaranteed" : "50/50"}`,
                      `Soft pity: pull ${game.softPityStart}+`,
                      ``,
                      `P = 1 - \u220F(1 - r\u1D62) over ${probabilities.totalCharPulls} pulls`,
                      `r\u1D62 = ${(game.baseRate5Star * 100).toFixed(1)}% before soft pity`,
                      `r\u1D62 = base + 6% per pull after ${game.softPityStart}`,
                      ``,
                      probabilities.isGuaranteed
                        ? `Guaranteed: next 5-star is featured`
                        : `50/50: P(featured) = \u2211 P(hit at k) \u00D7 (0.5 + 0.5 \u00D7 P(2nd hit))`,
                    ].join("\n")}
                  />
                  <ProbRow
                    label="Char + Weapon"
                    result={probabilities.combined}
                    pulls={probabilities.totalCharPulls}
                    weaponPulls={game.weaponPullItem ? probabilities.totalWeaponPulls : undefined}
                    formula={[
                      `P(both) = P(character) \u00D7 P(weapon)`,
                      ``,
                      `Character: ${probabilities.charOnly.percent}%`,
                      `Weapon: ${probabilities.totalWeaponPulls} pulls, pity ${probabilities.weaponPity}/${game.weaponPity}`,
                      ``,
                      game.weaponGuaranteed
                        ? `Weapon banner: always guaranteed`
                        : probabilities.weaponGuaranteed
                          ? `Next 5-star weapon is guaranteed`
                          : `50/50 system. Lose once, next is guaranteed.`,
                    ].join("\n")}
                  />
                </>
              )}
            </div>
          )}

          {/* Toggles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionLabel>Options</SectionLabel>
            <Toggle
              active={isSpeculation}
              onToggle={() => setIsSpeculation(!isSpeculation)}
              label="Mark as speculation"
            />
            <Toggle
              active={isPriority}
              onToggle={() => setIsPriority(!isPriority)}
              label="Mark as priority (must pull)"
            />
            {!isUma && (
              <Toggle
                active={pullingWeapon}
                onToggle={() => setPullingWeapon(!pullingWeapon)}
                label="Pulling weapon too"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid hsla(0,0%,100%,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {existingId && (
            <button
              onClick={handleDelete}
              style={{
                padding: "6px 14px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: MONO,
                letterSpacing: "0.5px",
                border: "1px solid hsla(0, 70%, 50%, 0.25)",
                background: "transparent",
                color: "hsl(0, 70%, 55%)",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
            >
              DELETE
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: MONO,
              letterSpacing: "0.5px",
              border: "1px solid hsla(0,0%,100%,0.1)",
              background: "transparent",
              color: "hsla(0,0%,100%,0.4)",
              cursor: "pointer",
              transition: "background 0.12s",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "6px 16px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 700,
              fontFamily: MONO,
              letterSpacing: "0.5px",
              border: `1px solid ${accentBg(0.35)}`,
              background: accentBg(0.2),
              color: accentColor,
              cursor: "pointer",
              transition: "background 0.12s",
            }}
          >
            SAVE
          </button>
        </div>
      </div>
    </div>
  )
}
