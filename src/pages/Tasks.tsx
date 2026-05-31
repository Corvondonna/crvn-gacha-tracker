import { useState, useEffect, useCallback, useRef } from "react"
import { GAMES, GAME_IDS, type GameId } from "@/lib/games"
import { db, type TaskItem } from "@/lib/db"
import { pushToCloud } from "@/lib/sync"
import { getGameVisibility } from "@/components/layout/sidebar"

const MONO = "'JetBrains Mono', 'Fira Code', monospace"

/**
 * Returns the most recent reset time for a given hour.
 * If the reset hour hasn't passed today, returns yesterday's reset.
 */
function getLastReset(resetHour: number, dayOfWeek?: number): Date {
  const now = new Date()
  const reset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), resetHour, 0, 0, 0)

  if (dayOfWeek !== undefined) {
    // Weekly: find the most recent occurrence of dayOfWeek at resetHour
    const currentDay = now.getDay()
    let daysBack = (currentDay - dayOfWeek + 7) % 7
    if (daysBack === 0 && now < reset) daysBack = 7
    reset.setDate(reset.getDate() - daysBack)
    if (now < reset) reset.setDate(reset.getDate() - 7)
  } else {
    // Daily: if reset hasn't happened yet today, use yesterday
    if (now < reset) reset.setDate(reset.getDate() - 1)
  }

  return reset
}

/**
 * Returns true if a completed task should be hidden (completed before the last reset).
 * Returns false if it was completed after the last reset (still counts for this cycle).
 */
function shouldShow(task: TaskItem): boolean {
  if (!task.isCompleted || !task.completedAt) return true
  const game = GAMES[task.gameId]
  const resetHour = game.dailyResetHour
  const lastReset = task.type === "weekly"
    ? getLastReset(resetHour, 1) // Monday
    : getLastReset(resetHour)
  return new Date(task.completedAt) >= lastReset
}

/**
 * Auto-reset: if a task was completed before the last reset, uncheck it.
 */
async function autoResetTasks(): Promise<number> {
  const allTasks = await db.tasks.toArray()
  let resetCount = 0
  for (const task of allTasks) {
    if (!task.isCompleted || !task.completedAt) continue
    const game = GAMES[task.gameId]
    const resetHour = game.dailyResetHour
    const lastReset = task.type === "weekly"
      ? getLastReset(resetHour, 1)
      : getLastReset(resetHour)
    if (new Date(task.completedAt) < lastReset) {
      await db.tasks.update(task.id!, { isCompleted: false, completedAt: null })
      resetCount++
    }
  }
  return resetCount
}

function GameSection({
  gameId,
  tasks,
  onRefresh,
}: {
  gameId: GameId
  tasks: TaskItem[]
  onRefresh: () => void
}) {
  const game = GAMES[gameId]
  const accentColor = `hsl(var(${game.accentVar}))`
  const accentBg = (opacity: number) => `hsla(var(${game.accentVar}) / ${opacity})`

  const [collapsed, setCollapsed] = useState(false)
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<"daily" | "weekly">("daily")
  const [showAdd, setShowAdd] = useState(false)
  const [dragTaskId, setDragTaskId] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Filter: hide completed tasks that were completed before last reset
  const visibleTasks = tasks.filter(shouldShow).sort((a, b) => a.sortOrder - b.sortOrder)

  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return

    const maxOrder = tasks.reduce((max, t) => Math.max(max, t.sortOrder), -1)
    await db.tasks.add({
      gameId,
      name: trimmed,
      type: newType,
      isCompleted: false,
      completedAt: null,
      sortOrder: maxOrder + 1,
    })

    setNewName("")
    setShowAdd(false)
    pushToCloud().catch(console.error)
    onRefresh()
  }

  const handleToggle = async (task: TaskItem) => {
    const nowCompleted = !task.isCompleted
    await db.tasks.update(task.id!, {
      isCompleted: nowCompleted,
      completedAt: nowCompleted ? new Date().toISOString() : null,
    })
    pushToCloud().catch(console.error)
    onRefresh()
  }

  const handleDelete = async (taskId: number) => {
    await db.tasks.delete(taskId)
    pushToCloud().catch(console.error)
    onRefresh()
  }

  const handleDragStart = (e: React.DragEvent, task: TaskItem) => {
    setDragTaskId(task.id!)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (dragTaskId === null) return

    const dragIndex = visibleTasks.findIndex((t) => t.id === dragTaskId)
    if (dragIndex === -1 || dragIndex === dropIndex) {
      setDragTaskId(null)
      setDragOverIndex(null)
      return
    }

    // Reorder: remove dragged item and insert at drop position
    const reordered = [...visibleTasks]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, moved)

    // Update sort orders
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sortOrder !== i) {
        await db.tasks.update(reordered[i].id!, { sortOrder: i })
      }
    }

    setDragTaskId(null)
    setDragOverIndex(null)
    pushToCloud().catch(console.error)
    onRefresh()
  }

  const handleDragEnd = () => {
    setDragTaskId(null)
    setDragOverIndex(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd()
    if (e.key === "Escape") {
      setShowAdd(false)
      setNewName("")
    }
  }

  return (
    <div
      style={{
        background: "hsla(0, 0%, 4%, 0.6)",
        border: `1px solid ${accentBg(0.15)}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          cursor: "pointer",
          borderBottom: collapsed ? "none" : `1px solid ${accentBg(0.1)}`,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 3,
              height: 16,
              borderRadius: 2,
              background: accentColor,
              opacity: 0.6,
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily: MONO,
              color: accentColor,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            {game.shortName}
          </span>
          <span
            style={{
              fontSize: 9,
              fontFamily: MONO,
              color: "hsla(0,0%,100%,0.25)",
            }}
          >
            {visibleTasks.filter((t) => !t.isCompleted).length} remaining
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontFamily: MONO,
            color: "hsla(0,0%,100%,0.25)",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0)",
            transition: "transform 0.15s",
          }}
        >
          ▾
        </span>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: "8px 0" }}>
          {visibleTasks.length === 0 && !showAdd && (
            <div
              style={{
                padding: "12px 16px",
                fontSize: 10,
                fontFamily: MONO,
                color: "hsla(0,0%,100%,0.2)",
                textAlign: "center",
              }}
            >
              No tasks
            </div>
          )}

          {/* Task list */}
          {visibleTasks.map((task, index) => (
            <div
              key={task.id}
              draggable
              onDragStart={(e) => handleDragStart(e, task)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 16px",
                cursor: "grab",
                borderTop: dragOverIndex === index && dragTaskId !== task.id
                  ? `2px solid ${accentColor}`
                  : "2px solid transparent",
                opacity: dragTaskId === task.id ? 0.4 : 1,
                transition: "opacity 0.1s",
              }}
            >
              {/* Drag handle */}
              <span
                style={{
                  fontSize: 8,
                  color: "hsla(0,0%,100%,0.15)",
                  cursor: "grab",
                  userSelect: "none",
                  lineHeight: 1,
                }}
              >
                ⠿
              </span>

              {/* Checkbox */}
              <div
                onClick={() => handleToggle(task)}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 2,
                  border: `1.5px solid ${task.isCompleted ? accentBg(0.5) : "hsla(0,0%,100%,0.15)"}`,
                  background: task.isCompleted ? accentBg(0.2) : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.12s",
                }}
              >
                {task.isCompleted && (
                  <span style={{ fontSize: 9, color: accentColor }}>✓</span>
                )}
              </div>

              {/* Name */}
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  fontFamily: MONO,
                  color: task.isCompleted
                    ? "hsla(0,0%,100%,0.2)"
                    : "hsla(0,0%,100%,0.7)",
                  textDecoration: task.isCompleted ? "line-through" : "none",
                }}
              >
                {task.name}
              </span>

              {/* Type tag */}
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  fontFamily: MONO,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  padding: "1px 5px",
                  borderRadius: 2,
                  background:
                    task.type === "weekly"
                      ? "hsla(270, 60%, 50%, 0.12)"
                      : "hsla(0,0%,100%,0.04)",
                  color:
                    task.type === "weekly"
                      ? "hsl(270, 60%, 65%)"
                      : "hsla(0,0%,100%,0.25)",
                  border: `1px solid ${
                    task.type === "weekly"
                      ? "hsla(270, 60%, 50%, 0.2)"
                      : "hsla(0,0%,100%,0.06)"
                  }`,
                }}
              >
                {task.type}
              </span>

              {/* Delete */}
              <button
                onClick={() => handleDelete(task.id!)}
                style={{
                  fontSize: 9,
                  fontFamily: MONO,
                  color: "hsla(0,0%,100%,0.15)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: 2,
                  transition: "color 0.12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(0, 70%, 55%)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "hsla(0,0%,100%,0.15)")}
              >
                ✕
              </button>
            </div>
          ))}

          {/* Add task form */}
          {showAdd ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
              }}
            >
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Task name"
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  borderRadius: 3,
                  fontSize: 11,
                  fontFamily: MONO,
                  background: "hsla(0,0%,100%,0.04)",
                  border: "1px solid hsla(0,0%,100%,0.08)",
                  outline: "none",
                  color: "hsl(var(--foreground))",
                }}
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "daily" | "weekly")}
                style={{
                  padding: "5px 6px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontFamily: MONO,
                  background: "hsla(0,0%,100%,0.04)",
                  border: "1px solid hsla(0,0%,100%,0.08)",
                  outline: "none",
                  color: "hsla(0,0%,100%,0.5)",
                  cursor: "pointer",
                }}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <button
                onClick={handleAdd}
                style={{
                  padding: "4px 10px",
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: MONO,
                  letterSpacing: "0.5px",
                  border: `1px solid ${accentBg(0.35)}`,
                  background: accentBg(0.15),
                  color: accentColor,
                  cursor: "pointer",
                }}
              >
                ADD
              </button>
              <button
                onClick={() => {
                  setShowAdd(false)
                  setNewName("")
                }}
                style={{
                  padding: "4px 8px",
                  borderRadius: 3,
                  fontSize: 9,
                  fontFamily: MONO,
                  border: "1px solid hsla(0,0%,100%,0.08)",
                  background: "transparent",
                  color: "hsla(0,0%,100%,0.3)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ padding: "4px 16px" }}>
              <button
                onClick={() => setShowAdd(true)}
                style={{
                  width: "100%",
                  padding: "5px 0",
                  borderRadius: 3,
                  fontSize: 9,
                  fontFamily: MONO,
                  letterSpacing: "0.5px",
                  border: `1px dashed ${accentBg(0.15)}`,
                  background: "transparent",
                  color: "hsla(0,0%,100%,0.2)",
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = accentBg(0.3)
                  e.currentTarget.style.color = accentColor
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = accentBg(0.15)
                  e.currentTarget.style.color = "hsla(0,0%,100%,0.2)"
                }}
              >
                + ADD TASK
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Tasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [dataVersion, setDataVersion] = useState(0)
  const [gameVisibility, setGameVisibility] = useState(getGameVisibility)
  const resetDone = useRef(false)

  // Listen for game visibility toggles
  useEffect(() => {
    const handler = () => setGameVisibility(getGameVisibility())
    window.addEventListener("game-visibility", handler)
    return () => window.removeEventListener("game-visibility", handler)
  }, [])

  // Auto-reset on mount
  useEffect(() => {
    if (resetDone.current) return
    resetDone.current = true
    autoResetTasks().then((count) => {
      if (count > 0) {
        pushToCloud().catch(console.error)
        setDataVersion((v) => v + 1)
      }
    })
  }, [])

  // Load tasks
  useEffect(() => {
    db.tasks.toArray().then(setTasks)
  }, [dataVersion])

  const handleRefresh = useCallback(() => {
    setDataVersion((v) => v + 1)
  }, [])

  const visibleGameIds = GAME_IDS.filter((gid) => gameVisibility[gid])

  return (
    <div style={{ padding: 24, height: "100%", overflowY: "auto" }}>
      <h1
        style={{
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 20,
          color: "hsl(var(--foreground))",
        }}
      >
        Tasks
      </h1>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 600,
        }}
      >
        {visibleGameIds.map((gid) => (
          <GameSection
            key={gid}
            gameId={gid}
            tasks={tasks.filter((t) => t.gameId === gid)}
            onRefresh={handleRefresh}
          />
        ))}
      </div>
    </div>
  )
}
