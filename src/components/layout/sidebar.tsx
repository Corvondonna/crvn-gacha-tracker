import { NavLink } from "react-router-dom"
import { Home, Calendar, History, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/timeline", label: "Timeline", icon: Calendar },
  { to: "/pulls", label: "Pulls", icon: History },
  { to: "/resources", label: "Resources", icon: Wallet },
]

export function Sidebar() {
  return (
    <aside className="glass flex flex-col w-[72px] shrink-0 h-screen border-r-0"
      style={{ borderRight: "1px solid hsla(0, 0%, 20%, 0.4)" }}
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
    </aside>
  )
}
