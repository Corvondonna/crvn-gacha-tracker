import { useEffect, useRef, useState } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout/app-layout"
import { Dashboard } from "@/pages/Dashboard"
import { Timeline } from "@/pages/Timeline"
import { Pulls } from "@/pages/Pulls"
import { Resources } from "@/pages/Resources"
import { Login } from "@/pages/Login"
import { useAuth } from "@/lib/auth"
import { pullFromCloud, pushToCloud, cloudHasData, localHasData } from "@/lib/sync"
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
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done">("idle")

  // Sync on first load after auth
  useEffect(() => {
    if (synced.current) return
    synced.current = true

    async function syncData() {
      setSyncStatus("syncing")
      try {
        const hasCloud = await cloudHasData()
        const hasLocal = await localHasData()

        if (hasCloud && !hasLocal) {
          // Fresh browser: pull cloud data down
          await pullFromCloud()
        } else if (hasLocal && !hasCloud) {
          // First time with cloud: push local data up
          await pushToCloud()
        } else if (hasCloud && hasLocal) {
          // Both exist: cloud is source of truth, pull down
          // (local accumulations will run after and push on next sync)
          await pullFromCloud()
        }
        // If neither has data, nothing to sync
      } catch (err) {
        console.error("Sync failed:", err)
      }
      setSyncStatus("done")
    }

    syncData()
  }, [])

  // Run accumulations after sync is done
  useEffect(() => {
    if (syncStatus !== "done") return
    if (accumulated.current) return
    accumulated.current = true

    // Build patch start dates for patchRelative combat modes
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

    // One-time fix: reverse combat rewards that were incorrectly added to snapshots
    reverseCombatRewardInflation().then(() => {
      // Run all accumulations after cleanup
      accumulateDailyIncome().then((results) => {
        if (results.length > 0) setIncomeItems(results)
      })
      claimCombatRewards(patchStarts).then((results) => {
        if (results.length > 0) setCombatItems(results)
      })
      accumulateEventRewards(patchStarts).then((results) => {
        if (results.length > 0) setEventItems(results)
      })

      // Push accumulated changes back to cloud
      pushToCloud().catch((err) => console.error("Post-accumulation sync failed:", err))
    })
  }, [syncStatus])

  if (syncStatus === "syncing") {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(var(--background))",
          color: "hsl(var(--muted-foreground))",
          fontSize: 14,
        }}
      >
        Syncing data...
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
