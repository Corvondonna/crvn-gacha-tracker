import { useState, useEffect } from "react"
import { GAMES } from "@/lib/games"
import type { EventRewardResult } from "@/lib/event-rewards"

const DISPLAY_DURATION = 6000
const FADE_DURATION = 400

export function EventRewardToast({ items }: { items: EventRewardResult[] }) {
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
  const byGame = new Map<string, { currency: number; pullItems: number; events: string[] }>()
  for (const item of items) {
    const existing = byGame.get(item.gameId) ?? { currency: 0, pullItems: 0, events: [] }
    existing.currency += item.amount
    existing.pullItems += item.pullItems ?? 0
    const label = item.eventType === "patch-day"
      ? `${item.version} Patch Day`
      : `${item.version} Livestream`
    if (!existing.events.includes(label)) existing.events.push(label)
    byGame.set(item.gameId, existing)
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: `translateX(-50%) ${fading ? "translateY(8px)" : "translateY(0)"}`,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
      }}
    >
      {Array.from(byGame.entries()).map(([gameId, data]) => {
        const game = GAMES[gameId as keyof typeof GAMES]
        const accent = `hsl(var(${game.accentVar}))`
        const accentBg = `hsla(var(${game.accentVar}) / 0.12)`
        return (
          <div
            key={gameId}
            style={{
              background: "hsl(var(--card))",
              border: `1px solid hsla(var(${game.accentVar}) / 0.25)`,
              borderRadius: 8,
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              minWidth: 240,
            }}
          >
            {/* Calendar icon */}
            <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
              <rect x="1" y="2" width="12" height="11" rx="2" fill="none" stroke={accent} strokeWidth="1.2" />
              <line x1="1" y1="5.5" x2="13" y2="5.5" stroke={accent} strokeWidth="1" />
              <line x1="4" y1="0.5" x2="4" y2="3.5" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
              <line x1="10" y1="0.5" x2="10" y2="3.5" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: accent }}>
                {game.shortName} Event
              </div>
              <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                {data.events.join(", ")}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              {data.currency > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    color: accent,
                    background: accentBg,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  +{data.currency.toLocaleString()} {game.currency.split(" ")[0]}
                </div>
              )}
              {data.pullItems > 0 && (
                <div
                  style={{
                    fontSize: 10,
                    color: accent,
                    background: accentBg,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  +{data.pullItems} {game.pullItem}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
