import { useEffect, useRef, useState } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout/app-layout"
import { Dashboard } from "@/pages/Dashboard"
import { Timeline } from "@/pages/Timeline"
import { Pulls } from "@/pages/Pulls"
import { Resources } from "@/pages/Resources"
import { accumulateDailyIncome, type IncomeAccumulation } from "@/lib/daily-income"
import { claimCombatRewards, reverseCombatRewardInflation, type CombatRewardResult } from "@/lib/combat-rewards"
import { generatePatchSeries } from "@/lib/timeline"
import { PATCH_ANCHORS } from "@/data/patch-anchors"
import { IncomeToast } from "@/components/ui/income-toast"
import { CombatRewardToast } from "@/components/ui/combat-reward-toast"

function App() {
  const accumulated = useRef(false)
  const [incomeItems, setIncomeItems] = useState<IncomeAccumulation[]>([])
  const [combatItems, setCombatItems] = useState<CombatRewardResult[]>([])

  useEffect(() => {
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
      // Run both accumulations after cleanup
      accumulateDailyIncome().then((results) => {
      if (results.length > 0) setIncomeItems(results)
    })
      claimCombatRewards(patchStarts).then((results) => {
        if (results.length > 0) setCombatItems(results)
      })
    })
  }, [])

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
    </>
  )
}

export default App
