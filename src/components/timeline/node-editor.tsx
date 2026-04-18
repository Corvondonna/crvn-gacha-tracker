import { useState, useEffect, useRef, useMemo } from "react"
import { GAMES, type GameId } from "@/lib/games"
import { db, type TimelineEntry, type ResourceSnapshot } from "@/lib/db"
import { computeCharacterProbability, computeCombinedProbability, type ProbabilityResult } from "@/lib/probability"
import { projectIncomeUntil } from "@/lib/daily-income"

interface NodeEditorProps {
  gameId: GameId
  version: string
  phase: 1 | 2
  date: Date
  onClose: () => void
  onSave: () => void
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
            borderRadius: 8,
            background: "hsl(220, 15%, 16%)",
            border: "1px solid hsla(0,0%,100%,0.1)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            fontSize: 10,
            lineHeight: 1.5,
            color: "hsl(var(--muted-foreground))",
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

function ProbRow({ label, result, pulls, formula }: {
  label: string
  result: ProbabilityResult
  pulls: number
  formula?: string
}) {
  const color = probTierColor(result.tier)
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{label}</span>
        {formula && <InfoIcon tooltip={formula} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          {pulls} pulls
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
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

export function NodeEditor({ gameId, version, phase, date, onClose, onSave }: NodeEditorProps) {
  const game = GAMES[gameId]
  const panelRef = useRef<HTMLDivElement>(null)

  const [characterName, setCharacterName] = useState("")
  const [valueTier, setValueTier] = useState<TimelineEntry["valueTier"]>("limited")
  const [isSpeculation, setIsSpeculation] = useState(false)
  const [isPriority, setIsPriority] = useState(false)
  const [pullingWeapon, setPullingWeapon] = useState(false)
  const [pullStatus, setPullStatus] = useState<TimelineEntry["pullStatus"]>("none")
  const [existingId, setExistingId] = useState<number | null>(null)
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null)
  const [portraitBlob, setPortraitBlob] = useState<Blob | null>(null)
  const [resource, setResource] = useState<ResourceSnapshot | null>(null)

  // Load existing entry + resource snapshot
  useEffect(() => {
    async function load() {
      const entry = await db.timeline
        .where({ gameId, version })
        .filter((e) => e.phase === phase)
        .first()

      if (entry) {
        setCharacterName(entry.characterName ?? "")
        setValueTier(entry.valueTier)
        setIsSpeculation(entry.isSpeculation)
        setIsPriority(entry.isPriority ?? false)
        setPullingWeapon(entry.pullingWeapon ?? false)
        setPullStatus(entry.pullStatus ?? "none")
        setExistingId(entry.id ?? null)
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
          }
          URL.revokeObjectURL(url)
        },
        "image/webp",
        0.8
      )
    }
  }

  const handleSave = async () => {
    const entry: Omit<TimelineEntry, "id"> = {
      gameId,
      version,
      phase,
      startDate: date.toISOString(),
      characterName: characterName.trim() || null,
      characterPortrait: portraitBlob,
      valueTier,
      isSpeculation,
      isPriority,
      pullStatus,
      pullingWeapon,
    }

    if (existingId) {
      await db.timeline.update(existingId, entry)
    } else {
      await db.timeline.add(entry as TimelineEntry)
    }

    onSave()
    onClose()
  }

  const handleDelete = async () => {
    if (existingId) {
      await db.timeline.delete(existingId)
      onSave()
      onClose()
    }
  }

  const handleRemovePortrait = () => {
    if (portraitPreview) URL.revokeObjectURL(portraitPreview)
    setPortraitBlob(null)
    setPortraitPreview(null)
  }

  // Compute probabilities from current resource snapshot
  const probabilities = useMemo(() => {
    if (!resource) return null

    const config = GAMES[gameId]
    const projected = projectIncomeUntil(gameId, resource, date)

    const paidCurrency = resource.paidCurrency ?? 0
    const totalCurrency = (resource.currency ?? 0) + paidCurrency + projected.currency
    const currencyPulls = Math.floor(totalCurrency / config.currencyPerPull)

    const charPullItems = (resource.pullItems ?? 0) + projected.pullItems
    const totalCharPulls = charPullItems + currencyPulls
    const currentPity = resource.currentPity ?? 0
    const isGuaranteed = resource.isGuaranteed ?? false

    if (totalCharPulls <= 0 && currentPity <= 0) return null

    const charOnly = computeCharacterProbability(gameId, currentPity, totalCharPulls, isGuaranteed)

    const weaponPity = resource.weaponCurrentPity ?? 0
    const weaponGuaranteed = resource.weaponIsGuaranteed ?? false
    const weaponFP = resource.weaponFatePoints ?? 0
    const weaponPullItemCount = config.weaponPullItem
      ? (resource.weaponPullItems ?? 0) + projected.weaponPullItems
      : charPullItems
    const totalWeaponPulls = weaponPullItemCount + currencyPulls

    const combined = computeCombinedProbability(
      gameId,
      currentPity, totalCharPulls, isGuaranteed,
      weaponPity, totalWeaponPulls, weaponGuaranteed, weaponFP
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
      weaponFP,
    }
  }, [resource, gameId, date])

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
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          {label}
        </span>
      </label>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={panelRef}
        className="rounded-2xl overflow-hidden"
        style={{
          width: 420,
          background: "hsla(var(--glass-bg) / 0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid hsla(var(--glass-border) / 0.4)",
          border: `1px solid ${accentBg(0.2)}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 28px 16px",
            borderBottom: "1px solid hsla(0,0%,100%,0.06)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.3px",
                  color: accentColor,
                }}
              >
                {game.shortName} {version} {phase === 1 ? "Phase 1" : "Phase 2"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "hsl(var(--muted-foreground))",
                  marginTop: 4,
                }}
              >
                {date.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                color: "hsl(var(--muted-foreground))",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form body */}
        <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Character name */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 500,
                color: "hsl(var(--muted-foreground))",
                marginBottom: 6,
              }}
            >
              Character Name
            </label>
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="e.g. Raiden Shogun"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 13,
                background: "hsla(0,0%,100%,0.04)",
                border: "1px solid hsla(0,0%,100%,0.08)",
                outline: "none",
                color: "hsl(var(--foreground))",
              }}
            />
          </div>

          {/* Value tier + Portrait row */}
          <div style={{ display: "flex", gap: 16 }}>
            {/* Value tier */}
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 6,
                }}
              >
                Value Tier
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {VALUE_TIERS.map((tier) => {
                  const active = valueTier === tier.value
                  return (
                    <button
                      key={tier.value}
                      onClick={() => setValueTier(tier.value)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 500,
                        border: `1px solid ${active ? accentBg(0.4) : "hsla(0,0%,100%,0.06)"}`,
                        background: active ? accentBg(0.15) : "hsla(0,0%,100%,0.03)",
                        color: active ? accentColor : "hsl(var(--muted-foreground))",
                        cursor: "pointer",
                        transition: "all 0.12s",
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
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 6,
                }}
              >
                Portrait
              </label>
              {portraitPreview ? (
                <div style={{ position: "relative" }}>
                  <img
                    src={portraitPreview}
                    alt="Portrait"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 12,
                      objectFit: "cover",
                      border: `1px solid ${accentBg(0.3)}`,
                    }}
                  />
                  <button
                    onClick={handleRemovePortrait}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      background: "hsla(0, 62%, 50%, 0.8)",
                      color: "white",
                      fontSize: 9,
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
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    border: "1px dashed hsla(0,0%,100%,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                >
                  <span style={{ fontSize: 18, color: "hsl(var(--muted-foreground))" }}>+</span>
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
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 500,
                color: "hsl(var(--muted-foreground))",
                marginBottom: 6,
              }}
            >
              Pull Status
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              {PULL_STATUSES.map((status) => {
                const active = pullStatus === status.value
                const statusColors: Record<string, string> = {
                  none: "hsl(var(--muted-foreground))",
                  secured: "hsl(142, 70%, 50%)",
                  failed: "hsl(0, 70%, 55%)",
                }
                const statusBgs: Record<string, string> = {
                  none: "hsla(0,0%,100%,0.03)",
                  secured: "hsla(142, 70%, 50%, 0.12)",
                  failed: "hsla(0, 70%, 55%, 0.12)",
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
                      padding: "7px 10px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 500,
                      border: `1px solid ${active ? statusBorders[status.value] : "hsla(0,0%,100%,0.06)"}`,
                      background: active ? statusBgs[status.value] : "hsla(0,0%,100%,0.03)",
                      color: active ? statusColors[status.value] : "hsl(var(--muted-foreground))",
                      cursor: "pointer",
                      transition: "all 0.12s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{status.icon}</span>
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
                padding: "12px 16px",
                borderRadius: 10,
                background: "hsla(0,0%,100%,0.03)",
                border: "1px solid hsla(0,0%,100%,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "hsl(var(--muted-foreground))",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Pull Probability
              </div>
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
                label="Character + Weapon"
                result={probabilities.combined}
                pulls={probabilities.totalCharPulls}
                formula={[
                  `P(both) = P(character) \u00D7 P(weapon)`,
                  ``,
                  `Character: ${probabilities.charOnly.percent}%`,
                  `Weapon: ${probabilities.totalWeaponPulls} pulls, pity ${probabilities.weaponPity}/${game.weaponPity}`,
                  ``,
                  game.weaponGuaranteed
                    ? `Weapon banner: always guaranteed`
                    : [
                        `Fate points: ${probabilities.weaponFP}/${game.weaponMaxFatePoints}`,
                        probabilities.weaponGuaranteed
                          ? `Next 5-star weapon is guaranteed`
                          : `50/50 per hit. At max fate points, next hit guaranteed.`,
                      ].join("\n"),
                ].join("\n")}
              />
            </div>
          )}

          {/* Toggles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <Toggle
              active={pullingWeapon}
              onToggle={() => setPullingWeapon(!pullingWeapon)}
              label="Pulling weapon too"
            />
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: "16px 28px",
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
                padding: "7px 14px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                border: "1px solid hsla(0, 62%, 50%, 0.2)",
                background: "transparent",
                color: "hsl(0, 70%, 60%)",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
            >
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 500,
              border: "1px solid hsla(0,0%,100%,0.1)",
              background: "transparent",
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
              transition: "background 0.12s",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              border: `1px solid ${accentBg(0.3)}`,
              background: accentBg(0.2),
              color: accentColor,
              cursor: "pointer",
              transition: "background 0.12s",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
