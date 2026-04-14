import { NavLink } from "react-router-dom"
import { Calendar, History, Wallet } from "lucide-react"
import { GAMES, type GameId } from "@/lib/games"
import { cn } from "@/lib/utils"

const navItems = [
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

export function Sidebar() {
  return (
    <aside className="flex flex-col w-16 h-screen bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] sticky top-0">
      <div className="flex flex-col items-center gap-1 py-4 border-b border-[hsl(var(--border))]">
        {(Object.keys(GAMES) as GameId[]).map((gameId) => (
          <div
            key={gameId}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer transition-colors hover:bg-[hsl(var(--accent))]"
            style={{ color: `hsl(var(${GAMES[gameId].accentVar}))` }}
            title={GAMES[gameId].name}
          >
            {gameIcons[gameId]}
          </div>
        ))}
      </div>

      <nav className="flex flex-col items-center gap-2 py-4 flex-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                isActive
                  ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
              )
            }
          >
            <Icon size={20} />
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
