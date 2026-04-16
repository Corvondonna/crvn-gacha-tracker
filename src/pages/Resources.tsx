import { useState } from "react"
import { GAME_IDS } from "@/lib/games"
import { GameResourceCard } from "@/components/resources/game-resource-card"

export function Resources() {
  const [, setSaveCount] = useState(0)

  return (
    <div style={{ padding: 24 }}>
      <h1
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 20,
          color: "hsl(var(--foreground))",
        }}
      >
        Resources
      </h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {GAME_IDS.map((gid) => (
          <GameResourceCard
            key={gid}
            gameId={gid}
            onSave={() => setSaveCount((c) => c + 1)}
          />
        ))}
      </div>
    </div>
  )
}
