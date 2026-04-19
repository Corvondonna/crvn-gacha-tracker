import { useState, useEffect } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { Home, Calendar, History, Wallet, Swords, CalendarClock, ChevronDown, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { GAMES, GAME_IDS, type GameId } from "@/lib/games"

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/timeline", label: "Timeline", icon: Calendar },
  { to: "/pulls", label: "Pulls", icon: History },
  { to: "/resources", label: "Resources", icon: Wallet },
]

const COMBAT_TOGGLE_KEY = "showCombatNodes"
const WEEKLY_TOGGLE_KEY = "showWeeklyNodes"
const GAME_VISIBILITY_KEY = "gameVisibility"

/** Read combat node visibility from localStorage */
export function getCombatNodesVisible(): boolean {
  return localStorage.getItem(COMBAT_TOGGLE_KEY) !== "false"
}

/** Read weekly node visibility from localStorage */
export function getWeeklyNodesVisible(): boolean {
  return localStorage.getItem(WEEKLY_TOGGLE_KEY) !== "false"
}

/** Read per-game visibility from localStorage */
export function getGameVisibility(): Record<GameId, boolean> {
  const defaults: Record<GameId, boolean> = {} as Record<GameId, boolean>
  for (const gid of GAME_IDS) defaults[gid] = true

  try {
    const stored = localStorage.getItem(GAME_VISIBILITY_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      for (const gid of GAME_IDS) {
        if (typeof parsed[gid] === "boolean") defaults[gid] = parsed[gid]
      }
    }
  } catch { /* ignore */ }

  return defaults
}

export function Sidebar() {
  const location = useLocation()
  const isTimeline = location.pathname === "/timeline"
  const [combatVisible, setCombatVisible] = useState(getCombatNodesVisible)
  const [weeklyVisible, setWeeklyVisible] = useState(getWeeklyNodesVisible)
  const [gameVisibility, setGameVisibility] = useState(getGameVisibility)
  const [gamesOpen, setGamesOpen] = useState(false)

  useEffect(() => {
    const handler = () => {
      setCombatVisible(getCombatNodesVisible())
      setWeeklyVisible(getWeeklyNodesVisible())
    }
    window.addEventListener("combat-toggle", handler)
    return () => window.removeEventListener("combat-toggle", handler)
  }, [])

  useEffect(() => {
    const handler = () => setGameVisibility(getGameVisibility())
    window.addEventListener("game-visibility", handler)
    return () => window.removeEventListener("game-visibility", handler)
  }, [])

  const toggleCombat = () => {
    const next = !combatVisible
    localStorage.setItem(COMBAT_TOGGLE_KEY, String(next))
    setCombatVisible(next)
    window.dispatchEvent(new Event("combat-toggle"))
  }

  const toggleWeekly = () => {
    const next = !weeklyVisible
    localStorage.setItem(WEEKLY_TOGGLE_KEY, String(next))
    setWeeklyVisible(next)
    window.dispatchEvent(new Event("combat-toggle"))
  }

  const toggleGame = (gameId: GameId) => {
    const updated = { ...gameVisibility, [gameId]: !gameVisibility[gameId] }
    setGameVisibility(updated)
    localStorage.setItem(GAME_VISIBILITY_KEY, JSON.stringify(updated))
    window.dispatchEvent(new Event("game-visibility"))
  }

  return (
    <aside className="glass flex flex-col w-[72px] shrink-0 h-screen border-r-0"
      style={{ borderRight: "1px solid hsla(0, 0%, 20%, 0.4)", paddingTop: 16, paddingBottom: 16 }}
    >
      {/* Navigation */}
      <nav className="flex flex-col items-center gap-3 py-5 flex-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={label}
            className={({ isActive }) =>
              cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border",
                isActive
                  ? "glass-subtle border-white/10 text-[hsl(var(--foreground))] shadow-[0_0_12px_hsla(220,10%,80%,0.1)]"
                  : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-white/5 hover:bg-white/[0.03]"
              )
            }
          >
            <Icon size={18} strokeWidth={1.5} />
          </NavLink>
        ))}
      </nav>

      {/* Bottom toggle area */}
      {isTimeline && (
        <div className="flex flex-col items-center gap-2 py-4"
          style={{ borderTop: "1px solid hsla(0, 0%, 20%, 0.4)" }}
        >
          {/* Game visibility dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setGamesOpen(!gamesOpen)}
              title="Toggle game visibility"
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border",
                gamesOpen
                  ? "glass-subtle border-white/10 text-[hsl(var(--foreground))]"
                  : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-white/5 hover:bg-white/[0.03]"
              )}
            >
              <ChevronDown
                size={18}
                strokeWidth={1.5}
                style={{
                  transform: gamesOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            {/* Dropdown panel */}
            {gamesOpen && (
              <div
                className="glass animate-fade-in"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: "calc(100% + 8px)",
                  width: 180,
                  borderRadius: 8,
                  border: "1px solid hsla(0, 0%, 20%, 0.5)",
                  padding: "8px 0",
                  zIndex: 100,
                }}
              >
                <div style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  color: "hsl(var(--muted-foreground))",
                  padding: "4px 12px 8px",
                  textTransform: "uppercase",
                }}>
                  Games
                </div>
                {GAME_IDS.map((gid) => {
                  const game = GAMES[gid]
                  const visible = gameVisibility[gid]
                  const accent = `hsl(var(${game.accentVar}))`
                  return (
                    <button
                      key={gid}
                      onClick={() => toggleGame(gid)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "6px 12px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        color: visible ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                        opacity: visible ? 1 : 0.5,
                        transition: "opacity 0.15s ease",
                      }}
                    >
                      {visible ? (
                        <Eye size={13} strokeWidth={1.5} style={{ color: accent, flexShrink: 0 }} />
                      ) : (
                        <EyeOff size={13} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, textAlign: "left" }}>{game.name}</span>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: accent,
                        opacity: visible ? 0.7 : 0.3,
                      }}>
                        {game.shortName}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <button
            onClick={toggleCombat}
            title={combatVisible ? "Hide combat activities" : "Show combat activities"}
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border",
              combatVisible
                ? "glass-subtle border-white/10 text-[hsl(var(--foreground))]"
                : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-white/5 hover:bg-white/[0.03]"
            )}
          >
            <Swords size={18} strokeWidth={1.5} />
          </button>
          <button
            onClick={toggleWeekly}
            title={weeklyVisible ? "Hide weeklies" : "Show weeklies"}
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 border",
              weeklyVisible
                ? "glass-subtle border-white/10 text-[hsl(var(--foreground))]"
                : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-white/5 hover:bg-white/[0.03]"
            )}
          >
            <CalendarClock size={18} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </aside>
  )
}
