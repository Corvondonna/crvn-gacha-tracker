# crvn-gacha-tracker

Personal gacha game tracker for managing pull history, resources, and release timelines across four games.

## Games Tracked

1. **Genshin Impact** (GI) - Open-world RPG, ~6-week patch cycle, dual-phase banners
2. **Honkai Star Rail** (HSR) - Turn-based RPG, ~6-week patch cycle, dual-phase banners
3. **Zenless Zone Zero** (ZZZ) - Instance-based action RPG, HoYoverse dual-phase structure
4. **Wuthering Waves** (WuWa) - Open-world action RPG, variable patch cadence trending toward ~6 weeks

## Core Features

### 1. Timeline
Estimated release schedules for characters, patches, events, and other notable milestones per game. Visual calendar or timeline view showing upcoming and past content drops.

**Timeline generation is semi-automatic.** All four games follow a 42-day patch cycle. Given a known patch start date and version number, the app calculates Phase 2, livestream, and next patch dates using fixed offsets.

**HoYoverse cycle (Genshin Impact, Honkai Star Rail, Zenless Zone Zero):**
- Day 0 (Wednesday): Patch Phase 1 releases
- Day 21 (Wednesday): Patch Phase 2 releases
- Day 30 (Friday): Livestream preview of next patch
- Day 42 (Wednesday): Next patch begins

**Wuthering Waves cycle:**
- Day 0 (Thursday): Patch Phase 1 releases
- Day 21 (Thursday): Patch Phase 2 releases
- Day 29 (Friday): Livestream preview of next patch
- Day 42 (Thursday): Next patch begins

**Reference anchor dates (verified):**
- Genshin 6.5: Apr 8, 2026 (Wed). Skips 6.9, proceeds to 7.0.
- HSR 4.2: Apr 22, 2026 (Wed). Phase 2: May 12. Livestream: May 22.
- ZZZ 2.7: Mar 25, 2026 (Wed). Skips 2.9, proceeds to 3.0.
- WuWa 3.2: Mar 19, 2026 (Thu). Phase 2: Apr 9. Livestream for 3.3: Apr 17.
- WuWa 3.3: Apr 30, 2026 (Thu). Phase 2: May 21 (predicted).

**Version skip logic:** Genshin skips x.9 (e.g., 6.9 -> 7.0). ZZZ skips x.9 (e.g., 2.9 -> 3.0). HSR and WuWa have no known version skips. Implemented in `src/lib/timeline.ts` via VERSION_SKIPS map.

**Manual data per patch:** Character names, weapon names, and event details for each phase must be entered manually or sourced from community leaks/announcements. The cycle math only generates dates.

### 2. 5-Star Pull Tracker
Integration with community tracker sites for importing pull history via Windows PowerShell commands:
- Genshin Impact: paimon.moe
- Honkai Star Rail: starrailstation.com
- Zenless Zone Zero: zzz.rng.moe
- Wuthering Waves: wuwatracker.com

**Pull import workflow (all games follow this pattern):**
1. Open the in-game pull/wish history screen while the game runs
2. Run a game-specific PowerShell script that extracts an auth URL from local game logs
3. Paste the auth URL into the tracker site, which fetches pull history from the game's API
4. Export pull history as JSON from the tracker site
5. Upload/paste the JSON into this app for parsing into Dexie.js

**Example PowerShell command (Genshin / paimon.moe):**
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex "&{$((New-Object System.Net.WebClient).DownloadString('https://gist.github.com/MadeBaruna/1d75c1d37d19eca71591ec8a31178235/raw/getlink.ps1'))} global"
```

Each tracker site has its own equivalent script. Commands for HSR, ZZZ, and WuWa TBD.

### 3. Resource Management
Per-game dashboard covering:
- Priority status (active, saving, skipping)
- 50/50 or guaranteed pity status
- Available currency and pull items (e.g., Intertwined Fates + Primogems for GI)
- Character banner pull history
- Weapon banner pull history
- Standard banner pull history
- 30-day Welkin/pass tracker
- Shop bonus tracker (genesis crystal top-ups, etc.)
- Future character targets with estimated release dates

## Tech Stack

- **Framework:** React 18 (SPA)
- **Build:** Vite
- **Routing:** React Router v6
- **UI:** shadcn/ui + Tailwind CSS v3
- **Charts:** Chart.js + react-chartjs-2
- **Persistence:** IndexedDB via Dexie.js (pull history, resource data), localStorage (preferences, theme)
- **Deployment:** Vercel with GitHub auto-build on push (static SPA)
- **Runtime:** Node v24.14.1 (user local), sandbox uses v22.x

## Project Structure (Planned)

```
crvn-gacha-tracker/
├── public/
│   └── assets/           # Game icons, character images
├── src/
│   ├── pages/            # Route-level components (one per view)
│   │   ├── Dashboard.tsx # Landing page / game overview
│   │   ├── Timeline.tsx  # Timeline feature
│   │   ├── Pulls.tsx     # Pull tracker feature
│   │   └── Resources.tsx # Resource management feature
│   ├── components/
│   │   ├── ui/           # shadcn/ui components
│   │   ├── layout/       # App shell, navbar, sidebar
│   │   ├── timeline/     # Timeline-specific components
│   │   ├── pulls/        # Pull tracker components
│   │   └── resources/    # Resource management components
│   ├── lib/
│   │   ├── games.ts      # Game definitions, constants, currency types
│   │   ├── pity.ts       # Pity calculation logic
│   │   ├── db.ts         # Dexie.js database schema and instance
│   │   ├── parsers/      # PowerShell output parsers per game
│   │   └── utils.ts      # Shared utilities (cn(), etc.)
│   ├── hooks/            # Custom React hooks
│   ├── types/            # TypeScript type definitions
│   ├── data/             # Static game data (banner schedules, character lists)
│   ├── App.tsx           # Root component with React Router
│   └── main.tsx          # Vite entry point
├── index.html            # Vite HTML entry
├── CLAUDE.md
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── vercel.json
```

## Game Data Model

Each game shares a common structure with game-specific currency names:

| Concept | Genshin Impact | Honkai Star Rail | Zenless Zone Zero | Wuthering Waves |
|---|---|---|---|---|
| Premium currency | Primogems | Stellar Jade | Polychrome | Astrite |
| Pull item | Intertwined Fate | Star Rail Special Pass | Encrypted Master Tape | Radiant Tide |
| Paid currency | Genesis Crystals | Oneiric Shard | Monochromes | Lunites |
| Pity (5-star) | 90 | 90 | 90 | 80 |
| Soft pity starts | ~74 | ~74 | ~74 | ~66 |
| 50/50 system | Yes | Yes | Yes | Yes |
| Weapon pity | 80 | 80 | 80 | 80 |
| 30-day pass | Blessing of Welkin Moon | Express Supply Pass | Inter-Knot Membership | Lunite Subscription |

## Pull Data Format (paimon.moe / Genshin Impact)

Reference format from paimon.moe JSON export. Other tracker sites (HSR, ZZZ, WuWa) TBD but expected to follow similar structures.

**Top-level JSON keys (full export):**
- `wish-counter-character-event` - Character event banner data
- `wish-counter-weapon-event` - Weapon event banner data
- `wish-counter-standard` - Standard/permanent banner data
- `wish-counter-setting` - Import settings (firstTime, manualInput)
- `wish-uid` - Player UID string (e.g., "803656505")
- Other keys (achievement, characters, weapons, etc.) are paimon.moe site data, not pull-relevant

**Banner counter structure:**
```json
{
  "total": 3302,
  "legendary": 20,
  "rare": 7,
  "guaranteed": { "legendary": true, "rare": false },
  "pulls": [ ... ]
}
```
- `total` - Lifetime pull count on this banner
- `legendary` - Pulls since last 5-star (current 5-star pity counter)
- `rare` - Pulls since last 4-star (current 4-star pity counter)
- `guaranteed` - Whether next 5-star/4-star is guaranteed to be the featured item
- `pulls` - Array of every individual pull, ordered chronologically (oldest first)

**Individual pull object:**
```json
{
  "type": "character",
  "code": "301",
  "id": "sangonomiya_kokomi",
  "time": "2022-03-08 18:08:53",
  "pity": 77,
  "rate": 1
}
```

| Field | Type | Description |
|---|---|---|
| `type` | string | `"character"` or `"weapon"` |
| `code` | string | Banner code: `"301"` = character event 1, `"400"` = character event 2, `"302"` = weapon event, `"200"` = standard |
| `id` | string | Snake_case item name (e.g., `"raiden_shogun"`, `"favonius_greatsword"`) |
| `time` | string | Pull timestamp, format `"YYYY-MM-DD HH:MM:SS"` |
| `pity` | number | Pity count at this pull (resets after hitting a 4-star or 5-star) |
| `rate` | number | Only present on 4-star and 5-star pulls. Absent on 3-star pulls. |

**`rate` field values:**
- `0` = Off-banner. Lost the 50/50. Standard pool characters (Diluc, Jean, Keqing, Mona, Qiqi, Tighnari, Dehya) or off-banner 4-star weapons.
- `1` = On-banner/featured. Limited 5-star characters (high pity, typically 60-80) and rate-up 4-star characters.
- `2` = On-banner 4-star. Featured 4-stars or secondary rate-up picks.

**How to identify 5-star pulls:** Look for pulls where `rate` is present AND `pity` is high (soft pity starts ~74). More reliably: 5-star characters have `rate = 0` (lost 50/50 to standard character) or `rate = 1` (won featured) with high pity. The `legendary` counter in the parent object tracks current pity toward the next 5-star.

**Note:** The 3-star pulls (no `rate` field) make up the bulk of the array. For display purposes, the tracker should filter to 4-star and 5-star pulls while keeping 3-star data for accurate pity calculation.

## Pull Data Format (starrailstation.com / Honkai Star Rail)

**File format:** `.dat` file. Binary header `srs` (3 bytes) followed by LZ-string UTF-16 compressed JSON. Decompress with: `lzstring.decompressFromUTF16(rawString.substring(3))`.

**Decompressed JSON structure:**
```json
{
  "version": 2,
  "profiles": { "1": { "id": "...", "name": "Default", "key": "1" } },
  "data": {
    "stores": {
      "1_warp-v2": { "types": {...}, "banners": {...}, "items_1": [...], "items_11": [...], ... }
    }
  }
}
```

**Pull data lives in `data.stores["1_warp-v2"]`:**
- `items_1` - Standard banner pulls
- `items_2` - Beginner banner pulls
- `items_11` - Character event banner pulls
- `items_12` - Light Cone event banner pulls
- `items_21` - Special/rerun banner pulls (may not always be present)
- `types` - Per-banner-type aggregated stats (pity counters, averages, guarantee status)

**Individual pull object:**
```json
{
  "uid": "1773738600000305383",
  "itemId": 1501,
  "timestamp": 1773741072000,
  "gachaType": 11,
  "gachaId": 2109,
  "rarity": 5,
  "manual": false,
  "pity4": 5,
  "pity5": 79,
  "pullNo": 1787,
  "result": 2,
  "anchorItemId": "0",
  "sort": 999998213
}
```

| Field | Type | Description |
|---|---|---|
| `uid` | string | Unique pull identifier |
| `itemId` | number | Numeric item ID (maps to character/Light Cone) |
| `timestamp` | number | Unix timestamp in milliseconds |
| `gachaType` | number | Banner type: `1`=standard, `2`=beginner, `11`=character event, `12`=LC event, `21`=special |
| `gachaId` | number | Specific banner instance ID |
| `rarity` | number | `3`=3-star, `4`=4-star, `5`=5-star |
| `pity4` | number | Pulls since last 4-star at this pull |
| `pity5` | number | Pulls since last 5-star at this pull |
| `pullNo` | number | Lifetime pull number on this banner type |
| `result` | number | 50/50 outcome (see below) |
| `sort` | number | Sort order value (descending = newest first in array) |

**`result` field values:**
- `0` = 3-star pull (no 50/50 relevance)
- `2` = Won 50/50 (got featured item)
- `3` = Won 50/50 or was guaranteed (featured item, guaranteed)
- `4` = Lost 50/50 (got off-banner standard item)

**Banner-type stats** (in `types` object) include: `pity4`, `pity5` (current counters), `guarantee5`, `guarantee4` (boolean), `rateupWins`, `rateupChallenges`, `avgPity5`.

**Note:** Items are stored newest-first in the arrays (descending by sort). Item IDs are numeric and require a lookup table to map to character/LC names.

## Pull Data Format (zzz.rng.moe / Zenless Zone Zero)

**File format:** Plain `.json`.

**JSON structure:**
```json
{
  "version": 1,
  "game": "zzz",
  "data": {
    "profiles": {
      "1": {
        "stores": {
          "0": {
            "gachaTypes": {...},
            "items": { "1001": [...], "2001": [...], ... }
          }
        }
      }
    }
  }
}
```

**Pull data lives in `data.profiles["1"].stores["0"].items`:**
- `1001` - Standard banner pulls
- `2001` - Character event banner pulls (Exclusive Channel)
- `3001` - W-Engine event banner pulls (W-Engine Channel)
- `5001` - Bangboo banner pulls
- `12001` - Secondary character banner (may appear in newer versions)

**Individual pull object:**
```json
{
  "uid": "1737547200000537888",
  "id": 1311,
  "timestamp": 1737547702000,
  "rarity": 4,
  "gacha": 2001011,
  "gachaType": 2001,
  "pity": 57,
  "manual": false,
  "no": 57,
  "result": 1
}
```

| Field | Type | Description |
|---|---|---|
| `uid` | string | Unique pull identifier |
| `id` | number | Numeric item ID (maps to Agent/W-Engine/Bangboo) |
| `timestamp` | number | Unix timestamp in milliseconds |
| `rarity` | number | `2`=B-rank (3-star equiv), `3`=A-rank (4-star equiv), `4`=S-rank (5-star equiv) |
| `gacha` | number | Specific banner instance ID |
| `gachaType` | number | Banner type code (1001, 2001, 3001, 5001, 12001) |
| `pity` | number | Pity count at this pull |
| `no` | number | Lifetime pull number on this banner type |
| `result` | number | 50/50 outcome (see below) |

**`result` field values:**
- `0` = B-rank pull (no 50/50 relevance)
- `1` = Featured/on-banner (won rate-up or featured)
- `2` = Off-banner or secondary (lost 50/50 or non-featured)
- `3` = Guaranteed or standard pool

**ZZZ rarity mapping differs from other games:** S-rank=4, A-rank=3, B-rank=2 (not 5/4/3). Parser must normalize.

**Note:** Items stored oldest-first. Banner-type stats in `gachaTypes` include: `pity` (object with `pityS` and `pityA`), `sWinCount`, `sChallengeCount`, `avgPityS`, `avgPityA`.

## Pull Data Format (wuwatracker.com / Wuthering Waves)

**File format:** Plain `.json`. Simplest format of the four.

**JSON structure:**
```json
{
  "siteVersion": "v4.7.3",
  "version": "0.0.2",
  "date": "2026-03-22T21:57:23.617Z",
  "playerId": "901292598",
  "pulls": [ ... ]
}
```

**All pulls in a single flat array** (no separation by banner type). Use `cardPoolType` to filter.

**Individual pull object:**
```json
{
  "cardPoolType": 1,
  "resourceId": 1210,
  "qualityLevel": 5,
  "name": "Aemeath",
  "time": "2026-02-05T23:17:07+00:00",
  "isSorted": true,
  "group": 1
}
```

| Field | Type | Description |
|---|---|---|
| `cardPoolType` | number | `1`=character event, `2`=weapon event, `3`=beginner, `4`=standard |
| `resourceId` | number | Numeric item ID |
| `qualityLevel` | number | `3`=3-star, `4`=4-star, `5`=5-star |
| `name` | string | Human-readable item name (e.g., "Aemeath", "Red Spring") |
| `time` | string | ISO 8601 timestamp with timezone offset |
| `group` | number | Pull group/batch indicator |

**Critical differences from other formats:**
- **No pity field.** Pity must be computed by counting pulls since last 4-star or 5-star within each `cardPoolType`.
- **No result/rate field.** 50/50 win/loss must be computed by comparing the pulled item against a known list of limited vs standard characters.
- **Has human-readable `name` field.** Only format that includes item names directly.
- **Sorted newest-first.** Reverse before computing pity.
- **Single flat array.** All banner types mixed together, unlike other formats which separate by banner.

## Cross-Game Format Comparison

| Aspect | paimon.moe (GI) | starrailstation (HSR) | zzz.rng.moe (ZZZ) | wuwatracker (WuWa) |
|---|---|---|---|---|
| File type | .json | .dat (LZ-string compressed) | .json | .json |
| Item ID format | snake_case string | numeric | numeric | numeric + name string |
| Rarity scale | inferred from rate | 3/4/5 | 2/3/4 (B/A/S) | 3/4/5 |
| Pity included | yes | yes (pity4 + pity5) | yes | NO (must compute) |
| 50/50 result | rate field (0/1/2) | result field (0/2/3/4) | result field (0/1/2/3) | NO (must compute) |
| Sort order | oldest first | newest first | oldest first | newest first |
| Items human name | no | no | no | yes |
| Banners separated | by top-level key | by items_N arrays | by items dict key | single flat array |

## Persistence Strategy

Two-tier storage, all client-side. No backend in v1.

**IndexedDB (via Dexie.js)** for structured, growing data:
- Pull history logs (character, weapon, standard banners per game)
- Resource snapshots (currency counts, pity counters, 50/50 status)
- Timeline entries (patch dates, banner phases, event schedules)
- Character target lists with estimated release dates

**localStorage** for lightweight preferences:
- Active game selection
- Theme preference
- UI state (collapsed panels, last viewed tab)

**Future (v2+):** Cloud persistence via Supabase or Vercel Postgres for cross-device sync. Requires adding auth.

## Design Decisions

**Layout:** Sidebar navigation on the left with game icons and page links (Timeline, Pulls, Resources). Dark theme default.

**Game accent colors:**
- Genshin Impact: TBD (gold/amber tones suggested)
- Honkai Star Rail: TBD (blue/purple tones suggested)
- Zenless Zone Zero: TBD (green/teal tones suggested)
- Wuthering Waves: TBD (purple/violet tones suggested)

**Timeline layout:** Horizontal scrolling view with four game rows (one per game), shared month axis across top. Each patch phase represented by a circular node with character portrait, date, and version label. Includes a vertical "today" marker. Node size based on character value (larger = limited 5-star, smaller = 4-star/standard/rerun). "Speculation" tags for unconfirmed content.

**Character registration:** Users manually register characters with: display name, game association, release date (patch + phase), rarity/value tier (affects node size), and optional portrait upload. Portraits resized to 128x128 max and compressed before storing in IndexedDB. Characters without portraits show a colored initial or game icon fallback. A static lookup table ships with the app for mapping pull history IDs to character names; registered characters extend this table.

**Responsive:** Desktop-first (monitor). Mobile/small-screen layout deferred to a later version.

**V1 scope priority:** Timeline first, then Pull Tracker, then Resource Management.

## Combat Mode System

Permanent combat modes per game that reset on fixed schedules and award currency. Rendered as small icons on the timeline below each game's banner row. Combat rewards are projected into probability calculations via `projectIncomeUntil()` but do NOT modify stored resource snapshots.

**Data:** `src/data/combat-modes.ts` defines all modes with schedule types:
- `monthly`: resets on a specific day each month (e.g., Spiral Abyss on the 16th)
- `interval`: fixed N-day cycle from an anchor date (e.g., HSR modes every 42 days)
- `patchRelative`: offset from patch start (e.g., Stygian Onslaught 7 days after patch)

**Modes and icons:**

| Game | Mode | Icon | Reward | Schedule |
|---|---|---|---|---|
| GI | Spiral Abyss | gate | 800 Primogems | Monthly 16th |
| GI | Imaginarium Theatre | theatre | 1000 Primogems | Monthly 1st |
| GI | Stygian Onslaught | flower | 450 Primogems | Patch +7 days |
| HSR | Apocalyptic Shadow | hourglass | 800 Stellar Jade | 42-day cycle |
| HSR | Pure Fiction | dove | 800 Stellar Jade | 42-day cycle |
| HSR | Memory of Chaos | crystal | 800 Stellar Jade | 42-day cycle |
| ZZZ | Shiyu Defense | shield | 780 Polychrome | 14-day cycle |
| ZZZ | Deadly Assault | cobra | 300 Polychrome | 14-day cycle |
| WuWa | Tower of Adversity | tower | 800 Astrite | 28-day cycle |
| WuWa | Whimpering Wastes | ship | 800 Astrite | 28-day cycle |

**Tracking:** `combatClaims` table in Dexie tracks which resets have been seen (for toast notifications). The `claimCombatRewards()` function in `src/lib/combat-rewards.ts` records new claims on app load but does not touch resource snapshots. A one-time `reverseCombatRewardInflation()` cleanup exists to undo an earlier bug that incorrectly added combat rewards to stored currency.

**Rendering:** `CombatModeIcon` component in `timeline-view.tsx` renders unique SVG icons per mode. Past nodes at 35% opacity, future at 85%, with "+reward" label below each icon.

## Development Notes

- All banner structures follow a phase-based model: each patch has Phase 1 and Phase 2
- WuWa patch cadence was irregular at launch but is stabilizing; tracker must handle flexible date ranges
- Pull history import relies on PowerShell scripts that read local game logs; specific commands TBD
- No user auth in v1; single-user local app
- Dark theme default (matches gacha game aesthetic)

## Commands

```bash
# Install dependencies
npm install

# Run dev server (Vite, default port 5173)
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview production build locally
npm run preview

# Deploy (auto via Vercel GitHub integration)
git push origin main
```

## Conventions

- TypeScript strict mode
- File naming: kebab-case for files, PascalCase for components
- One component per file
- Game identifiers: "genshin", "hsr", "zzz", "wuwa" (used as keys throughout)
- All dates stored as ISO 8601 strings
- Currency amounts stored as integers (no floats)
- Tailwind for all styling; no separate CSS files
- shadcn/ui as the component base; customize via Tailwind
