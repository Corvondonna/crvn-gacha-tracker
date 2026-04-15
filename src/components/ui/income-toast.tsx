import { useState, useEffect } from "react"
import { GAMES, type GameId } from "@/lib/games"
import type { IncomeAccumulation } from "@/lib/daily-income"

const DISPLAY_DURATION = 5000
const FADE_DURATION = 400

export function IncomeToast({ items }: { items: IncomeAccumulation[] }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (items.length === 0) return
    const fadeTimer = setTimeout(() => setFading(true), DISPLAY_DURATION)
    const hideTimer = setTimeout(() => setVisible(false), DISPLAY_DURATION + FADE_DURATION)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [items])

  if (!visible || items.length === 0) return null

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity: fading ? 0 : 1,
        transform: fading ? "translateY(8px)" : "translateY(0)",
        transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
      }}
    >
      {items.map((item) => {
        const game = GAMES[item.gameId]
        const accent = `hsl(var(${game.accentVar}))`
        const accentBg = `hsla(var(${game.accentVar}) / 0.12)`
        return (
          <div
            key={item.gameId}
            style={{
              background: "hsl(var(--card))",
              border: `1px solid hsla(var(${game.accentVar}) / 0.25)`,
              borderRadius: 8,
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              minWidth: 220,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: accent,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: accent }}>
                {game.shortName}
              </div>
              <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                +{item.amount.toLocaleString()} {game.currency.split(" ")[0]}
                <span style={{ opacity: 0.6 }}> ({item.days}d)</span>
              </div>
            </div>
            <div
              style={{
                fontSize: 9,
                color: accent,
                background: accentBg,
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              +{Math.floor(item.amount / game.currencyPerPull)} pulls
            </div>
          </div>
        )
      })}
    </div>
  )
}
