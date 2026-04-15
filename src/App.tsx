import { useEffect, useRef, useState } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "@/components/layout/app-layout"
import { Dashboard } from "@/pages/Dashboard"
import { Timeline } from "@/pages/Timeline"
import { Pulls } from "@/pages/Pulls"
import { Resources } from "@/pages/Resources"
import { accumulateDailyIncome, type IncomeAccumulation } from "@/lib/daily-income"
import { IncomeToast } from "@/components/ui/income-toast"

function App() {
  const accumulated = useRef(false)
  const [incomeItems, setIncomeItems] = useState<IncomeAccumulation[]>([])

  useEffect(() => {
    if (accumulated.current) return
    accumulated.current = true
    accumulateDailyIncome().then((results) => {
      if (results.length > 0) setIncomeItems(results)
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
    </>
  )
}

export default App
