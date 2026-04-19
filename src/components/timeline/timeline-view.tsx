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
import { computeCharacterProbability, computeCombinedProbability, computeSparkProbability, type ProbabilityResult } from "@/lib/probability"
import { projectIncomeUntil } from "@/lib/daily-income"
import { COMBAT_MODES, getCombatModeResets, type CombatMode, type CombatIcon } from "@/data/combat-modes"
import { getCombatNodesVisible, getWeeklyNodesVisible, getGameVisibility } from "@/components/layout/sidebar"
import { UMA_SCENARIOS } from "@/data/uma-scenarios"
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

interface CombatResetNode {
  mode: CombatMode
  date: Date
}

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
  isCreateMode?: boolean
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
  bannerLane?: TimelineEntry["bannerLane"]
  rateUpPercent?: number
  dupeCount?: number
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
  // For games without patch cycles, show the date instead of internal version key
  if (!GAMES[node.gameId].hasPatchCycle) {
    return formatDate(node.date)
  }
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

/** Renders a unique SVG icon for each combat mode type */
function CombatModeIcon({ icon, size: s, color, colorDim }: { icon: CombatIcon; size: number; color: string; colorDim: string }) {
  const sw = 1.5
  switch (icon) {
    case "gate": // Spiral Abyss - arched gate
      return (
        <g>
          <path d={`M${-s*0.6},${s*0.5} V${-s*0.2} A${s*0.6},${s*0.7} 0 0,1 ${s*0.6},${-s*0.2} V${s*0.5}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <line x1={0} y1={-s*0.5} x2={0} y2={-s*0.9} stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </g>
      )
    case "theatre": // Imaginarium Theatre - comedy/tragedy masks simplified as curtains
      return (
        <g>
          <path d={`M${-s*0.7},${-s*0.6} L0,${-s*0.9} L${s*0.7},${-s*0.6}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d={`M${-s*0.6},${-s*0.5} Q${-s*0.3},${s*0.4} 0,${s*0.5}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d={`M${s*0.6},${-s*0.5} Q${s*0.3},${s*0.4} 0,${s*0.5}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </g>
      )
    case "flower": // Stygian Onslaught - simple flower
      return (
        <g>
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse key={angle} cx={0} cy={-s*0.45} rx={s*0.22} ry={s*0.4}
              fill="none" stroke={color} strokeWidth={sw-0.3}
              transform={`rotate(${angle})`} />
          ))}
          <circle cx={0} cy={0} r={s*0.18} fill={color} />
        </g>
      )
    case "crystal": // Memory of Chaos - diamond/crystal
      return (
        <path d={`M0,${-s*0.8} L${s*0.5},0 L0,${s*0.8} L${-s*0.5},0 Z`}
          fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      )
    case "dove": // Pure Fiction - paper dove / origami bird
      return (
        <g>
          <path d={`M${-s*0.7},${s*0.1} L0,${-s*0.6} L${s*0.7},${s*0.1}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M0,${-s*0.6} L0,${s*0.5} L${s*0.4},${s*0.2}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M0,${s*0.5} L${-s*0.4},${s*0.2}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    case "hourglass": // Apocalyptic Shadow
      return (
        <g>
          <line x1={-s*0.45} y1={-s*0.7} x2={s*0.45} y2={-s*0.7} stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <line x1={-s*0.45} y1={s*0.7} x2={s*0.45} y2={s*0.7} stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d={`M${-s*0.35},${-s*0.7} L0,0 L${-s*0.35},${s*0.7}`}
            fill="none" stroke={color} strokeWidth={sw-0.2} strokeLinejoin="round" />
          <path d={`M${s*0.35},${-s*0.7} L0,0 L${s*0.35},${s*0.7}`}
            fill="none" stroke={color} strokeWidth={sw-0.2} strokeLinejoin="round" />
        </g>
      )
    case "shield": // Shiyu Defense
      return (
        <path d={`M0,${-s*0.8} L${s*0.6},${-s*0.4} L${s*0.6},${s*0.2} Q${s*0.5},${s*0.7} 0,${s*0.8} Q${-s*0.5},${s*0.7} ${-s*0.6},${s*0.2} L${-s*0.6},${-s*0.4} Z`}
          fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      )
    case "cobra": // Deadly Assault - snake face with hood
      return (
        <g>
          {/* Hood flare */}
          <path d={`M0,${-s*0.9} Q${-s*0.8},${-s*0.2} ${-s*0.5},${s*0.4} Q${-s*0.2},${s*0.6} 0,${s*0.3}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d={`M0,${-s*0.9} Q${s*0.8},${-s*0.2} ${s*0.5},${s*0.4} Q${s*0.2},${s*0.6} 0,${s*0.3}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          {/* Eyes */}
          <circle cx={-s*0.2} cy={-s*0.15} r={s*0.1} fill={color} />
          <circle cx={s*0.2} cy={-s*0.15} r={s*0.1} fill={color} />
          {/* Forked tongue */}
          <line x1={0} y1={s*0.3} x2={0} y2={s*0.65} stroke={color} strokeWidth={sw*0.7} strokeLinecap="round" />
          <line x1={0} y1={s*0.65} x2={-s*0.15} y2={s*0.8} stroke={color} strokeWidth={sw*0.7} strokeLinecap="round" />
          <line x1={0} y1={s*0.65} x2={s*0.15} y2={s*0.8} stroke={color} strokeWidth={sw*0.7} strokeLinecap="round" />
        </g>
      )
    case "tower": // Tower of Adversity
      return (
        <g>
          <rect x={-s*0.25} y={-s*0.3} width={s*0.5} height={s*0.9}
            fill="none" stroke={color} strokeWidth={sw} rx={1} />
          <line x1={-s*0.45} y1={-s*0.3} x2={s*0.45} y2={-s*0.3} stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <path d={`M${-s*0.35},${-s*0.3} L0,${-s*0.8} L${s*0.35},${-s*0.3}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </g>
      )
    case "ship": // Whimpering Wastes - simple sailboat
      return (
        <g>
          <path d={`M${-s*0.6},${s*0.4} Q0,${s*0.1} ${s*0.6},${s*0.4}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <line x1={0} y1={s*0.3} x2={0} y2={-s*0.5} stroke={colorDim} strokeWidth={sw} strokeLinecap="round" />
          <path d={`M0,${-s*0.5} L${s*0.4},${s*0.1} L0,${s*0.1}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </g>
      )
    case "coin": // Currency Wars (HSR weekly) - simple coin
      return (
        <g>
          <circle cx={0} cy={0} r={s*0.55} fill="none" stroke={color} strokeWidth={sw} />
          <text x={0} y={s*0.2} textAnchor="middle" fontSize={s*0.7} fontWeight="700" fill={color}
            style={{ userSelect: "none" }}>$</text>
        </g>
      )
    case "void": // Lost Void (ZZZ weekly) - portal/void circle
      return (
        <g>
          <circle cx={0} cy={0} r={s*0.55} fill="none" stroke={color} strokeWidth={sw} />
          <circle cx={0} cy={0} r={s*0.25} fill={color} opacity={0.4} />
        </g>
      )
    case "gateway": // Thousand Gateways (WuWa weekly) - simple gate
      return (
        <g>
          <path d={`M${-s*0.4},${s*0.5} V${-s*0.1} A${s*0.4},${s*0.5} 0 0,1 ${s*0.4},${-s*0.1} V${s*0.5}`}
            fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </g>
      )
    default:
      return <circle cx={0} cy={0} r={s*0.4} fill="none" stroke={color} strokeWidth={sw} />
  }
}

/** Pointy-top hexagon points string for SVG polygon */
function hexPoints(cx: number, cy: number, r: number): string {
  return [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const angle = (Math.PI / 180) * (60 * i - 90)
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
    })
    .join(" ")
}

/** CSS clip-path for pointy-top hexagon (percentage-based) */
const HEX_CLIP = "polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)"

/** CSS clip-path for diamond (rotated square) */
const DIAMOND_CLIP = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"

/** SVG points for a diamond shape (rotated square) */
function diamondPoints(cx: number, cy: number, r: number): string {
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`
}

/** Determine if a node should render as hexagon (limited 5-star Phase 1 and Phase 2) */
function isHexNode(node: TimelineNode, entryMap: EntryMap): boolean {
  if (node.phase !== 1 && node.phase !== 2) return false
  // Uma support cards use diamond, not hex
  if (node.bannerLane === "support") return false
  const saved = entryMap.get(entryKey(node.gameId, node.version, node.phase))
  const tier = saved?.valueTier ?? "limited"
  return tier === "limited"
}

/** Determine if a node should render as diamond (Uma support cards) */
function isDiamondNode(node: TimelineNode): boolean {
  return node.bannerLane === "support"
}

const MONO = "'JetBrains Mono', 'Fira Code', monospace"

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
  const useHex = isHexNode(node, entryMap)
  const useDiamond = isDiamondNode(node)

  // Apply saved data overrides
  const saved = entryMap.get(entryKey(node.gameId, node.version, node.phase))
  const displayName = saved?.characterName ?? node.characterName
  const portraitUrl = saved?.portraitUrl ?? null
  const isSpec = saved?.isSpeculation ?? node.isSpeculation
  const isPriority = saved?.isPriority ?? false
  const pullStatus = saved?.pullStatus ?? "none"
  const hasPortrait = !!portraitUrl && !isLivestream

  const specOpacity = (isSpec && !isLivestream) ? 0.45 : 1
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

  // Shape elements (hex vs diamond vs circle)
  const ShapeOutline = useHex ? (
    <polygon
      points={hexPoints(x, y, baseHalf)}
      fill={hasPortrait ? "transparent" : accentFill}
      stroke={strokeColor}
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
  ) : useDiamond ? (
    <polygon
      points={diamondPoints(x, y, baseHalf)}
      fill={hasPortrait ? "transparent" : accentFill}
      stroke={strokeColor}
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
  ) : (
    <circle
      cx={x}
      cy={y}
      r={baseHalf}
      fill={hasPortrait ? "transparent" : accentFill}
      stroke={strokeColor}
      strokeWidth={isLivestream ? 1 : 1.5}
      strokeDasharray={strokeDash}
    />
  )

  const GlowOutline = useHex ? (
    <polygon
      points={hexPoints(x, y, baseHalf + 4)}
      fill="none"
      stroke={strokeColor}
      strokeWidth={1}
      strokeLinejoin="round"
      opacity={isHovered ? 0.35 : 0.15}
      style={{ transition: "opacity 0.15s ease-out" }}
    />
  ) : useDiamond ? (
    <polygon
      points={diamondPoints(x, y, baseHalf + 4)}
      fill="none"
      stroke={strokeColor}
      strokeWidth={1}
      strokeLinejoin="round"
      opacity={isHovered ? 0.35 : 0.15}
      style={{ transition: "opacity 0.15s ease-out" }}
    />
  ) : (
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
  )

  const PriorityRing = useHex ? (
    <polygon
      points={hexPoints(x, y, baseHalf + 6)}
      fill="none"
      stroke={accent}
      strokeWidth={2}
      strokeDasharray="8 6"
      strokeLinejoin="round"
      className="priority-ring"
      opacity={0.7}
    />
  ) : useDiamond ? (
    <polygon
      points={diamondPoints(x, y, baseHalf + 6)}
      fill="none"
      stroke={accent}
      strokeWidth={2}
      strokeDasharray="8 6"
      strokeLinejoin="round"
      className="priority-ring"
      opacity={0.7}
    />
  ) : (
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
  )

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
        {/* Glow outline behind (skip for livestream) */}
        {!isLivestream && GlowOutline}

        {/* Main shape */}
        {ShapeOutline}

        {/* Priority animated ring */}
        {isPriority && !isLivestream && PriorityRing}

        {/* Portrait via foreignObject */}
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
                  clipPath: useHex ? HEX_CLIP : useDiamond ? DIAMOND_CLIP : "circle(50%)",
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
            {/* Stroke outline over portrait */}
            {useHex ? (
              <polygon
                points={hexPoints(x, y, baseHalf)}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            ) : useDiamond ? (
              <polygon
                points={diamondPoints(x, y, baseHalf)}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            ) : (
              <circle
                cx={x}
                cy={y}
                r={baseHalf}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.5}
              />
            )}
          </>
        )}

        {/* Label inside node (hidden when portrait fills the shape) */}
        {!hasPortrait && isLivestream && (() => {
          const r1 = baseHalf * 0.35
          const r2 = baseHalf * 0.55
          const dot = baseHalf * 0.15
          const sw = 1.5
          return (
            <g transform={`translate(${x}, ${y})`}>
              <circle cx={0} cy={0} r={dot} fill={accent} />
              <path d={`M${-r1 * Math.sin(Math.PI/3)},${-r1 * Math.cos(Math.PI/3)} A${r1},${r1} 0 0,0 ${-r1 * Math.sin(Math.PI/3)},${r1 * Math.cos(Math.PI/3)}`}
                fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
              <path d={`M${r1 * Math.sin(Math.PI/3)},${-r1 * Math.cos(Math.PI/3)} A${r1},${r1} 0 0,1 ${r1 * Math.sin(Math.PI/3)},${r1 * Math.cos(Math.PI/3)}`}
                fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
              <path d={`M${-r2 * Math.sin(Math.PI/3)},${-r2 * Math.cos(Math.PI/3)} A${r2},${r2} 0 0,0 ${-r2 * Math.sin(Math.PI/3)},${r2 * Math.cos(Math.PI/3)}`}
                fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
              <path d={`M${r2 * Math.sin(Math.PI/3)},${-r2 * Math.cos(Math.PI/3)} A${r2},${r2} 0 0,1 ${r2 * Math.sin(Math.PI/3)},${r2 * Math.cos(Math.PI/3)}`}
                fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
            </g>
          )
        })()}
        {!hasPortrait && !isLivestream && (
          <text
            x={x}
            y={y + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={node.phase === 1 ? 12 : 10}
            fontWeight={700}
            fontFamily={MONO}
            fill={accent}
          >
            {getNodeLabel(node)}
          </text>
        )}
      </g>

      {/* Labels below node */}
      {hasPortrait && node.phase === 1 && (
        <>
          <text
            x={x}
            y={y + baseHalf + 14}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fontFamily={MONO}
            fill={accent}
          >
            {GAMES[node.gameId].hasPatchCycle ? node.version : formatDate(node.date)}
          </text>
          {GAMES[node.gameId].hasPatchCycle && (
            <text
              x={x}
              y={y + baseHalf + 28}
              textAnchor="middle"
              fontSize={10}
              fontFamily={MONO}
              fill="hsl(var(--muted-foreground))"
            >
              {formatDate(node.date)}
            </text>
          )}
        </>
      )}

      {!hasPortrait && node.phase === 1 && (
        <text
          x={x}
          y={y + baseHalf + 14}
          textAnchor="middle"
          fontSize={10}
          fontFamily={MONO}
          fill="hsl(var(--muted-foreground))"
        >
          {formatDate(node.date)}
        </text>
      )}

      {node.phase === 2 && (
        <text
          x={x}
          y={y + baseHalf + 14}
          textAnchor="middle"
          fontSize={10}
          fontFamily={MONO}
          fill="hsl(var(--muted-foreground))"
        >
          {formatDate(node.date)}
        </text>
      )}

      {isLivestream && (
        <>
          <text
            x={x}
            y={y + baseHalf + 14}
            textAnchor="middle"
            fontSize={8}
            fontFamily={MONO}
            fill="hsl(var(--muted-foreground))"
          >
            {formatDate(node.date)}
          </text>
          <text
            x={x}
            y={y + baseHalf + 26}
            textAnchor="middle"
            fontSize={8}
            fontFamily={MONO}
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
          fontSize={11}
          fontWeight={600}
          fontFamily={MONO}
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
          const hasVersionLine = GAMES[node.gameId].hasPatchCycle
          const probY = node.phase === 1 && (saved?.characterName ?? node.characterName)
            ? y + baseHalf + (hasVersionLine ? 46 : 30)
            : y + baseHalf + 34
          const pullLabel = probability.pulls >= 1000
            ? `${(probability.pulls / 1000).toFixed(1)}k`
            : String(probability.pulls)
          return (
            <>
              <text
                x={x}
                y={probY}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fontFamily={MONO}
                fill={probColor}
                opacity={0.9}
              >
                {probability.percent}%
              </text>
              <text
                x={x}
                y={probY + 15}
                textAnchor="middle"
                fontSize={9}
                fontFamily={MONO}
                fill="hsl(var(--muted-foreground))"
                opacity={0.6}
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
            fontSize={11}
            fontWeight={700}
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
            fontSize={11}
            fontWeight={700}
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

  const versionLabel = game.hasPatchCycle ? node.version : (node.characterName ?? formatDate(node.date))

  if (node.phase === 1) {
    title = `${game.shortName} // ${versionLabel}`
    line1 = game.hasPatchCycle ? `PH1: ${formatFullDate(node.date)}` : formatFullDate(node.date)
    line2 = patch ? `PH2: ${formatFullDate(patch.phase2Start)}` : ""
  } else if (node.phase === 2) {
    title = `${game.shortName} // ${versionLabel} P2`
    line1 = `PH2: ${formatFullDate(node.date)}`
    line2 = patch ? `END: ${formatFullDate(patch.patchEnd)}` : ""
  } else {
    title = `${versionLabel} // PREVIEW`
    line1 = formatFullDate(node.date)
    line2 = game.shortName
  }

  const accentColor = `hsl(var(${game.accentVar}))`

  return (
    <g>
      {/* Background */}
      <rect
        x={tooltipX}
        y={tooltipY}
        width={TOOLTIP_WIDTH}
        height={TOOLTIP_HEIGHT}
        rx={3}
        fill="hsla(0, 0%, 3%, 0.95)"
        stroke={`hsla(var(${game.accentVar}) / 0.35)`}
        strokeWidth={1}
      />
      {/* Accent top bar */}
      <line
        x1={tooltipX + 1}
        y1={tooltipY + 1}
        x2={tooltipX + TOOLTIP_WIDTH - 1}
        y2={tooltipY + 1}
        stroke={accentColor}
        strokeWidth={2}
        opacity={0.6}
      />
      {/* Arrow */}
      <polygon
        points={`${x - 5},${tooltipY + TOOLTIP_HEIGHT} ${x + 5},${tooltipY + TOOLTIP_HEIGHT} ${x},${tooltipY + TOOLTIP_HEIGHT + 5}`}
        fill="hsla(0, 0%, 3%, 0.95)"
      />
      <text
        x={tooltipX + 12}
        y={tooltipY + 22}
        fontSize={10}
        fontWeight={700}
        fontFamily="'JetBrains Mono', 'Fira Code', monospace"
        fill={accentColor}
        letterSpacing="0.5px"
      >
        {title}
      </text>
      <text
        x={tooltipX + 12}
        y={tooltipY + 42}
        fontSize={10}
        fontFamily="'JetBrains Mono', 'Fira Code', monospace"
        fill="hsl(var(--foreground))"
      >
        {line1}
      </text>
      {line2 && (
        <text
          x={tooltipX + 12}
          y={tooltipY + 58}
          fontSize={10}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fill="hsl(var(--muted-foreground))"
        >
          {line2}
        </text>
      )}
      {node.isSpeculation && node.phase !== "livestream" && (
        <text
          x={tooltipX + 12}
          y={tooltipY + 76}
          fontSize={7}
          fontWeight={700}
          fontFamily="'JetBrains Mono', 'Fira Code', monospace"
          fill="hsl(0 70% 55%)"
          letterSpacing="1px"
        >
          ESTIMATED
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
  const [umaEntries, setUmaEntries] = useState<TimelineEntry[]>([])
  const [dataVersion, setDataVersion] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [resourceMap, setResourceMap] = useState<Map<GameId, ResourceSnapshot>>(new Map())
  const [probMap, setProbMap] = useState<Map<string, ProbabilityResult>>(new Map())
  const [showCombat, setShowCombat] = useState(getCombatNodesVisible)
  const [showWeekly, setShowWeekly] = useState(getWeeklyNodesVisible)
  const [gameVisibility, setGameVisibility] = useState(getGameVisibility)
  const dragState = useRef({ startX: 0, scrollLeft: 0, didDrag: false })

  // Listen for combat/weekly toggles from sidebar
  useEffect(() => {
    const handler = () => {
      setShowCombat(getCombatNodesVisible())
      setShowWeekly(getWeeklyNodesVisible())
    }
    window.addEventListener("combat-toggle", handler)
    return () => window.removeEventListener("combat-toggle", handler)
  }, [])

  // Listen for game visibility toggles from sidebar
  useEffect(() => {
    const handler = () => setGameVisibility(getGameVisibility())
    window.addEventListener("game-visibility", handler)
    return () => window.removeEventListener("game-visibility", handler)
  }, [])

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
      const umaRaw: TimelineEntry[] = []
      for (const e of entries) {
        map.set(entryKey(e.gameId, e.version, e.phase), {
          characterName: e.characterName,
          valueTier: e.valueTier,
          isSpeculation: e.isSpeculation,
          isPriority: e.isPriority ?? false,
          pullStatus: e.pullStatus ?? "none",
          pullingWeapon: e.pullingWeapon ?? false,
          portraitUrl: e.characterPortrait ? URL.createObjectURL(e.characterPortrait) : null,
          bannerLane: e.bannerLane,
          rateUpPercent: e.rateUpPercent,
          dupeCount: e.dupeCount,
        })
        if (e.gameId === "uma") umaRaw.push(e)
      }
      setEntryMap(map)
      setUmaEntries(umaRaw)
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
  const rangeStart = new Date(selectedYear, 0, 1)   // Jan 1
  const rangeEnd = new Date(selectedYear, 11, 31)    // Dec 31

  // Count visible game rows for height calculation
  const visibleGameIds = useMemo(() => {
    return GAME_IDS.filter((gid) => gameVisibility[gid])
  }, [gameVisibility])

  const effectiveRowCount = useMemo(() => {
    return visibleGameIds.length
  }, [visibleGameIds])

  const rowHeight = useMemo(() => {
    if (containerHeight <= 0 || effectiveRowCount <= 0) return MIN_ROW_HEIGHT
    const available = containerHeight - HEADER_HEIGHT - PADDING_BOTTOM
    const computed = Math.floor(available / effectiveRowCount)
    return Math.max(computed, MIN_ROW_HEIGHT)
  }, [containerHeight, effectiveRowCount])

  /** Get the Y offset of a game row's top edge (hidden games = 0 height) */
  const getRowTop = useCallback((gameId: GameId) => {
    let offset = HEADER_HEIGHT
    for (const gid of GAME_IDS) {
      if (gid === gameId) return offset
      if (gameVisibility[gid]) offset += rowHeight
    }
    return offset
  }, [rowHeight, gameVisibility])

  /** Get the total height of a game row (0 if hidden) */
  const getRowHeight = useCallback((gameId: GameId) => {
    return gameVisibility[gameId] ? rowHeight : 0
  }, [rowHeight, gameVisibility])

  const { months, allNodes, allPatches, combatResets, patchStartMap, totalWidth, totalHeight } = useMemo(() => {
    const months = getMonthsBetween(rangeStart, rangeEnd)
    const totalWidth = months.length * monthWidth + PADDING_LEFT + PADDING_RIGHT
    const totalHeight = HEADER_HEIGHT + effectiveRowCount * rowHeight + PADDING_BOTTOM

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

    // Generate Uma nodes from DB entries (no patch cycle)
    for (const entry of umaEntries) {
      const startDate = new Date(entry.startDate)
      if (startDate < rangeStart || startDate > rangeEnd) continue
      allNodes.push({
        gameId: "uma",
        version: entry.version,
        phase: entry.phase,
        date: startDate,
        label: entry.characterName ?? entry.version,
        characterName: entry.characterName,
        isSpeculation: entry.isSpeculation,
        bannerLane: entry.bannerLane,
      })
    }

    // Build patch start dates map for patchRelative combat modes
    const patchStartMap = new Map<string, Date>()
    for (const p of allPatches) {
      patchStartMap.set(`${p.gameId}:${p.version}`, p.phase1Start)
    }

    // Generate combat mode reset nodes
    const combatResets: CombatResetNode[] = []
    for (const mode of COMBAT_MODES) {
      // For patchRelative, filter patch starts to matching game
      const gamePatchStarts = new Map<string, Date>()
      for (const [key, date] of patchStartMap) {
        if (key.startsWith(mode.gameId + ":")) gamePatchStarts.set(key, date)
      }

      const dates = getCombatModeResets(mode, rangeStart, rangeEnd, gamePatchStarts)
      for (const date of dates) {
        combatResets.push({ mode, date })
      }
    }

    return { months, allNodes, allPatches, combatResets, patchStartMap, totalWidth, totalHeight }
  }, [rowHeight, monthWidth, umaEntries, effectiveRowCount, selectedYear])

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
      const projected = res
        ? projectIncomeUntil(node.gameId, res, node.date, patchStartMap)
        : { currency: 0, pullItems: 0, weaponPullItems: 0 }

      // Currency pool (shared between banners): free currency + paid currency + projected income
      const paidCurrency = res?.paidCurrency ?? 0
      const totalCurrency = (res?.currency ?? 0) + paidCurrency + projected.currency
      const currencyPulls = Math.floor(totalCurrency / config.currencyPerPull)

      let result: ProbabilityResult

      // Uma: spark-based probability (no pity system)
      if (node.gameId === "uma") {
        const bannerLane = entry.bannerLane
        const tickets = bannerLane === "support"
          ? (res?.secondaryPullItems ?? 0)
          : (res?.pullItems ?? 0)
        const totalPulls = tickets + currencyPulls
        const currentSpark = bannerLane === "support"
          ? (res?.supportSparkCount ?? 0)
          : (res?.charSparkCount ?? 0)
        const rateUpShare = entry.rateUpPercent ? entry.rateUpPercent / 100 : 0.5
        const copiesNeeded = bannerLane === "support" ? (entry.dupeCount ?? 0) + 1 : 1

        if (totalPulls <= 0) continue

        result = computeSparkProbability(
          totalPulls, config.baseRate5Star, rateUpShare,
          config.sparkThreshold, currentSpark, copiesNeeded
        )
      } else {
        // Pity-based games (Genshin, HSR, ZZZ, WuWa)
        const charPullItems = (res?.pullItems ?? 0) + projected.pullItems
        const totalCharPulls = charPullItems + currencyPulls
        const currentPity = res?.currentPity ?? 0
        const isGuaranteed = res?.isGuaranteed ?? false

        if (totalCharPulls <= 0 && currentPity <= 0) continue

        if (entry.pullingWeapon) {
          const weaponPity = res?.weaponCurrentPity ?? 0
          const weaponGuaranteed = res?.weaponIsGuaranteed ?? false
          const weaponFP = res?.weaponFatePoints ?? 0
          const weaponPullItemCount = config.weaponPullItem
            ? (res?.weaponPullItems ?? 0) + projected.weaponPullItems
            : charPullItems
          const totalWeaponPulls = weaponPullItemCount + currencyPulls
          result = computeCombinedProbability(
            node.gameId,
            currentPity, totalCharPulls, isGuaranteed,
            weaponPity, totalWeaponPulls, weaponGuaranteed, weaponFP
          )
        } else {
          result = computeCharacterProbability(node.gameId, currentPity, totalCharPulls, isGuaranteed)
        }
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

  // Scroll to today (if current year) or start of year on mount / year change
  useEffect(() => {
    if (scrollRef.current && containerHeight > 0) {
      const containerWidth = scrollRef.current.clientWidth
      if (selectedYear === now.getFullYear()) {
        const todayX = dateToX(now, rangeStart, monthWidth)
        scrollRef.current.scrollLeft = todayX - containerWidth / 3
      } else {
        scrollRef.current.scrollLeft = 0
      }
    }
  }, [containerHeight, selectedYear])

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
          pullingWeapon: false,
        })
      }
      setDataVersion((v) => v + 1)
    },
    []
  )

  return (
    <div className="relative h-full">
      {/* Scanline overlay */}
      <div className="tactical-scanline" />

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden h-full"
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
            {/* Defs: grid pattern, glow filters */}
            <defs>
              <pattern id="tac-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <line x1="48" y1="0" x2="48" y2="48" stroke="hsla(0,0%,100%,0.025)" strokeWidth="0.5" />
                <line x1="0" y1="48" x2="48" y2="48" stroke="hsla(0,0%,100%,0.025)" strokeWidth="0.5" />
              </pattern>
              <pattern id="tac-grid-fine" width="12" height="12" patternUnits="userSpaceOnUse">
                <line x1="12" y1="0" x2="12" y2="12" stroke="hsla(0,0%,100%,0.012)" strokeWidth="0.5" />
                <line x1="0" y1="12" x2="12" y2="12" stroke="hsla(0,0%,100%,0.012)" strokeWidth="0.5" />
              </pattern>
              <filter id="today-glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid background */}
            <rect width={totalWidth} height={totalHeight} fill="url(#tac-grid-fine)" />
            <rect width={totalWidth} height={totalHeight} fill="url(#tac-grid)" />

            {/* Header baseline */}
            <line
              x1={0}
              y1={HEADER_HEIGHT}
              x2={totalWidth}
              y2={HEADER_HEIGHT}
              stroke="hsla(0,0%,100%,0.08)"
              strokeWidth={1}
            />

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
                  {/* Month divider line */}
                  <line
                    x1={x}
                    y1={HEADER_HEIGHT}
                    x2={x}
                    y2={totalHeight}
                    stroke="hsla(0, 0%, 100%, 0.04)"
                    strokeWidth={1}
                  />
                  {/* Tick mark at top */}
                  <line
                    x1={x}
                    y1={HEADER_HEIGHT - 6}
                    x2={x}
                    y2={HEADER_HEIGHT}
                    stroke="hsla(0,0%,100%,0.15)"
                    strokeWidth={1}
                  />
                  {/* Month label */}
                  <text
                    x={x + 8}
                    y={HEADER_HEIGHT - 14}
                    fontSize={10}
                    fontWeight={isCurrentMonth ? 700 : 500}
                    fontFamily="'JetBrains Mono', 'Fira Code', monospace"
                    fill={
                      isCurrentMonth
                        ? "hsl(var(--foreground))"
                        : "hsla(0,0%,100%,0.35)"
                    }
                    letterSpacing="1.2px"
                  >
                    {label}
                  </text>
                </g>
              )
            })}

            {/* Patch duration bands (operational windows) */}
            {GAME_IDS.map((gameId) => {
              if (!gameVisibility[gameId]) return null
              const rowTop = getRowTop(gameId)
              const thisRowHeight = getRowHeight(gameId)
              const game = GAMES[gameId]
              const gamePatches = allPatches.filter(p => p.gameId === gameId)

              return gamePatches.map((patch, pi) => {
                const x1 = dateToX(patch.phase1Start, rangeStart, monthWidth)
                const x2 = dateToX(patch.patchEnd, rangeStart, monthWidth)
                const bandWidth = x2 - x1
                if (bandWidth <= 0) return null
                const isPast = patch.patchEnd < now

                return (
                  <g key={`band-${gameId}-${pi}`}>
                    {/* Patch background band */}
                    <rect
                      x={x1}
                      y={rowTop + 2}
                      width={bandWidth}
                      height={thisRowHeight - 4}
                      rx={2}
                      fill={`hsla(var(${game.accentVar}) / ${isPast ? 0.008 : 0.018})`}
                    />
                    {/* Progress fill for current/past patches */}
                    {(() => {
                      const isCurrent = patch.phase1Start <= now && patch.patchEnd > now
                      if (!isPast && !isCurrent) return null
                      const fillWidth = isPast ? bandWidth : Math.max(0, dateToX(now, rangeStart, monthWidth) - x1)
                      if (fillWidth <= 0) return null
                      return (
                        <rect
                          x={x1}
                          y={rowTop + 2}
                          width={Math.min(fillWidth, bandWidth)}
                          height={thisRowHeight - 4}
                          rx={2}
                          fill={`hsla(var(${game.accentVar}) / ${isPast ? 0.012 : 0.035})`}
                        />
                      )
                    })()}
                    {/* Left edge marker */}
                    <line
                      x1={x1}
                      y1={rowTop + 6}
                      x2={x1}
                      y2={rowTop + thisRowHeight - 6}
                      stroke={`hsla(var(${game.accentVar}) / ${isPast ? 0.04 : 0.08})`}
                      strokeWidth={1}
                    />
                  </g>
                )
              })
            })}

            {/* Uma scenario bands */}
            {gameVisibility["uma"] && (() => {
              const umaRowTop = getRowTop("uma")
              const umaRowHeight = getRowHeight("uma")
              const umaGame = GAMES["uma"]
              return UMA_SCENARIOS.map((scenario, si) => {
                const x1 = dateToX(scenario.start, rangeStart, monthWidth)
                const x2 = dateToX(scenario.end, rangeStart, monthWidth)
                const bandWidth = x2 - x1
                if (bandWidth <= 0) return null
                const isPast = scenario.end < now
                const isCurrent = scenario.start <= now && scenario.end > now

                return (
                  <g key={`uma-scenario-${si}`}>
                    {/* Scenario background band */}
                    <rect
                      x={x1}
                      y={umaRowTop + 2}
                      width={bandWidth}
                      height={umaRowHeight - 4}
                      rx={2}
                      fill={`hsla(var(${umaGame.accentVar}) / ${isPast ? 0.008 : 0.018})`}
                    />
                    {/* Progress fill */}
                    {(isPast || isCurrent) && (() => {
                      const fillWidth = isPast ? bandWidth : Math.max(0, dateToX(now, rangeStart, monthWidth) - x1)
                      if (fillWidth <= 0) return null
                      return (
                        <rect
                          x={x1}
                          y={umaRowTop + 2}
                          width={Math.min(fillWidth, bandWidth)}
                          height={umaRowHeight - 4}
                          rx={2}
                          fill={`hsla(var(${umaGame.accentVar}) / ${isPast ? 0.012 : 0.035})`}
                        />
                      )
                    })()}
                    {/* Left edge marker */}
                    <line
                      x1={x1}
                      y1={umaRowTop + 6}
                      x2={x1}
                      y2={umaRowTop + umaRowHeight - 6}
                      stroke={`hsla(var(${umaGame.accentVar}) / ${isPast ? 0.04 : 0.08})`}
                      strokeWidth={1}
                    />
                    {/* Scenario name label at top-right of band */}
                    <text
                      x={x1 + 6}
                      y={umaRowTop + 14}
                      fontSize={7}
                      fontWeight={700}
                      fontFamily={MONO}
                      fill={`hsla(var(${umaGame.accentVar}) / ${isPast ? 0.15 : 0.3})`}
                      letterSpacing="0.8px"
                    >
                      {scenario.shortName}
                    </text>
                  </g>
                )
              })
            })()}

            {/* Game rows */}
            {GAME_IDS.map((gameId) => {
              if (!gameVisibility[gameId]) return null
              const rowTop = getRowTop(gameId)
              const thisRowHeight = getRowHeight(gameId)
              const y = rowTop + thisRowHeight * 0.4
              const game = GAMES[gameId]

              return (
                <g key={gameId}>
                  {/* Row separator */}
                  <line
                    x1={0}
                    y1={rowTop + thisRowHeight}
                    x2={totalWidth}
                    y2={rowTop + thisRowHeight}
                    stroke="hsla(0,0%,100%,0.03)"
                    strokeWidth={1}
                  />
                  {/* Center guide line */}
                  <line
                    x1={PADDING_LEFT}
                    y1={y}
                    x2={totalWidth - PADDING_RIGHT}
                    y2={y}
                    stroke={`hsla(var(${game.accentVar}) / 0.06)`}
                    strokeWidth={1}
                    strokeDasharray="2 6"
                  />
                  {/* Game label - tactical style */}
                  <g>
                    <rect
                      x={2}
                      y={rowTop + 4}
                      width={34}
                      height={16}
                      rx={2}
                      fill={`hsla(var(${game.accentVar}) / 0.1)`}
                      stroke={`hsla(var(${game.accentVar}) / 0.2)`}
                      strokeWidth={0.5}
                    />
                    <text
                      x={19}
                      y={rowTop + 15}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={700}
                      fontFamily="'JetBrains Mono', 'Fira Code', monospace"
                      fill={`hsl(var(${game.accentVar}))`}
                      letterSpacing="0.8px"
                    >
                      {game.shortName}
                    </text>
                  </g>
                  {/* Add banner button for games without patch cycle */}
                  {!game.hasPatchCycle && (
                    <g
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditorTarget({
                          gameId,
                          version: "__create__",
                          phase: 1,
                          date: new Date(),
                          isCreateMode: true,
                        })
                      }}
                    >
                      <rect
                        x={2}
                        y={rowTop + 24}
                        width={34}
                        height={16}
                        rx={2}
                        fill={`hsla(var(${game.accentVar}) / 0.06)`}
                        stroke={`hsla(var(${game.accentVar}) / 0.15)`}
                        strokeWidth={0.5}
                      />
                      <text
                        x={19}
                        y={rowTop + 35}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fontFamily={MONO}
                        fill={`hsla(var(${game.accentVar}) / 0.5)`}
                      >
                        +
                      </text>
                    </g>
                  )}
                  {/* Connection lines between Phase 1 and Phase 2 */}
                  {allPatches
                    .filter(p => p.gameId === gameId)
                    .map((patch, pi) => {
                      const p1x = dateToX(patch.phase1Start, rangeStart, monthWidth)
                      const p2x = dateToX(patch.phase2Start, rangeStart, monthWidth)
                      if (p1x < PADDING_LEFT - 100 && p2x < PADDING_LEFT - 100) return null
                      const isPast = patch.patchEnd < now
                      return (
                        <line
                          key={`conn-${gameId}-${pi}`}
                          x1={p1x}
                          y1={y}
                          x2={p2x}
                          y2={y}
                          stroke={`hsla(var(${game.accentVar}) / ${isPast ? 0.06 : 0.12})`}
                          strokeWidth={1}
                          strokeDasharray="4 4"
                        />
                      )
                    })}

                  {/* Combat mode reset nodes */}
                  {combatResets
                    .filter((cr) => {
                      if (cr.mode.gameId !== gameId) return false
                      const isWeekly = cr.mode.isMinor ?? false
                      if (isWeekly) return showWeekly
                      return showCombat
                    })
                    .map((cr, ci) => {
                      const cx = dateToX(cr.date, rangeStart, monthWidth)
                      const cy = rowTop + thisRowHeight * 0.82
                      const isPast = cr.date <= now
                      const minor = cr.mode.isMinor ?? false
                      const s = minor ? 8 : 12
                      const color = isPast ? "hsl(0, 40%, 45%)" : "hsl(0, 65%, 55%)"
                      const colorDim = isPast ? "hsl(0, 30%, 40%)" : "hsl(0, 50%, 45%)"
                      return (
                        <g
                          key={`combat-${cr.mode.id}-${ci}`}
                          opacity={isPast ? (minor ? 0.25 : 0.35) : (minor ? 0.6 : 0.85)}
                          style={{ cursor: "default" }}
                        >
                          <g transform={`translate(${cx}, ${cy})`}>
                            <CombatModeIcon icon={cr.mode.icon} size={s} color={color} colorDim={colorDim} />
                          </g>
                          {/* Reward label */}
                          <text
                            x={cx}
                            y={cy + s + (minor ? 6 : 8)}
                            textAnchor="middle"
                            fontSize={minor ? 6 : 7}
                            fontFamily={MONO}
                            fill={isPast ? "hsl(0, 30%, 40%)" : "hsl(0, 50%, 60%)"}
                            fontWeight={600}
                          >
                            +{cr.mode.reward}
                          </text>
                        </g>
                      )
                    })}

                  {allNodes
                    .filter((n) => n.gameId === gameId && n.date >= rangeStart)
                    .map((node, nodeIndex) => {
                      const nx = dateToX(node.date, rangeStart, monthWidth)
                      // Support cards offset slightly below center to avoid overlap with trainee nodes
                      let nodeY = y
                      if (node.bannerLane === "support") {
                        nodeY = rowTop + thisRowHeight * 0.65
                      }
                      return (
                        <TimelineNodeDot
                          key={`${node.version}-${node.phase}-${nodeIndex}-${node.bannerLane ?? ""}`}
                          node={node}
                          x={nx}
                          y={nodeY}
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

            {/* Today marker - red line (only shown for current year) */}
            {selectedYear === now.getFullYear() && (
              <>
                <line
                  x1={todayX}
                  y1={HEADER_HEIGHT}
                  x2={todayX}
                  y2={totalHeight}
                  stroke="hsla(0, 70%, 50%, 0.7)"
                  strokeWidth={1}
                />
                {/* Today label badge */}
                <rect
                  x={todayX - 22}
                  y={HEADER_HEIGHT - 16}
                  width={44}
                  height={14}
                  rx={2}
                  fill="hsla(0, 70%, 50%, 0.15)"
                  stroke="hsla(0, 70%, 50%, 0.4)"
                  strokeWidth={0.5}
                />
                <text
                  x={todayX}
                  y={HEADER_HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={700}
                  fontFamily="'JetBrains Mono', 'Fira Code', monospace"
                  fill="hsl(0, 70%, 60%)"
                  letterSpacing="1.5px"
                >
                  NOW
                </text>
                {/* Top crosshair tick */}
                <line
                  x1={todayX - 6}
                  y1={HEADER_HEIGHT}
                  x2={todayX + 6}
                  y2={HEADER_HEIGHT}
                  stroke="hsla(0, 70%, 50%, 0.7)"
                  strokeWidth={1}
                />
              </>
            )}

            {/* Tooltip (rendered last so it's on top) */}
            {tooltip && <Tooltip data={tooltip} />}
          </svg>
        )}
      </div>

      {/* Year selector - tactical panel */}
      <div
        className="tac-panel"
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
          padding: "5px 12px",
          borderRadius: 3,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}
      >
        <span style={{ opacity: 0.45, fontSize: 8, letterSpacing: "1px", textTransform: "uppercase" }}>Year</span>
        <button className="tac-btn" onClick={() => setSelectedYear((y) => y - 1)}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span style={{ minWidth: 36, textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: "0.5px" }}>{selectedYear}</span>
        <button className="tac-btn" onClick={() => setSelectedYear((y) => y + 1)}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Bottom-right toolbar - tactical */}
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
        {/* Jump to Now (current year) or jump to current year */}
        <button
          className="tac-panel"
          onClick={() => {
            if (!scrollRef.current) return
            if (selectedYear === now.getFullYear()) {
              const tx = dateToX(now, rangeStart, monthWidth)
              scrollRef.current.scrollLeft = tx - scrollRef.current.clientWidth / 3
            } else {
              setSelectedYear(now.getFullYear())
            }
          }}
          style={{
            padding: "4px 12px",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: "hsl(var(--muted-foreground))",
            cursor: "pointer",
            userSelect: "none",
            letterSpacing: "1px",
          }}
        >
          {selectedYear === now.getFullYear() ? "LOCATE" : "TODAY"}
        </button>

        {/* Zoom level */}
        {zoom !== 1 && (
          <div
            className="tac-panel"
            style={{
              padding: "4px 12px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              color: "hsl(var(--muted-foreground))",
              pointerEvents: "none",
              userSelect: "none",
              letterSpacing: "0.5px",
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
          isCreateMode={editorTarget.isCreateMode}
        />
      )}
    </div>
  )
}
