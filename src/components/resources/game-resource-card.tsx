import { useState, useEffect, useCallback } from "react"
import { GAMES, type GameId } from "@/lib/games"
import { db, type ResourceSnapshot } from "@/lib/db"

function NumField({
  label,
  value,
  onChange,
  max,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  max?: number
  suffix?: string
}) {
  const [localVal, setLocalVal] = useState(value === 0 ? "" : String(value))

  // Sync from parent when value changes externally
  useEffect(() => {
    setLocalVal(value === 0 ? "" : String(value))
  }, [value])

  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: "block", fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="text"
          inputMode="numeric"
          value={localVal}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "")
            setLocalVal(raw)
            const num = parseInt(raw) || 0
            const clamped = max !== undefined ? Math.min(num, max) : num
            onChange(clamped)
          }}
          onBlur={() => {
            // Clean up display on blur
            const num = parseInt(localVal) || 0
            const clamped = max !== undefined ? Math.min(num, max) : num
            setLocalVal(clamped === 0 ? "" : String(clamped))
            onChange(clamped)
          }}
          placeholder="0"
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: "hsla(0,0%,100%,0.04)",
            border: "1px solid hsla(0,0%,100%,0.08)",
            outline: "none",
            color: "hsl(var(--foreground))",
            fontVariantNumeric: "tabular-nums",
          }}
        />
        {suffix && (
          <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function Toggle({
  active,
  onToggle,
  label,
  accentBgVal,
  dotColor,
}: {
  active: boolean
  onToggle: () => void
  label: string
  accentBgVal: string
  dotColor: string
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <div
        onClick={(e) => {
          e.preventDefault()
          onToggle()
        }}
        style={{
          width: 30,
          height: 16,
          borderRadius: 8,
          position: "relative",
          transition: "background 0.15s",
          background: active ? accentBgVal : "hsla(0,0%,100%,0.08)",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: active ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: 6,
            background: active ? dotColor : "hsla(0,0%,100%,0.3)",
            transition: "left 0.15s",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{label}</span>
    </label>
  )
}

interface GameResourceCardProps {
  gameId: GameId
  onSave?: () => void
}

export function GameResourceCard({ gameId, onSave }: GameResourceCardProps) {
  const game = GAMES[gameId]
  const accent = `hsl(var(${game.accentVar}))`
  const accentBg = (opacity: number) => `hsla(var(${game.accentVar}) / ${opacity})`

  const [loaded, setLoaded] = useState(false)
  const [snapshotId, setSnapshotId] = useState<number | null>(null)
  const [currency, setCurrency] = useState(0)
  const [pullItems, setPullItems] = useState(0)
  const [weaponPullItems, setWeaponPullItems] = useState(0)
  const [currentPity, setCurrentPity] = useState(0)
  const [isGuaranteed, setIsGuaranteed] = useState(false)
  const [weaponCurrentPity, setWeaponCurrentPity] = useState(0)
  const [weaponIsGuaranteed, setWeaponIsGuaranteed] = useState(false)
  const [weaponFatePoints, setWeaponFatePoints] = useState(0)
  const [monthlyPassActive, setMonthlyPassActive] = useState(false)
  const [monthlyPassExpiry, setMonthlyPassExpiry] = useState("")
  const [dailyCommissionsActive, setDailyCommissionsActive] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<ResourceSnapshot[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)

  // Load latest snapshot
  useEffect(() => {
    async function load() {
      const snapshots = await db.resources
        .where("gameId")
        .equals(gameId)
        .sortBy("updatedAt")
      const latest = snapshots[snapshots.length - 1]
      if (latest) {
        setSnapshotId(latest.id ?? null)
        setCurrency(latest.currency)
        setPullItems(latest.pullItems)
        setWeaponPullItems(latest.weaponPullItems)
        setCurrentPity(latest.currentPity)
        setIsGuaranteed(latest.isGuaranteed)
        setWeaponCurrentPity(latest.weaponCurrentPity ?? 0)
        setWeaponIsGuaranteed(latest.weaponIsGuaranteed ?? false)
        setWeaponFatePoints(latest.weaponFatePoints ?? 0)
        setMonthlyPassActive(latest.monthlyPassActive)
        setMonthlyPassExpiry(latest.monthlyPassExpiry ?? "")
        setDailyCommissionsActive(latest.dailyCommissionsActive ?? false)
      }
      setLoaded(true)
    }
    load()
  }, [gameId])

  const totalPulls = pullItems + Math.floor(currency / game.currencyPerPull)
  const totalWeaponPulls = weaponPullItems + Math.floor(currency / game.currencyPerPull)

  const markDirty = useCallback(() => setDirty(true), [])

  const handleSave = async () => {
    const snapshot: Omit<ResourceSnapshot, "id"> = {
      gameId,
      updatedAt: new Date().toISOString(),
      currency,
      pullItems,
      weaponPullItems,
      currentPity,
      isGuaranteed,
      weaponCurrentPity,
      weaponIsGuaranteed,
      weaponFatePoints,
      monthlyPassActive,
      monthlyPassExpiry: monthlyPassExpiry || null,
      dailyCommissionsActive,
    }

    // Always create a new snapshot (history tracking)
    await db.resources.add(snapshot as ResourceSnapshot)

    setDirty(false)
    onSave?.()
  }

  if (!loaded) {
    return (
      <div
        className="glass rounded-xl"
        style={{ padding: 20, border: `1px solid ${accentBg(0.15)}`, opacity: 0.5 }}
      >
        Loading...
      </div>
    )
  }

  return (
    <div
      className="glass rounded-xl"
      style={{
        border: `1px solid ${accentBg(0.2)}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 18px 10px",
          borderBottom: `1px solid ${accentBg(0.1)}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: accent,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: accent, letterSpacing: "0.3px" }}>
            {game.shortName}
          </span>
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            {game.name}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          {totalPulls} pulls
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Currency row */}
        <div style={{ display: "flex", gap: 10 }}>
          <NumField label={game.currency} value={currency} onChange={(v) => { setCurrency(v); markDirty() }} />
          <NumField label={game.pullItem} value={pullItems} onChange={(v) => { setPullItems(v); markDirty() }} />
          <NumField label={game.weaponPullItem} value={weaponPullItems} onChange={(v) => { setWeaponPullItems(v); markDirty() }} />
        </div>

        {/* Character banner pity */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Character Banner
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <NumField label="Current Pity" value={currentPity} onChange={(v) => { setCurrentPity(v); markDirty() }} max={game.pity5Star} />
            <div style={{ flex: 1, paddingBottom: 2 }}>
              <Toggle
                active={isGuaranteed}
                onToggle={() => { setIsGuaranteed(!isGuaranteed); markDirty() }}
                label="Guaranteed"
                accentBgVal={accentBg(0.35)}
                dotColor={accent}
              />
            </div>
          </div>
        </div>

        {/* Weapon banner pity */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Weapon Banner
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <NumField label="Current Pity" value={weaponCurrentPity} onChange={(v) => { setWeaponCurrentPity(v); markDirty() }} max={game.weaponPity} />
            {game.weaponGuaranteed ? (
              <div style={{ flex: 1, paddingBottom: 2 }}>
                <span style={{ fontSize: 10, color: "hsl(142, 50%, 50%)" }}>Always guaranteed</span>
              </div>
            ) : (
              <>
                <div style={{ paddingBottom: 2 }}>
                  <Toggle
                    active={weaponIsGuaranteed}
                    onToggle={() => { setWeaponIsGuaranteed(!weaponIsGuaranteed); markDirty() }}
                    label="Guaranteed"
                    accentBgVal={accentBg(0.35)}
                    dotColor={accent}
                  />
                </div>
                <NumField
                  label="Fate Points"
                  value={weaponFatePoints}
                  onChange={(v) => { setWeaponFatePoints(v); markDirty() }}
                  max={game.weaponMaxFatePoints}
                  suffix={`/ ${game.weaponMaxFatePoints}`}
                />
              </>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "hsla(0,0%,100%,0.06)" }} />

        {/* Daily income toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Daily Income
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Toggle
                active={dailyCommissionsActive}
                onToggle={() => { setDailyCommissionsActive(!dailyCommissionsActive); markDirty() }}
                label={`Commissions (+${game.dailyCommissionIncome}/day)`}
                accentBgVal={accentBg(0.35)}
                dotColor={accent}
              />
              <Toggle
                active={monthlyPassActive}
                onToggle={() => { setMonthlyPassActive(!monthlyPassActive); markDirty() }}
                label={`${game.monthlyPass} (+${game.monthlyPassDaily}/day)`}
                accentBgVal={accentBg(0.35)}
                dotColor={accent}
              />
            </div>
          </div>

          {/* Monthly pass expiry */}
          {monthlyPassActive && (
            <div style={{ marginLeft: 38 }}>
              <label style={{ display: "block", fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>
                Expires on
              </label>
              <input
                type="date"
                value={monthlyPassExpiry ? monthlyPassExpiry.split("T")[0] : ""}
                onChange={(e) => {
                  setMonthlyPassExpiry(e.target.value ? new Date(e.target.value).toISOString() : "")
                  markDirty()
                }}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  background: "hsla(0,0%,100%,0.04)",
                  border: "1px solid hsla(0,0%,100%,0.08)",
                  outline: "none",
                  color: "hsl(var(--foreground))",
                  colorScheme: "dark",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* History section */}
      {showHistory && historyLoaded && (
        <div
          style={{
            padding: "0 18px 10px",
            maxHeight: 160,
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            History
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", padding: "4px 0" }}>
              No history yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {history.map((snap, i) => {
                const d = new Date(snap.updatedAt)
                const totalP = snap.pullItems + Math.floor(snap.currency / game.currencyPerPull)
                return (
                  <div
                    key={snap.id ?? i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: "hsla(0,0%,100%,0.02)",
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>
                      {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {" "}
                      {d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span style={{ color: accent, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {snap.currency.toLocaleString()} {game.currency.split(" ")[0]}
                    </span>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>
                      {totalP} pulls
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          padding: "10px 18px 14px",
          borderTop: "1px solid hsla(0,0%,100%,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          onClick={async () => {
            if (!historyLoaded) {
              const all = await db.resources
                .where("gameId")
                .equals(gameId)
                .sortBy("updatedAt")
                .then((arr) => arr.reverse())
              setHistory(all)
              setHistoryLoaded(true)
            }
            setShowHistory(!showHistory)
          }}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 500,
            border: "1px solid hsla(0,0%,100%,0.08)",
            background: "transparent",
            color: "hsl(var(--muted-foreground))",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {showHistory ? "Hide history" : "History"}
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSave}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            border: `1px solid ${dirty ? accentBg(0.4) : accentBg(0.15)}`,
            background: dirty ? accentBg(0.2) : "transparent",
            color: dirty ? accent : "hsl(var(--muted-foreground))",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {dirty ? "Save" : "Saved"}
        </button>
      </div>
    </div>
  )
}
