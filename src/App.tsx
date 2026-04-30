import { useEffect, useRef, useState } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout/app-layout"
import { Dashboard } from "@/pages/Dashboard"
import { Timeline } from "@/pages/Timeline"
import { Pulls } from "@/pages/Pulls"
import { Resources } from "@/pages/Resources"
import { Login } from "@/pages/Login"
import { useAuth } from "@/lib/auth"
import { pullFromCloud, pushToCloud, cloudHasData, localHasData, cloudHasPortraits } from "@/lib/sync"
import { accumulateDailyIncome, type IncomeAccumulation } from "@/lib/daily-income"
import { claimCombatRewards, reverseCombatRewardInflation, type CombatRewardResult } from "@/lib/combat-rewards"
import { accumulateEventRewards, type EventRewardResult } from "@/lib/event-rewards"
import { generatePatchSeries } from "@/lib/timeline"
import { PATCH_ANCHORS } from "@/data/patch-anchors"
import { IncomeToast } from "@/components/ui/income-toast"
import { CombatRewardToast } from "@/components/ui/combat-reward-toast"
import { EventRewardToast } from "@/components/ui/event-reward-toast"

function AppContent() {
  const accumulated = useRef(false)
  const synced = useRef(false)
  const [incomeItems, setIncomeItems] = useState<IncomeAccumulation[]>([])
  const [combatItems, setCombatItems] = useState<CombatRewardResult[]>([])
  const [eventItems, setEventItems] = useState<EventRewardResult[]>([])
  const [syncDone, setSyncDone] = useState(false)

  // Sync on first load, block UI until complete to prevent race conditions
  useEffect(() => {
    if (synced.current) return
    synced.current = true

    async function syncData() {
      try {
        const [hasCloud, hasLocal] = await Promise.all([cloudHasData(), localHasData()])

        if (hasCloud && !hasLocal) {
          await pullFromCloud()
        } else if (hasLocal && !hasCloud) {
          await pushToCloud()
        } else if (hasCloud && hasLocal) {
          const hasPortraits = await cloudHasPortraits()
          if (!hasPortraits) {
            await pushToCloud()
          } else {
            await pullFromCloud()
          }
        }
      } catch (err) {
        console.error("Sync failed:", err)
      }
      setSyncDone(true)
    }

    syncData()
  }, [])

  // Run accumulations after sync is done
  useEffect(() => {
    if (!syncDone) return
    if (accumulated.current) return
    accumulated.current = true

    const now = new Date()
    const lookback = new Date(now.getFullYear(), now.getMonth() - 6, 1)
    const patchStarts = new Map<string, Date>()
    for (const anchor of PATCH_ANCHORS) {
      const patches = generatePatchSeries(
        anchor.gameId, anchor.version, anchor.phase1Start, lookback, now
      )
      for (const p of patches) {
        patchStarts.set(`${p.gameId}:${p.version}`, p.phase1Start)
      }
    }

    reverseCombatRewardInflation().then(() => {
      accumulateDailyIncome().then((results) => {
        if (results.length > 0) setIncomeItems(results)
      })
      claimCombatRewards(patchStarts).then((results) => {
        if (results.length > 0) setCombatItems(results)
      })
      accumulateEventRewards(patchStarts).then((results) => {
        if (results.length > 0) setEventItems(results)
      })

      pushToCloud().catch((err) => console.error("Post-accumulation sync failed:", err))
    })
  }, [syncDone])

  if (!syncDone) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(var(--background))",
          color: "hsl(var(--muted-foreground))",
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          letterSpacing: "1px",
        }}
      >
        SYNCING...
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/pulls" element={<Pulls />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <IncomeToast items={incomeItems} />
      <CombatRewardToast items={combatItems} />
      <EventRewardToast items={eventItems} />
    </>
  )
}

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(var(--background))",
        }}
      />
    )
  }

  if (!user) {
    return <Login />
  }

  return <AppContent />
}

export default App
