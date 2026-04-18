import { useState, useRef, useEffect, useCallback } from "react"

const MONO = "'JetBrains Mono', 'Fira Code', monospace"
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

interface DatePickerProps {
  value: Date | null
  onChange: (date: Date) => void
  accentColor?: string
  accentVar?: string
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function DatePicker({ value, onChange, accentColor, accentVar }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(value?.getFullYear() ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(value?.getMonth() ?? new Date().getMonth())
  const containerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const accent = accentColor ?? (accentVar ? `hsl(var(${accentVar}))` : "hsl(145, 55%, 48%)")
  const accentBg = (opacity: number) =>
    accentVar ? `hsla(var(${accentVar}) / ${opacity})` : `hsla(145, 55%, 48%, ${opacity})`

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open])

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }, [viewMonth])

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }, [viewMonth])

  const handleSelect = (day: number) => {
    const d = new Date(viewYear, viewMonth, day, 12, 0, 0)
    onChange(d)
    setOpen(false)
  }

  // Build calendar grid
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const prevDays = new Date(viewYear, viewMonth, 0).getDate()
  const today = new Date()

  const cells: { day: number; current: boolean }[] = []
  // Leading days from previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, current: false })
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true })
  }
  // Trailing days to fill 6 rows
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false })
  }

  const displayStr = value ? toLocalDateStr(value) : "Select date"

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger button */}
      <button
        onClick={() => {
          if (!open && value) {
            setViewYear(value.getFullYear())
            setViewMonth(value.getMonth())
          }
          setOpen(!open)
        }}
        style={{
          padding: "5px 10px",
          borderRadius: 3,
          fontSize: 11,
          fontFamily: MONO,
          fontWeight: 500,
          background: "hsla(0,0%,100%,0.04)",
          border: `1px solid ${open ? accentBg(0.4) : "hsla(0,0%,100%,0.1)"}`,
          outline: "none",
          color: value ? "hsl(var(--foreground))" : "hsla(0,0%,100%,0.35)",
          cursor: "pointer",
          transition: "border-color 0.15s",
          letterSpacing: "0.3px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Calendar icon */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="2.5" width="10" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
          <line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.3" />
          <line x1="3.5" y1="1" x2="3.5" y2="3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5" />
          <line x1="8.5" y1="1" x2="8.5" y2="3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5" />
        </svg>
        {displayStr}
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div
          ref={popRef}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 200,
            width: 260,
            background: "hsla(0, 0%, 4%, 0.97)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${accentBg(0.2)}`,
            borderRadius: 4,
            boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.05)",
            overflow: "hidden",
            animation: "datepicker-in 0.12s ease-out",
          }}
        >
          {/* Accent bar */}
          <div style={{ height: 2, background: accent, opacity: 0.4 }} />

          {/* Month/Year header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px 8px",
            }}
          >
            <button onClick={prevMonth} style={navBtnStyle}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: MONO,
                color: accent,
                letterSpacing: "0.5px",
                userSelect: "none",
              }}
            >
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} style={navBtnStyle}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Day-of-week header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              padding: "0 8px",
              gap: 0,
            }}
          >
            {DAYS.map((d) => (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  fontSize: 8,
                  fontWeight: 700,
                  fontFamily: MONO,
                  color: "hsla(0,0%,100%,0.25)",
                  letterSpacing: "0.5px",
                  padding: "2px 0 6px",
                  textTransform: "uppercase",
                }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              padding: "0 8px 10px",
              gap: 2,
            }}
          >
            {cells.map((cell, i) => {
              const cellDate = cell.current
                ? new Date(viewYear, viewMonth, cell.day)
                : null
              const isSelected = cell.current && value && sameDay(cellDate!, value)
              const isToday = cell.current && sameDay(cellDate!, today)

              return (
                <button
                  key={i}
                  onClick={() => cell.current && handleSelect(cell.day)}
                  disabled={!cell.current}
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: isSelected ? 700 : 500,
                    fontFamily: MONO,
                    borderRadius: 3,
                    border: isToday && !isSelected ? `1px solid ${accentBg(0.35)}` : "1px solid transparent",
                    background: isSelected ? accentBg(0.3) : "transparent",
                    color: !cell.current
                      ? "hsla(0,0%,100%,0.12)"
                      : isSelected
                        ? accent
                        : "hsla(0,0%,100%,0.6)",
                    cursor: cell.current ? "pointer" : "default",
                    transition: "background 0.1s, color 0.1s",
                    padding: 0,
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (cell.current && !isSelected) {
                      ;(e.target as HTMLElement).style.background = "hsla(0,0%,100%,0.06)"
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (cell.current && !isSelected) {
                      ;(e.target as HTMLElement).style.background = "transparent"
                    }
                  }}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 12px 10px",
              borderTop: "1px solid hsla(0,0%,100%,0.06)",
            }}
          >
            <button
              onClick={() => {
                onChange(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 12, 0, 0))
                setOpen(false)
              }}
              style={{
                fontSize: 9,
                fontWeight: 600,
                fontFamily: MONO,
                color: accent,
                background: "none",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                padding: "2px 4px",
              }}
            >
              Today
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                fontSize: 9,
                fontWeight: 600,
                fontFamily: MONO,
                color: "hsla(0,0%,100%,0.35)",
                background: "none",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                padding: "2px 4px",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 3,
  border: "1px solid hsla(0,0%,100%,0.08)",
  background: "hsla(0,0%,100%,0.04)",
  color: "hsla(0,0%,100%,0.5)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 0.1s",
  padding: 0,
}
