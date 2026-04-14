import { useState, useEffect, useRef } from "react"
import { GAMES, type GameId } from "@/lib/games"
import { db, type TimelineEntry } from "@/lib/db"
import { formatDate } from "@/lib/timeline"

interface NodeEditorProps {
  gameId: GameId
  version: string
  phase: 1 | 2
  date: Date
  onClose: () => void
  onSave: () => void
}

const VALUE_TIERS = [
  { value: "limited", label: "Limited 5-Star" },
  { value: "rerun", label: "Rerun 5-Star" },
  { value: "standard", label: "Standard 5-Star" },
  { value: "four-star", label: "4-Star" },
] as const

export function NodeEditor({ gameId, version, phase, date, onClose, onSave }: NodeEditorProps) {
  const game = GAMES[gameId]
  const panelRef = useRef<HTMLDivElement>(null)

  const [characterName, setCharacterName] = useState("")
  const [valueTier, setValueTier] = useState<TimelineEntry["valueTier"]>("limited")
  const [isSpeculation, setIsSpeculation] = useState(false)
  const [existingId, setExistingId] = useState<number | null>(null)
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null)
  const [portraitBlob, setPortraitBlob] = useState<Blob | null>(null)

  // Load existing entry
  useEffect(() => {
    async function load() {
      const entry = await db.timeline
        .where({ gameId, version })
        .filter((e) => e.phase === phase)
        .first()

      if (entry) {
        setCharacterName(entry.characterName ?? "")
        setValueTier(entry.valueTier)
        setIsSpeculation(entry.isSpeculation)
        setExistingId(entry.id ?? null)
        if (entry.characterPortrait) {
          setPortraitPreview(URL.createObjectURL(entry.characterPortrait))
          setPortraitBlob(entry.characterPortrait)
        }
      }
    }
    load()
  }, [gameId, version, phase])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  // Cleanup portrait preview URL
  useEffect(() => {
    return () => {
      if (portraitPreview) URL.revokeObjectURL(portraitPreview)
    }
  }, [portraitPreview])

  const handlePortraitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Resize to 128x128 max
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.src = url

    img.onload = () => {
      const canvas = document.createElement("canvas")
      const maxSize = 128
      let w = img.width
      let h = img.height

      if (w > maxSize || h > maxSize) {
        if (w > h) {
          h = Math.round((h * maxSize) / w)
          w = maxSize
        } else {
          w = Math.round((w * maxSize) / h)
          h = maxSize
        }
      }

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            if (portraitPreview) URL.revokeObjectURL(portraitPreview)
            setPortraitBlob(blob)
            setPortraitPreview(URL.createObjectURL(blob))
          }
          URL.revokeObjectURL(url)
        },
        "image/webp",
        0.8
      )
    }
  }

  const handleSave = async () => {
    const entry: Omit<TimelineEntry, "id"> = {
      gameId,
      version,
      phase,
      startDate: date.toISOString(),
      characterName: characterName.trim() || null,
      characterPortrait: portraitBlob,
      valueTier,
      isSpeculation,
    }

    if (existingId) {
      await db.timeline.update(existingId, entry)
    } else {
      await db.timeline.add(entry as TimelineEntry)
    }

    onSave()
    onClose()
  }

  const handleDelete = async () => {
    if (existingId) {
      await db.timeline.delete(existingId)
      onSave()
      onClose()
    }
  }

  const handleRemovePortrait = () => {
    if (portraitPreview) URL.revokeObjectURL(portraitPreview)
    setPortraitBlob(null)
    setPortraitPreview(null)
  }

  const accentColor = `hsl(var(${game.accentVar}))`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        ref={panelRef}
        className="glass w-[400px] rounded-2xl overflow-hidden"
        style={{ border: `1px solid hsla(var(${game.accentVar}) / 0.2)` }}
      >
        {/* Header */}
        <div style={{ padding: "24px 32px 20px", borderBottom: "1px solid hsla(0,0%,100%,0.06)" }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-wide" style={{ color: accentColor }}>
                {game.shortName} {version} {phase === 1 ? "Phase 1" : "Phase 2"}
              </div>
              <div className="text-[11px] mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm hover:bg-white/5 transition-colors"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col" style={{ padding: "24px 32px", gap: 20 }}>
          {/* Character name */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              Character Name
            </label>
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="e.g. Raiden Shogun"
              className="w-full px-3 py-2 rounded-lg text-sm bg-white/[0.04] border border-white/[0.08] outline-none focus:border-white/20 transition-colors"
              style={{ color: "hsl(var(--foreground))" }}
            />
          </div>

          {/* Value tier */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              Value Tier
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VALUE_TIERS.map((tier) => (
                <button
                  key={tier.value}
                  onClick={() => setValueTier(tier.value)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border"
                  style={{
                    background: valueTier === tier.value ? `hsla(var(${game.accentVar}) / 0.15)` : "hsla(0,0%,100%,0.03)",
                    borderColor: valueTier === tier.value ? `hsla(var(${game.accentVar}) / 0.4)` : "hsla(0,0%,100%,0.06)",
                    color: valueTier === tier.value ? accentColor : "hsl(var(--muted-foreground))",
                  }}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          {/* Portrait */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              Portrait (optional)
            </label>
            <div className="flex items-center gap-3">
              {portraitPreview ? (
                <div className="relative">
                  <img
                    src={portraitPreview}
                    alt="Portrait"
                    className="w-12 h-12 rounded-lg object-cover border"
                    style={{ borderColor: `hsla(var(${game.accentVar}) / 0.3)` }}
                  />
                  <button
                    onClick={handleRemovePortrait}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500/80 text-white text-[8px] flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="w-12 h-12 rounded-lg border border-dashed border-white/10 flex items-center justify-center cursor-pointer hover:border-white/20 transition-colors">
                  <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>+</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePortraitChange}
                    className="hidden"
                  />
                </label>
              )}
              <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                128x128 max, auto-resized
              </span>
            </div>
          </div>

          {/* Speculation toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div
              className="w-8 h-[18px] rounded-full relative transition-colors"
              style={{
                background: isSpeculation ? `hsla(var(${game.accentVar}) / 0.3)` : "hsla(0,0%,100%,0.08)",
              }}
              onClick={() => setIsSpeculation(!isSpeculation)}
            >
              <div
                className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform"
                style={{
                  left: isSpeculation ? 15 : 2,
                }}
              />
            </div>
            <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              Mark as speculation
            </span>
          </label>
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-2"
          style={{ padding: "20px 32px", borderTop: "1px solid hsla(0,0%,100%,0.06)" }}
        >
          {existingId && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[11px] font-medium border border-white/10 hover:bg-white/5 transition-colors"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{
              background: `hsla(var(${game.accentVar}) / 0.2)`,
              color: accentColor,
              border: `1px solid hsla(var(${game.accentVar}) / 0.3)`,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
