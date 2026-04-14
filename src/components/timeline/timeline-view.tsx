import { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { GAMES, GAME_IDS, type GameId } from "@/lib/games"
import {
  generatePatchSeries,
  patchesToNodes,
  getMonthsBetween,
  formatDate,
  type TimelineNode,
  type PatchDates,
} from "@/lib/timeline"
import { PATCH_ANCHORS } from "@/data/patch-anchors"
import { db, type TimelineEntry } from "@/lib/db"
import { NodeEditor } from "./node-editor"

const MONTH_WIDTH = 240
const MIN_ROW_HEIGHT = 100
const NODE_SIZE_LIMITED = 42
const NODE_SIZE_RERUN = 36
const NODE_SIZE_STANDARD = 30
const NODE_SIZE_FOURSTAR = 26
const NODE_SIZE_PHASE2 = 28
const NODE_SIZE_LIVESTREAM = 22
const HEADER_HEIGHT = 48
const PADDING_LEFT = 40
const PADDING_RIGHT = 40
const PADDING_BOTTOM = 24

const TOOLTIP_WIDTH = 180
const TOOLTIP_HEIGHT = 88
const TOOLTIP_OFFSET_Y = 12

interface TooltipData {
  node: TimelineNode
  x: number
  y: number
  patch: PatchDates | null
}

interface EditorTarget {
  gameId: GameId
  version: string
  phase: 1 | 2
  date: Date
}

/** Map from "gameId:version:phase" to saved entry data */
type EntryMap = Map<string, { characterName: string | null; valueTier: TimelineEntry["valueTier"]; isSpeculation: boolean }>

function entryKey(gameId: string, version: string, phase: number | string): string {
  return `${gameId}:${version}:${phase}`
}

function dateToX(date: Date, timelineStart: Date): number {
  const startMonth = timelineStart.getFullYear() * 12 + timelineStart.getMonth()
  const dateMonth = date.getFullYear() * 12 + date.getMonth()
  const monthIndex = dateMonth - startMonth

  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const dayFraction = (date.getDate() - 1) / daysInMonth

  return PADDING_LEFT + monthIndex * MONTH_WIDTH + dayFraction * MONTH_WIDTH
}

function getNodeSize(node: TimelineNode, entryMap: EntryMap): number {
  if (node.phase === "livestream") return NODE_SIZE_LIVESTREAM
  if (node.phase === 2) return NODE_SIZE_PHASE2

  // Phase 1: size based on value tier from saved entry
  const saved = entryMap.get(entryKey(node.gameId, node.version, node.phase))
  if (!saved) return NODE_SIZE_LIMITED // default for unsaved

  switch (saved.valueTier) {
    case "limited": return NODE_SIZE_LIMITED
    case "rerun": return NODE_SIZE_RERUN
    case "standard": return NODE_SIZE_STANDARD
    case "four-star": return NODE_SIZE_FOURSTAR
  }
}

function getNodeLabel(node: TimelineNode): string {
  if (node.phase === 1) return node.version
  if (node.phase === 2) return "P2"
  return "LS"
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function TimelineNodeDot({
  node,
  x,
  y,
  entryMap,
  onHover,
  onLeave,
  onClick,
}: {
  node: TimelineNode
  x: number
  y: number
  entryMap: EntryMap
  onHover: (x: number, y: number) => void
  onLeave: () => void
  onClick: () => void
}) {
  const game = GAMES[node.gameId]
  const size = getNodeSize(node, entryMap)
  const half = size / 2
  const isLivestream = node.phase === "livestream"

  // Apply saved data overrides
  const saved = entryMap.get(entryKey(node.gameId, node.version, node.phase))
  const displayName = saved?.characterName ?? node.characterName
  const isSpec = saved?.isSpeculation ?? node.isSpeculation

  const specOpacity = isSpec ? 0.45 : 1
  const accent = `hsl(var(${game.accentVar}))`
  const accentFill = `hsla(var(${game.accentVar}) / ${isSpec ? 0.06 : 0.15})`
  const strokeDash = isLivestream ? "3 2" : undefined

  return (
    <g
      className="cursor-pointer"
      opacity={specOpacity}
      onMouseEnter={() => onHover(x, y)}
      onMouseLeave={onLeave}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {/* Hit area */}
      <circle cx={x} cy={y} r={half + 8} fill="transparent" />

      {/* Glow circle behind (skip for livestream) */}
      {!isLivestream && (
        <circle
          cx={x}
          cy={y}
          r={half + 4}
          fill="none"
          stroke={accent}
          strokeWidth={1}
          opacity={0.2}
        />
      )}

      {/* Main circle */}
      <circle
        cx={x}
        cy={y}
        r={half}
        fill={accentFill}
        stroke={accent}
        strokeWidth={isLivestream ? 1 : 1.5}
        strokeDasharray={strokeDash}
      />

      {/* Label inside node */}
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={node.phase === 1 ? 10 : isLivestream ? 7 : 8}
        fontWeight="bold"
        fill={accent}
      >
        {getNodeLabel(node)}
      </text>

      {/* Date label below */}
      <text
        x={x}
        y={y + half + 12}
        textAnchor="middle"
        fontSize={isLivestream ? 7 : 9}
        fill="hsl(var(--muted-foreground))"
      >
        {formatDate(node.date)}
      </text>

      {/* Version label below date for livestream */}
      {isLivestream && (
        <text
          x={x}
          y={y + half + 22}
          textAnchor="middle"
          fontSize={7}
          fill={accent}
          opacity={0.6}
        >
          {node.version}
        </text>
      )}

      {/* Character name above (if set) */}
      {displayName && (
        <text
          x={x}
          y={y - half - 8}
          textAnchor="middle"
          fontSize={9}
          fill={accent}
        >
          {displayName}
        </text>
      )}
    </g>
  )
}

function Tooltip({ data }: { data: TooltipData }) {
  const { node, x, y, patch } = data
  const game = GAMES[node.gameId]
  const half = NODE_SIZE_LIMITED / 2

  const tooltipY = y - half - TOOLTIP_OFFSET_Y - TOOLTIP_HEIGHT
  const tooltipX = x - TOOLTIP_WIDTH / 2

  let title = ""
  let line1 = ""
  let line2 = ""

  if (node.phase === 1) {
    title = `${game.name} ${node.version}`
    line1 = `Phase 1: ${formatFullDate(node.date)}`
    line2 = patch ? `Phase 2: ${formatFullDate(patch.phase2Start)}` : ""
  } else if (node.phase === 2) {
    title = `${game.name} ${node.version} P2`
    line1 = `Phase 2: ${formatFullDate(node.date)}`
    line2 = patch ? `Patch ends: ${formatFullDate(patch.patchEnd)}` : ""
  } else {
    title = `${node.version} Preview Livestream`
    line1 = formatFullDate(node.date)
    line2 = game.name
  }

  return (
    <g>
      <rect
        x={tooltipX}
        y={tooltipY}
        width={TOOLTIP_WIDTH}
        height={TOOLTIP_HEIGHT}
        rx={8}
        fill="hsla(0, 0%, 8%, 0.92)"
        stroke={`hsla(var(${game.accentVar}) / 0.3)`}
        strokeWidth={1}
      />
      <polygon
        points={`${x - 6},${tooltipY + TOOLTIP_HEIGHT} ${x + 6},${tooltipY + TOOLTIP_HEIGHT} ${x},${tooltipY + TOOLTIP_HEIGHT + 6}`}
        fill="hsla(0, 0%, 8%, 0.92)"
      />
      <text
        x={tooltipX + 12}
        y={tooltipY + 22}
        fontSize={11}
        fontWeight="bold"
        fill={`hsl(var(${game.accentVar}))`}
      >
        {title}
      </text>
      <text
        x={tooltipX + 12}
        y={tooltipY + 42}
        fontSize={10}
        fill="hsl(var(--foreground))"
      >
        {line1}
      </text>
      {line2 && (
        <text
          x={tooltipX + 12}
          y={tooltipY + 58}
          fontSize={10}
          fill="hsl(var(--muted-foreground))"
        >
          {line2}
        </text>
      )}
      {node.isSpeculation && (
        <text
          x={tooltipX + 12}
          y={tooltipY + 76}
          fontSize={8}
          fontWeight="bold"
          fill="hsl(0 70% 55%)"
          letterSpacing="0.5px"
        >
          ESTIMATED DATE
        </text>
      )}
    </g>
  )
}

export function TimelineView() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(0)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)
  const [entryMap, setEntryMap] = useState<EntryMap>(new Map())
  const [dataVersion, setDataVersion] = useState(0)
  const dragState = useRef({ startX: 0, scrollLeft: 0, didDrag: false })

  const measureHeight = useCallback(() => {
    if (scrollRef.current) {
      setContainerHeight(scrollRef.current.clientHeight)
    }
  }, [])

  useEffect(() => {
    measureHeight()
    window.addEventListener("resize", measureHeight)
    return () => window.removeEventListener("resize", measureHeight)
  }, [measureHeight])

  // Load saved timeline entries from Dexie
  useEffect(() => {
    async function loadEntries() {
      const entries = await db.timeline.toArray()
      const map: EntryMap = new Map()
      for (const e of entries) {
        map.set(entryKey(e.gameId, e.version, e.phase), {
          characterName: e.characterName,
          valueTier: e.valueTier,
          isSpeculation: e.isSpeculation,
        })
      }
      setEntryMap(map)
    }
    loadEntries()
  }, [dataVersion])

  // Drag-to-scroll handlers (with click detection)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return
    setIsDragging(true)
    dragState.current.startX = e.clientX
    dragState.current.scrollLeft = scrollRef.current.scrollLeft
    dragState.current.didDrag = false
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !scrollRef.current) return
      const dx = e.clientX - dragState.current.startX
      if (Math.abs(dx) > 3) dragState.current.didDrag = true
      scrollRef.current.scrollLeft = dragState.current.scrollLeft - dx
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    const handleGlobalUp = () => setIsDragging(false)
    window.addEventListener("mouseup", handleGlobalUp)
    return () => window.removeEventListener("mouseup", handleGlobalUp)
  }, [])

  // Timeline range: 3 months back, 9 months forward
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 9, 0)

  const rowHeight = useMemo(() => {
    if (containerHeight <= 0) return MIN_ROW_HEIGHT
    const available = containerHeight - HEADER_HEIGHT - PADDING_BOTTOM
    const computed = Math.floor(available / GAME_IDS.length)
    return Math.max(computed, MIN_ROW_HEIGHT)
  }, [containerHeight])

  const { months, allNodes, allPatches, totalWidth, totalHeight } = useMemo(() => {
    const months = getMonthsBetween(rangeStart, rangeEnd)
    const totalWidth = months.length * MONTH_WIDTH + PADDING_LEFT + PADDING_RIGHT
    const totalHeight = HEADER_HEIGHT + GAME_IDS.length * rowHeight + PADDING_BOTTOM

    const allNodes: TimelineNode[] = []
    const allPatches: PatchDates[] = []

    for (const anchor of PATCH_ANCHORS) {
      const patches = generatePatchSeries(
        anchor.gameId,
        anchor.version,
        anchor.phase1Start,
        rangeStart,
        rangeEnd
      )
      allPatches.push(...patches)
      const nodes = patchesToNodes(patches)
      allNodes.push(...nodes)
    }

    return { months, allNodes, allPatches, totalWidth, totalHeight }
  }, [rowHeight])

  const findPatch = useCallback(
    (node: TimelineNode): PatchDates | null => {
      return allPatches.find((p) => p.gameId === node.gameId && p.version === node.version) ?? null
    },
    [allPatches]
  )

  useEffect(() => {
    if (scrollRef.current && containerHeight > 0) {
      const todayX = dateToX(now, rangeStart)
      const containerWidth = scrollRef.current.clientWidth
      scrollRef.current.scrollLeft = todayX - containerWidth / 3
    }
  }, [containerHeight])

  const todayX = dateToX(now, rangeStart)

  const handleNodeClick = useCallback(
    (node: TimelineNode) => {
      // Only open editor for Phase 1 and Phase 2 nodes, and only if not dragging
      if (dragState.current.didDrag) return
      if (node.phase === "livestream") return
      setTooltip(null)
      setEditorTarget({
        gameId: node.gameId,
        version: node.version,
        phase: node.phase,
        date: node.date,
      })
    },
    []
  )

  return (
    <>
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden h-full rounded-lg"
        style={{ scrollBehavior: isDragging ? "auto" : "smooth", cursor: isDragging ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {containerHeight > 0 && (
          <svg
            width={totalWidth}
            height={totalHeight}
            className="select-none"
          >
            {/* Month headers */}
            {months.map((month, i) => {
              const x = PADDING_LEFT + i * MONTH_WIDTH
              const label = month.toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              }).toUpperCase()
              const isCurrentMonth =
                month.getMonth() === now.getMonth() &&
                month.getFullYear() === now.getFullYear()

              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={HEADER_HEIGHT}
                    x2={x}
                    y2={totalHeight}
                    stroke="hsla(0, 0%, 100%, 0.04)"
                    strokeWidth={1}
                  />
                  <text
                    x={x + MONTH_WIDTH / 2}
                    y={28}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={isCurrentMonth ? "bold" : "normal"}
                    fill={
                      isCurrentMonth
                        ? "hsl(var(--foreground))"
                        : "hsl(var(--muted-foreground))"
                    }
                    letterSpacing="0.5px"
                  >
                    {label}
                  </text>
                </g>
              )
            })}

            {/* Game rows */}
            {GAME_IDS.map((gameId, rowIndex) => {
              const y = HEADER_HEIGHT + rowIndex * rowHeight + rowHeight / 2
              const game = GAMES[gameId]

              return (
                <g key={gameId}>
                  <line
                    x1={PADDING_LEFT}
                    y1={y}
                    x2={totalWidth - PADDING_RIGHT}
                    y2={y}
                    stroke={`hsla(var(${game.accentVar}) / 0.12)`}
                    strokeWidth={1}
                  />
                  <text
                    x={PADDING_LEFT + 4}
                    y={HEADER_HEIGHT + rowIndex * rowHeight + 18}
                    fontSize={9}
                    fontWeight="bold"
                    fill={`hsl(var(${game.accentVar}))`}
                    opacity={0.6}
                    letterSpacing="0.5px"
                  >
                    {game.shortName}
                  </text>

                  {allNodes
                    .filter((n) => n.gameId === gameId)
                    .map((node, nodeIndex) => {
                      const nx = dateToX(node.date, rangeStart)
                      return (
                        <TimelineNodeDot
                          key={`${node.version}-${node.phase}-${nodeIndex}`}
                          node={node}
                          x={nx}
                          y={y}
                          entryMap={entryMap}
                          onHover={(hx, hy) =>
                            setTooltip({ node, x: hx, y: hy, patch: findPatch(node) })
                          }
                          onLeave={() => setTooltip(null)}
                          onClick={() => handleNodeClick(node)}
                        />
                      )
                    })}
                </g>
              )
            })}

            {/* Today marker */}
            <line
              x1={todayX}
              y1={HEADER_HEIGHT - 5}
              x2={todayX}
              y2={totalHeight}
              stroke="hsla(0, 0%, 100%, 0.3)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={todayX}
              y={HEADER_HEIGHT - 10}
              textAnchor="middle"
              fontSize={8}
              fontWeight="bold"
              fill="hsl(var(--foreground))"
              opacity={0.6}
            >
              TODAY
            </text>

            {/* Tooltip (rendered last so it's on top) */}
            {tooltip && <Tooltip data={tooltip} />}
          </svg>
        )}
      </div>

      {/* Node editor modal */}
      {editorTarget && (
        <NodeEditor
          gameId={editorTarget.gameId}
          version={editorTarget.version}
          phase={editorTarget.phase}
          date={editorTarget.date}
          onClose={() => setEditorTarget(null)}
          onSave={() => setDataVersion((v) => v + 1)}
        />
      )}
    </>
  )
}
