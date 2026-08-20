import { useEffect, useRef, useState } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout/app-layout"
import { Dashboard } from "@/pages/Dashboard"
import { Timeline } from "@/pages/Timeline"
// import { Pulls } from "@/pages/Pulls" // Disabled: pull tracker deferred
import { Tasks } from "@/pages/Tasks"
import { Resources } from "@/pages/Resources"
import { Login } from "@/pages/Login"
import { useAuth } from "@/lib/auth"
import { pullFromCloud, pushToCloud, cloudHasData, localHasData, latestLocalUpdate, latestCloudUpdate, deduplicateTimeline, RESOURCES_UPDATED_EVENT } from "@/lib/sync"
import { accumulateDailyIncome, type IncomeAccumulation } from "@/lib/daily-income"
import { claimCombatRewards, type CombatRewardResult } from "@/lib/combat-rewards"
import { accumulateEventRewards, type EventRewardResult } from "@/lib/event-rewards"
import { generatePatchSeries } from "@/lib/timeline"
import { PATCH_ANCHORS, type PatchDateOverride } from "@/data/patch-anchors"
import { db } from "@/lib/db"
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
          // Freshness decides direction. If local has edits newer than the
          // cloud (e.g., a save whose push got interrupted by closing the
          // browser), push local. Otherwise pull. Never let a stale side
          // overwrite a fresh one.
          const [localTs, cloudTs] = await Promise.all([
            latestLocalUpdate(),
            latestCloudUpdate(),
          ])
          if (localTs > cloudTs) {
            console.log(`[sync] Local is newer (${localTs} > ${cloudTs}), pushing`)
            await pushToCloud()
          } else {
            console.log(`[sync] Cloud is newer or equal (${cloudTs} >= ${localTs}), pulling`)
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

    async function runAccumulations() {
      const now = new Date()
      const lookback = new Date(now.getFullYear(), now.getMonth() - 6, 1)

      // Respect user-set date overrides from timeline entries, same as
      // Dashboard and timeline-view — rewards must accrue on the dates
      // the user actually sees.
      const overrides = new Map<string, PatchDateOverride>()
      const entries = await db.timeline.toArray()
      for (const e of entries) {
        if (!e.dateOverride) continue
        const overrideKey = `${e.gameId}:${e.version}`
        const existing = overrides.get(overrideKey) ?? {}
        if (e.phase === 1) existing.phase1Start = new Date(e.dateOverride)
        if (e.phase === 2) existing.phase2Start = new Date(e.dateOverride)
        overrides.set(overrideKey, existing)
      }

      const patchStarts = new Map<string, Date>()
      for (const anchor of PATCH_ANCHORS) {
        const patches = generatePatchSeries(
          anchor.gameId, anchor.version, anchor.phase1Start, lookback, now, overrides
        )
        for (const p of patches) {
          patchStarts.set(`${p.gameId}:${p.version}`, p.phase1Start)
        }
      }

      // Sequential on purpose: all three accumulators read-modify-write the
      // same snapshot rows. Running them concurrently loses updates (last
      // writer wins from a stale read).
      const incomeResults = await accumulateDailyIncome()
      const eventResults = await accumulateEventRewards(patchStarts)
      const combatResults = await claimCombatRewards(patchStarts)

      if (incomeResults.length > 0) setIncomeItems(incomeResults)
      if (combatResults.length > 0) setCombatItems(combatResults)
      if (eventResults.length > 0) setEventItems(eventResults)

      // Tell mounted views (resource cards, dashboard, timeline) to
      // re-read Dexie now that accumulations have updated snapshots
      window.dispatchEvent(new CustomEvent(RESOURCES_UPDATED_EVENT))

      // Deduplicate before pushing to prevent stale duplicates from propagating
      await deduplicateTimeline()
      pushToCloud().catch((err) => console.error("Post-accumulation sync failed:", err))
    }

    runAccumulations().catch((err) => console.error("Accumulation failed:", err))
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
          {/* <Route path="/pulls" element={<Pulls />} /> */}
          <Route path="/tasks" element={<Tasks />} />
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
