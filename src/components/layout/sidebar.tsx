import { useState, useEffect } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { Home, Calendar, History, Wallet, Swords, CalendarClock } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/timeline", label: "Timeline", icon: Calendar },
  { to: "/pulls", label: "Pulls", icon: History },
  { to: "/resources", label: "Resources", icon: Wallet },
]

const COMBAT_TOGGLE_KEY = "showCombatNodes"
const WEEKLY_TOGGLE_KEY = "showWeeklyNodes"

/** Read combat node visibility from localStorage */
export function getCombatNodesVisible(): boolean {
  return localStorage.getItem(COMBAT_TOGGLE_KEY) !== "false"
}

/** Read weekly node visibility from localStorage */
export function getWeeklyNodesVisible(): boolean {
  return localStorage.getItem(WEEKLY_TOGGLE_KEY) !== "false"
}

export function Sidebar() {
  const location = useLocation()
  const isTimeline = location.pathname === "/timeline"
  const [combatVisible, setCombatVisible] = useState(getCombatNodesVisible)
  const [weeklyVisible, setWeeklyVisible] = useState(getWeeklyNodesVisible)

  useEffect(() => {
    const handler = () => {
      setCombatVisible(getCombatNodesVisible())
      setWeeklyVisible(getWeeklyNodesVisible())
    }
    window.addEventListener("combat-toggle", handler)
    return () => window.removeEventListener("combat-toggle", handler)
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
