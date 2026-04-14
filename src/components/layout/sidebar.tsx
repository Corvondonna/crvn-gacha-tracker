import { NavLink } from "react-router-dom"
import { Home, Calendar, History, Wallet } from "lucide-react"
import { GAMES, GAME_IDS, type GameId } from "@/lib/games"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/timeline", label: "Timeline", icon: Calendar },
  { to: "/pulls", label: "Pulls", icon: History },
  { to: "/resources", label: "Resources", icon: Wallet },
]

const gameIcons: Record<GameId, string> = {
  genshin: "GI",
  hsr: "HSR",
  zzz: "ZZZ",
  wuwa: "WW",
}

const glowClass: Record<GameId, string> = {
  genshin: "glow-border-genshin",
  hsr: "glow-border-hsr",
  zzz: "glow-border-zzz",
  wuwa: "glow-border-wuwa",
}

const neonClass: Record<GameId, string> = {
  genshin: "neon-genshin",
  hsr: "neon-hsr",
  zzz: "neon-zzz",
  wuwa: "neon-wuwa",
}

export function Sidebar() {
  return (
    <aside className="glass flex flex-col w-[72px] shrink-0 h-screen border-r-0"
      style={{ borderRight: "1px solid hsla(0, 0%, 20%, 0.4)" }}
    >
      {/* Game icons */}
      <div className="flex flex-col items-center gap-2 py-5 border-b border-white/5">
        {GAME_IDS.map((gameId) => (
          <div
            key={gameId}
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center text-[11px] font-bold tracking-wide cursor-pointer",
              "border border-transparent transition-all duration-300",
              neonClass[gameId],
              glowClass[gameId]
            )}
            title={GAMES[gameId].name}
          >
            {gameIcons[gameId]}
          </div>
        ))}
      </div>

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
    </aside>
  )
}
