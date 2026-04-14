import { TimelineView } from "@/components/timeline/timeline-view"

export function Timeline() {
  return (
    <div className="flex flex-col h-screen" style={{ paddingLeft: 48, paddingTop: 40 }}>
      <div style={{ paddingBottom: 16 }}>
        <h1 className="text-2xl font-bold">Timeline</h1>
      </div>
      <div className="flex-1 overflow-hidden pb-4">
        <TimelineView />
      </div>
    </div>
  )
}
