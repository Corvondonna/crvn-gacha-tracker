import { GAMES, GAME_IDS, type GameId } from "@/lib/games"
import { cn } from "@/lib/utils"

const glowBorderClass: Record<GameId, string> = {
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

export function Dashboard() {
  return (
    <div className="p-8 h-full">
      <h1 className="text-2xl font-bold mb-1 text-[hsl(var(--foreground))]">
        crvn-gacha-tracker
      </h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-8">
        Personal gacha tracker across four games.
      </p>

      <div className="grid grid-cols-4 gap-5">
        {GAME_IDS.map((gameId) => {
          const game = GAMES[gameId]
          return (
            <div
              key={gameId}
              className={cn(
                "glass-subtle rounded-xl p-6 transition-all duration-300 cursor-pointer min-h-[180px]",
                glowBorderClass[gameId]
              )}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-bold tracking-wider border border-white/10"
                  style={{
                    background: `hsla(var(${game.accentVar}) / 0.12)`,
                    color: `hsl(var(${game.accentVar}))`,
                    textShadow: `0 0 6px hsla(var(${game.accentVar}) / 0.4)`,
                  }}
                >
                  {game.shortName}
                </div>
                <h2 className={cn("text-lg font-semibold", neonClass[gameId])}>
                  {game.name}
                </h2>
              </div>

              <div className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
                <p>{game.currency} / {game.pullItem}</p>
                <p>Pity: {game.pity5Star} (soft at ~{game.softPityStart})</p>
                <p>{game.patchCycle.durationDays}-day patch cycle</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
