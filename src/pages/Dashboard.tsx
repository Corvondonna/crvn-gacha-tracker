import { GAMES, GAME_IDS } from "@/lib/games"

export function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">crvn-gacha-tracker</h1>
      <div className="grid grid-cols-2 gap-4">
        {GAME_IDS.map((gameId) => {
          const game = GAMES[gameId]
          return (
            <div
              key={gameId}
              className="p-4 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
            >
              <h2
                className="text-lg font-semibold mb-2"
                style={{ color: `hsl(var(${game.accentVar}))` }}
              >
                {game.name}
              </h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {game.currency} / {game.pullItem}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
