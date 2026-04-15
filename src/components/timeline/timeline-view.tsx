import { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from "react"
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
import { db, type TimelineEntry, type ResourceSnapshot } from "@/lib/db"
import { seedTimeline } from "@/lib/seed-timeline"
import { computeCharacterProbability, computeCombinedProbability, type ProbabilityResult } from "@/lib/probability"
import { projectIncomeUntil } from "@/lib/daily-income"
import { NodeEditor } from "./node-editor"

const BASE_MONTH_WIDTH = 240
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.1
const MIN_ROW_HEIGHT = 100
const NODE_SIZE_LIMITED = 85
const NODE_SIZE_RERUN = 72
const NODE_SIZE_STANDARD = 60
const NODE_SIZE_FOURSTAR = 50
const NODE_SIZE_PHASE2 = 50
const NODE_SIZE_LIVESTREAM = 38
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
type EntryData = {
  characterName: string | null
  valueTier: TimelineEntry["valueTier"]
  isSpeculation: boolean
  isPriority: boolean
  pullStatus: TimelineEntry["pullStatus"]
  pullingWeapon: boolean
  portraitUrl: string | null
}
type EntryMap = Map<string, EntryData>

function entryKey(gameId: string, version: string, phase: number | string): string {
  return `${gameId}:${version}:${phase}`
}

function dateToX(date: Date, timelineStart: Date, monthWidth: number): number {
  const startMonth = timelineStart.getFullYear() * 12 + timelineStart.getMonth()
  const dateMonth = date.getFullYear() * 12 + date.getMonth()
  const monthIndex = dateMonth - startMonth

  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const dayFraction = (date.getDate() - 1) / daysInMonth

  return PADDING_LEFT + monthIndex * monthWidth + dayFraction * monthWidth
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
  probability,
  onHover,
  onLeave,
  onClick,
  onDoubleClick,
}: {
  node: TimelineNode
  x: number
  y: number
  entryMap: EntryMap
  probability?: ProbabilityResult | null
  onHover: (x: number, y: number) => void
  onLeave: () => void
  onClick: () => void
  onDoubleClick: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const game = GAMES[node.gameId]
  const baseSize = getNodeSize(node, entryMap)
  const baseHalf = baseSize / 2
  const isLivestream = node.phase === "livestream"

  // Apply saved data overrides
  const saved = entryMap.get(entryKey(node.gameId, node.version, node.phase))
  const displayName = saved?.characterName ?? node.characterName
  const portraitUrl = saved?.portraitUrl ?? null
  const isSpec = saved?.isSpeculation ?? node.isSpeculation
  const isPriority = saved?.isPriority ?? false
  const pullStatus = saved?.pullStatus ?? "none"
  const hasPortrait = !!portraitUrl && !isLivestream

  const specOpacity = isSpec ? 0.45 : 1
  const accent = `hsl(var(${game.accentVar}))`
  const strokeDash = isLivestream ? "3 2" : undefined

  // Node fill based on pull status
  let accentFill: string
  let strokeColor = accent
  if (pullStatus === "secured" && !isLivestream) {
    accentFill = "hsla(142, 70%, 50%, 0.12)"
    strokeColor = "hsl(142, 70%, 50%)"
  } else if (pullStatus === "failed" && !isLivestream) {
    accentFill = "hsla(0, 70%, 50%, 0.1)"
    strokeColor = "hsl(0, 70%, 45%)"
  } else {
    accentFill = `hsla(var(${game.accentVar}) / ${isSpec ? 0.06 : 0.15})`
  }

  return (
    <g
      className="cursor-pointer"
      opacity={specOpacity}
      onMouseEnter={() => {
        setIsHovered(true)
        onHover(x, y)
      }}
      onMouseLeave={() => {
        setIsHovered(false)
        onLeave()
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick()
      }}
    >
      {/* Hit area */}
      <circle cx={x} cy={y} r={baseHalf + 12} fill="transparent" />

      {/* All visual elements scale together from center */}
      <g
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          transform: isHovered ? "scale(1.18)" : "scale(1)",
          transition: "transform 0.15s ease-out",
          willChange: isHovered ? "transform" : undefined,
        }}
      >
        {/* Glow circle behind (skip for livestream) */}
        {!isLivestream && (
          <circle
            cx={x}
            cy={y}
            r={baseHalf + 4}
            fill="none"
            stroke={strokeColor}
            strokeWidth={1}
            opacity={isHovered ? 0.35 : 0.2}
            style={{ transition: "opacity 0.15s ease-out" }}
          />
        )}

        {/* Main circle */}
        <circle
          cx={x}
          cy={y}
          r={baseHalf}
          fill={hasPortrait ? "transparent" : accentFill}
          stroke={strokeColor}
          strokeWidth={isLivestream ? 1 : 1.5}
          strokeDasharray={strokeDash}
        />

        {/* Priority animated ring */}
        {isPriority && !isLivestream && (
          <circle
            cx={x}
            cy={y}
            r={baseHalf + 6}
            fill="none"
            stroke={accent}
            strokeWidth={2}
            strokeDasharray="8 6"
            strokeLinecap="round"
            className="priority-ring"
            opacity={0.7}
          />
        )}

        {/* Portrait via foreignObject with CSS border-radius */}
        {hasPortrait && (
          <>
            <foreignObject
              x={x - baseHalf}
              y={y - baseHalf}
              width={baseSize}
              height={baseSize}
              style={{ pointerEvents: "none" }}
            >
              <div
                style={{
                  width: baseSize,
                  height: baseSize,
                  borderRadius: "50%",
                  overflow: "hidden",
                }}
              >
                <img
                  src={portraitUrl!}
                  alt=""
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            </foreignObject>
            {/* Stroke ring over portrait */}
            <circle
              cx={x}
              cy={y}
              r={baseHalf}
              fill="none"
              stroke={strokeColor}
              strokeWidth={1.5}
            />
          </>
        )}

        {/* Label inside node (hidden when portrait fills the circle) */}
        {!hasPortrait && (
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
        )}
      </g>

      {/* Labels below node (outside scaled group so they stay readable) */}
      {/* Phase 1 with portrait: version + date */}
      {hasPortrait && node.phase === 1 && (
        <>
          <text
            x={x}
            y={y + baseHalf + 12}
            textAnchor="middle"
            fontSize={9}
            fontWeight="bold"
            fill={accent}
          >
            {node.version}
          </text>
          <text
            x={x}
            y={y + baseHalf + 23}
            textAnchor="middle"
            fontSize={8}
            fill="hsl(var(--muted-foreground))"
          >
            {formatDate(node.date)}
          </text>
        </>
      )}

      {/* Phase 1 without portrait: date */}
      {!hasPortrait && node.phase === 1 && (
        <text
          x={x}
          y={y + baseHalf + 12}
          textAnchor="middle"
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
        >
          {formatDate(node.date)}
        </text>
      )}

      {/* Phase 2: date */}
      {node.phase === 2 && (
        <text
          x={x}
          y={y + baseHalf + 12}
          textAnchor="middle"
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
        >
          {formatDate(node.date)}
        </text>
      )}

      {/* Livestream: date + version */}
      {isLivestream && (
        <>
          <text
            x={x}
            y={y + baseHalf + 12}
            textAnchor="middle"
            fontSize={7}
            fill="hsl(var(--muted-foreground))"
          >
            {formatDate(node.date)}
          </text>
          <text
            x={x}
            y={y + baseHalf + 22}
            textAnchor="middle"
            fontSize={7}
            fill={accent}
            opacity={0.6}
          >
            {node.version}
          </text>
        </>
      )}

      {/* Character name above */}
      {displayName && (
        <text
          x={x}
          y={y - baseHalf - 8}
          textAnchor="middle"
          fontSize={9}
          fill={accent}
        >
          {displayName}
        </text>
      )}

      {/* Probability badge */}
      {probability && !isLivestream && pullStatus === "none" && (
        (() => {
          const probColor =
            probability.tier === "guaranteed" ? "hsl(142, 70%, 50%)" :
            probability.tier === "high" ? "hsl(142, 50%, 45%)" :
            probability.tier === "medium" ? "hsl(45, 80%, 55%)" :
            probability.tier === "low" ? "hsl(25, 80%, 50%)" :
            "hsl(0, 60%, 50%)"
          // Position below the last text label
          const probY = node.phase === 1 && (saved?.characterName ?? node.characterName)
            ? y + baseHalf + 34
            : y + baseHalf + 23
          const pullLabel = probability.pulls >= 1000
            ? `${(probability.pulls / 1000).toFixed(1)}k`
            : String(probability.pulls)
          return (
            <>
              <text
                x={x}
                y={probY}
                textAnchor="middle"
                fontSize={8}
                fontWeight="bold"
                fill={probColor}
                opacity={0.9}
              >
                {probability.percent}%
              </text>
              <text
                x={x}
                y={probY + 10}
                textAnchor="middle"
                fontSize={7}
                fill="hsl(var(--muted-foreground))"
                opacity={0.7}
              >
                {pullLabel} pulls
              </text>
            </>
          )
        })()
      )}

      {/* Pull status badge */}
      {pullStatus === "secured" && !isLivestream && (
        <g>
          <circle
            cx={x + baseHalf * 0.65}
            cy={y + baseHalf * 0.65}
            r={8}
            fill="hsl(142, 70%, 30%)"
            stroke="hsl(142, 70%, 50%)"
            strokeWidth={1.5}
          />
          <text
            x={x + baseHalf * 0.65}
            y={y + baseHalf * 0.65 + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fontWeight="bold"
            fill="hsl(142, 70%, 70%)"
          >
            ✓
          </text>
        </g>
      )}
      {pullStatus === "failed" && !isLivestream && (
        <g>
          <circle
            cx={x + baseHalf * 0.65}
            cy={y + baseHalf * 0.65}
            r={8}
            fill="hsl(0, 70%, 25%)"
            stroke="hsl(0, 70%, 50%)"
            strokeWidth={1.5}
          />
          <text
            x={x + baseHalf * 0.65}
            y={y + baseHalf * 0.65 + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fontWeight="bold"
            fill="hsl(0, 70%, 70%)"
          >
            ✕
          </text>
        </g>
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
  const [zoom, setZoom] = useState(1)
  const [monthsBack, setMonthsBack] = useState(3)
  const [monthsForward, setMonthsForward] = useState(9)
  const [resourceMap, setResourceMap] = useState<Map<GameId, ResourceSnapshot>>(new Map())
  const [probMap, setProbMap] = useState<Map<string, ProbabilityResult>>(new Map())
  const dragState = useRef({ startX: 0, scrollLeft: 0, didDrag: false })

  const monthWidth = BASE_MONTH_WIDTH * zoom

  // Seed timeline data on first load
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    seedTimeline().then((count) => {
      if (count > 0) setDataVersion((v) => v + 1)
    })
  }, [])

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
      // Revoke old portrait URLs
      for (const entry of entryMap.values()) {
        if (entry.portraitUrl) URL.revokeObjectURL(entry.portraitUrl)
      }

      const entries = await db.timeline.toArray()
      const map: EntryMap = new Map()
      for (const e of entries) {
        map.set(entryKey(e.gameId, e.version, e.phase), {
          characterName: e.characterName,
          valueTier: e.valueTier,
          isSpeculation: e.isSpeculation,
          isPriority: e.isPriority ?? false,
          pullStatus: e.pullStatus ?? "none",
          pullingWeapon: e.pullingWeapon ?? false,
          portraitUrl: e.characterPortrait ? URL.createObjectURL(e.characterPortrait) : null,
        })
      }
      setEntryMap(map)
    }
    loadEntries()
  }, [dataVersion])

  // Load latest resource snapshot per game
  useEffect(() => {
    async function loadResources() {
      const map = new Map<GameId, ResourceSnapshot>()
      for (const gid of GAME_IDS) {
        const latest = await db.resources
          .where("gameId")
          .equals(gid)
          .sortBy("updatedAt")
          .then((arr) => arr[arr.length - 1])
        if (latest) map.set(gid, latest)
      }
      setResourceMap(map)
    }
    loadResources()
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

  // Pending scroll anchor from zoom: stores cursor position and the old zoom level
  const zoomAnchor = useRef<{ cursorSvgX: number; cursorOffsetX: number; prevZoom: number } | null>(null)

  // Zoom via scroll wheel (Ctrl+scroll or pinch)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()

      const direction = e.deltaY < 0 ? 1 : -1
      const rect = el.getBoundingClientRect()
      const cursorOffsetX = e.clientX - rect.left
      const cursorSvgX = cursorOffsetX + el.scrollLeft

      setZoom((prev) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + direction * ZOOM_STEP))
        if (next === prev) return prev
        zoomAnchor.current = { cursorSvgX, cursorOffsetX, prevZoom: prev }
        return next
      })
    }

    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [])

  // Keyboard navigation: arrows scroll, +/- zoom, Home returns to today
  useEffect(() => {
    const SCROLL_STEP = 120

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      const el = scrollRef.current
      if (!el) return

      switch (e.key) {
        case "ArrowLeft":
          el.scrollLeft -= SCROLL_STEP
          e.preventDefault()
          break
        case "ArrowRight":
          el.scrollLeft += SCROLL_STEP
          e.preventDefault()
          break
        case "+":
        case "=":
          setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP))
          break
        case "-":
        case "_":
          setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP))
          break
        case "Home": {
          const todayPos = dateToX(new Date(), rangeStart, BASE_MONTH_WIDTH * zoom)
          el.scrollLeft = todayPos - el.clientWidth / 3
          e.preventDefault()
          break
        }
        case "0":
          setZoom(1)
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [zoom])

  // Apply scroll correction synchronously after React updates the DOM
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current
    if (!anchor || !scrollRef.current) return

    const ratio = zoom / anchor.prevZoom
    const newCursorSvgX = anchor.cursorSvgX * ratio
    scrollRef.current.scrollLeft = newCursorSvgX - anchor.cursorOffsetX
    zoomAnchor.current = null
  }, [zoom])

  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + monthsForward, 0)

  const rowHeight = useMemo(() => {
    if (containerHeight <= 0) return MIN_ROW_HEIGHT
    const available = containerHeight - HEADER_HEIGHT - PADDING_BOTTOM
    const computed = Math.floor(available / GAME_IDS.length)
    return Math.max(computed, MIN_ROW_HEIGHT)
  }, [containerHeight])

  const { months, allNodes, allPatches, totalWidth, totalHeight } = useMemo(() => {
    const months = getMonthsBetween(rangeStart, rangeEnd)
    const totalWidth = months.length * monthWidth + PADDING_LEFT + PADDING_RIGHT
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
  }, [rowHeight, monthWidth])

  // Compute probability only for the next upcoming character per game
  useEffect(() => {
    const now = new Date()
    const newProbMap = new Map<string, ProbabilityResult>()
    const gameProcessed = new Set<GameId>()

    // Sort future nodes chronologically so we pick the earliest per game
    const futureNodes = allNodes
      .filter((n) => n.date > now && n.phase !== "livestream")
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    for (const node of futureNodes) {
      if (gameProcessed.has(node.gameId)) continue

      const key = entryKey(node.gameId, node.version, node.phase as 1 | 2)
      const entry = entryMap.get(key)
      if (!entry?.characterName) continue
      if (entry.pullStatus === "secured" || entry.pullStatus === "failed") continue

      // Mark this game as done so we only compute for the first upcoming
      gameProcessed.add(node.gameId)

      const res = resourceMap.get(node.gameId)
      const config = GAMES[node.gameId]

      // Project daily income from now until the banner date
      const projectedCurrency = res ? projectIncomeUntil(node.gameId, res, node.date) : 0

      // Character banner pulls (current + paid currency + projected income)
      const pullItems = res?.pullItems ?? 0
      const paidCurrency = res?.paidCurrency ?? 0
      const currency = (res?.currency ?? 0) + paidCurrency + projectedCurrency
      const totalCharPulls = pullItems + Math.floor(currency / config.currencyPerPull)
      const currentPity = res?.currentPity ?? 0
      const isGuaranteed = res?.isGuaranteed ?? false

      if (totalCharPulls <= 0 && currentPity <= 0) continue

      let result: ProbabilityResult
      if (entry.pullingWeapon) {
        const weaponPity = res?.weaponCurrentPity ?? 0
        const weaponGuaranteed = res?.weaponIsGuaranteed ?? false
        const weaponFP = res?.weaponFatePoints ?? 0
        // Currency pool is shared between banners
        const totalWeaponPulls = Math.floor(currency / config.currencyPerPull)
        result = computeCombinedProbability(
          node.gameId,
          currentPity, totalCharPulls, isGuaranteed,
          weaponPity, totalWeaponPulls, weaponGuaranteed, weaponFP
        )
      } else {
        result = computeCharacterProbability(node.gameId, currentPity, totalCharPulls, isGuaranteed)
      }
      newProbMap.set(key, result)
    }

    setProbMap(newProbMap)
  }, [allNodes, entryMap, resourceMap])

  const findPatch = useCallback(
    (node: TimelineNode): PatchDates | null => {
      return allPatches.find((p) => p.gameId === node.gameId && p.version === node.version) ?? null
    },
    [allPatches]
  )

  useEffect(() => {
    if (scrollRef.current && containerHeight > 0) {
      const todayX = dateToX(now, rangeStart, monthWidth)
      const containerWidth = scrollRef.current.clientWidth
      scrollRef.current.scrollLeft = todayX - containerWidth / 3
    }
  }, [containerHeight])

  const todayX = dateToX(now, rangeStart, monthWidth)

  // Click vs double-click: single click opens editor (delayed), double-click toggles priority
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleNodeClick = useCallback(
    (node: TimelineNode) => {
      if (dragState.current.didDrag) return
      if (node.phase === "livestream") return

      // Clear any pending single-click
      if (clickTimer.current) clearTimeout(clickTimer.current)

      // Delay single click to allow double-click detection
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        setTooltip(null)
        setEditorTarget({
          gameId: node.gameId,
          version: node.version,
          phase: node.phase as 1 | 2,
          date: node.date,
        })
      }, 250)
    },
    []
  )

  const handleNodeDoubleClick = useCallback(
    async (node: TimelineNode) => {
      if (node.phase === "livestream") return

      // Cancel pending single-click
      if (clickTimer.current) {
        clearTimeout(clickTimer.current)
        clickTimer.current = null
      }

      // Toggle priority in database
      const entry = await db.timeline
        .where({ gameId: node.gameId, version: node.version })
        .filter((e) => e.phase === node.phase)
        .first()

      if (entry?.id) {
        await db.timeline.update(entry.id, { isPriority: !entry.isPriority })
      } else {
        // Create entry with priority toggled on
        await db.timeline.add({
          gameId: node.gameId,
          version: node.version,
          phase: node.phase as 1 | 2,
          startDate: node.date.toISOString(),
          characterName: null,
          characterPortrait: null,
          valueTier: "limited",
          isSpeculation: node.isSpeculation,
          isPriority: true,
          pullStatus: "none",
        })
      }
      setDataVersion((v) => v + 1)
    },
    []
  )

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden h-full rounded-lg"
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
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
              const x = PADDING_LEFT + i * monthWidth
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
                    x={x + monthWidth / 2}
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
                    .filter((n) => n.gameId === gameId && n.date >= rangeStart)
                    .map((node, nodeIndex) => {
                      const nx = dateToX(node.date, rangeStart, monthWidth)
                      return (
                        <TimelineNodeDot
                          key={`${node.version}-${node.phase}-${nodeIndex}`}
                          node={node}
                          x={nx}
                          y={y}
                          entryMap={entryMap}
                          probability={probMap.get(entryKey(node.gameId, node.version, node.phase as 1 | 2)) ?? null}
                          onHover={(hx, hy) =>
                            setTooltip({ node, x: hx, y: hy, patch: findPatch(node) })
                          }
                          onLeave={() => setTooltip(null)}
                          onClick={() => handleNodeClick(node)}
                          onDoubleClick={() => handleNodeDoubleClick(node)}
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

      {/* Range controls */}
      <div
        style={{
          position: "absolute",
          top: 4,
          right: 8,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "hsl(var(--muted-foreground))",
          userSelect: "none",
          padding: "4px 10px",
          borderRadius: 8,
          background: "hsla(0, 0%, 5%, 0.85)",
          border: "1px solid hsla(0, 0%, 100%, 0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ opacity: 0.6 }}>Past</span>
          <button
            onClick={() => setMonthsBack((v) => Math.max(1, v - 1))}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: "1px solid hsla(0,0%,100%,0.1)",
              background: "hsla(0,0%,100%,0.04)",
              color: "hsl(var(--muted-foreground))",
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            -
          </button>
          <span style={{ minWidth: 28, textAlign: "center" }}>{monthsBack}mo</span>
          <button
            onClick={() => setMonthsBack((v) => Math.min(24, v + 1))}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: "1px solid hsla(0,0%,100%,0.1)",
              background: "hsla(0,0%,100%,0.04)",
              color: "hsl(var(--muted-foreground))",
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            +
          </button>
        </div>
        <div style={{ width: 1, height: 12, background: "hsla(0,0%,100%,0.08)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ opacity: 0.6 }}>Future</span>
          <button
            onClick={() => setMonthsForward((v) => Math.max(1, v - 1))}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: "1px solid hsla(0,0%,100%,0.1)",
              background: "hsla(0,0%,100%,0.04)",
              color: "hsl(var(--muted-foreground))",
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            -
          </button>
          <span style={{ minWidth: 28, textAlign: "center" }}>{monthsForward}mo</span>
          <button
            onClick={() => setMonthsForward((v) => Math.min(24, v + 1))}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: "1px solid hsla(0,0%,100%,0.1)",
              background: "hsla(0,0%,100%,0.04)",
              color: "hsl(var(--muted-foreground))",
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Bottom-right toolbar */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {/* Jump to Today */}
        <button
          onClick={() => {
            if (!scrollRef.current) return
            const tx = dateToX(now, rangeStart, monthWidth)
            scrollRef.current.scrollLeft = tx - scrollRef.current.clientWidth / 3
          }}
          style={{
            padding: "4px 10px",
            borderRadius: 8,
            background: "hsla(0, 0%, 8%, 0.8)",
            border: "1px solid hsla(0, 0%, 100%, 0.08)",
            fontSize: 11,
            fontWeight: 500,
            color: "hsl(var(--muted-foreground))",
            cursor: "pointer",
            userSelect: "none",
            letterSpacing: "0.3px",
          }}
        >
          Today
        </button>

        {/* Zoom level */}
        {zoom !== 1 && (
          <div
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              background: "hsla(0, 0%, 8%, 0.8)",
              border: "1px solid hsla(0, 0%, 100%, 0.08)",
              fontSize: 11,
              fontWeight: 600,
              color: "hsl(var(--muted-foreground))",
              pointerEvents: "none",
              userSelect: "none",
              letterSpacing: "0.3px",
            }}
          >
            {Math.round(zoom * 100)}%
          </div>
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
    </div>
  )
}
