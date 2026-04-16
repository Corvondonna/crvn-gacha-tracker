import { useState, useEffect } from "react"
import { GAMES } from "@/lib/games"
import type { CombatRewardResult } from "@/lib/combat-rewards"

const DISPLAY_DURATION = 6000
const FADE_DURATION = 400

export function CombatRewardToast({ items }: { items: CombatRewardResult[] }) {
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

  // Group by game
  const byGame = new Map<string, { total: number; modes: string[] }>()
  for (const item of items) {
    const existing = byGame.get(item.gameId) ?? { total: 0, modes: [] }
    existing.total += item.amount
    if (!existing.modes.includes(item.modeName)) existing.modes.push(item.modeName)
    byGame.set(item.gameId, existing)
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity: fading ? 0 : 1,
        transform: fading ? "translateY(8px)" : "translateY(0)",
        transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
      }}
    >
      {Array.from(byGame.entries()).map(([gameId, data]) => {
        const game = GAMES[gameId as keyof typeof GAMES]
        return (
          <div
            key={gameId}
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsla(0, 60%, 50%, 0.25)",
              borderRadius: 8,
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              minWidth: 220,
            }}
          >
            {/* Sword icon */}
            <svg width="12" height="16" viewBox="0 0 12 16" style={{ flexShrink: 0 }}>
              <line x1="6" y1="0" x2="6" y2="10" stroke="hsl(0, 65%, 55%)" strokeWidth="2" strokeLinecap="round" />
              <line x1="2" y1="10" x2="10" y2="10" stroke="hsl(0, 65%, 55%)" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="6" y1="10" x2="6" y2="15" stroke="hsl(0, 50%, 45%)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(0, 60%, 60%)" }}>
                {game.shortName} Combat
              </div>
              <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                {data.modes.join(", ")}
              </div>
            </div>
            <div
              style={{
                fontSize: 10,
                color: "hsl(0, 60%, 60%)",
                background: "hsla(0, 60%, 50%, 0.12)",
                padding: "2px 8px",
                borderRadius: 4,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              +{data.total.toLocaleString()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
