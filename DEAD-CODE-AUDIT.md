# Dead & Conflicting Code Audit

Analysis only. Nothing has been changed. Each item lists evidence and a recommendation; the call is yours.

---

## A. LIVE BUGS found during the audit (not dead code — these produce wrong numbers today)

### A1. Node editor still has the 5% weapon-probability bug — HIGH
`src/components/timeline/node-editor.tsx:444-448` calls `computeCombinedProbability` with only 8 args, so the new `sharedPulls` param defaults to 0. Commit `3de2a7b` fixed Dashboard and Timeline but missed the editor. Opening a WuWa/NTE node with "+ Weapon" shows the old absurdly-low percentage while the timeline badge shows the corrected one.

### A2. Node editor ignores `has5050` — NTE shows 50/50 odds despite guaranteed characters
`node-editor.tsx:428` uses `resource.isGuaranteed ?? false`; Dashboard (`Dashboard.tsx:276`) and Timeline (`timeline-view.tsx:1316`) both use `!config.has5050 || isGuaranteed`. NTE (`has5050: false`) shows different percentages in the editor vs everywhere else.

### A3. `reverseCombatRewardInflation` can subtract currency repeatedly — DATA HAZARD
`src/lib/combat-rewards.ts:132-171`, called on every load from `App.tsx:86`. Guarded by a localStorage flag, but the data it mutates is cloud-synced. Any new device, new browser profile, or cleared site data re-runs it and subtracts the full historical combatClaims sum from your currency again. It also only subtracts raw currency, which no longer matches how rewards are credited (pull items for GI/HSR/ZZZ). Recommendation: retire it, or gate it with a cloud-stored flag.

### A4. `deduplicateTimeline` scoring is broken and can discard user data
`src/lib/sync.ts:349`: `score += (e.id ?? 0)` as a "tiebreak" dominates the entire score (max real score is 25, ids exceed that immediately). A fully-filled entry can lose to an empty newer duplicate. The dedupe key also omits `bannerLane`, so an Uma character entry and support entry with the same version would collapse into one.

### A5. `seedTimeline` resurrects deleted nodes and seeds stale versions
`seed-timeline.ts:112`, run on every Timeline mount. Re-adds any missing `gameId:version:phase`, so a node you delete comes back on the next visit. Seed lists are also outdated (Genshin 6.2-6.7 vs anchor 6.5; HSR seeds 3.8-4.1 that predate the anchor) and every seeded row gets `startDate = now()` as a meaningless placeholder in an indexed column.

### A6. Reward accumulation ignores your manual date overrides
`App.tsx:78-80` builds `patchStarts` without the runtime overrides that Dashboard/Timeline apply. If you manually corrected a patch date, patch-day/livestream/combat rewards still accrue on the calculated date.

### A7. Dashboard and Timeline project over different date ranges
Dashboard: now + 12 months (`Dashboard.tsx:101-113`). Timeline: selected calendar year only (`timeline-view.tsx:1143`). A banner early next year gets different Est. Pulls / probability on the two screens (and the node editor inherits the narrower one).

### A8. `autoConvertCurrency` honored in only one of three accumulators
Combat rewards convert (`combat-rewards.ts:109`); daily income (`daily-income.ts:262`) and event rewards (`event-rewards.ts:136`) always add raw currency. For GI/HSR/ZZZ the three accumulators disagree about which field grows.

### A9. Node editor spark count field does nothing
`TimelineEntry.sparkCount` has a real input (`node-editor.tsx:732`) and is synced, but every spark calculation reads `ResourceSnapshot.charSparkCount / supportSparkCount` instead. Typing a spark count in the editor has zero effect. Keep the field or the input, not both.

### A10. Combat reset hour hardcoded to 4 AM
`combat-modes.ts` hardcodes 4:00 everywhere; NTE's `dailyResetHour` is 5. One-hour disagreement for NTE's Beyond the Rails resets.

### A11. `accumulateDailyIncome` double-computes income with diverging expiry logic
`daily-income.ts:231` gates on `getDailyIncome()` (expired pass = 0), then recomputes inline with different expiry handling (`:247-253`). If commissions are off and the pass expired before your last update, partial pass income is silently dropped. Also `effectiveDays` (`:235`) is assigned and never used.

---

## B. Safe to delete — no live references, removal cannot break anything

| Item | Location | Evidence |
|---|---|---|
| `computeProbability` legacy wrapper | `probability.ts:454` | Zero importers (ts-prune + manual) |
| `src/types/index.ts` entire barrel | whole file | Nothing imports `@/types`; also incomplete |
| `GameConfig.weaponMaxFatePoints` | `games.ts:26` + 6 entries | Never read; all zeros |
| `GameConfig.timelineLanes` | `games.ts:42` | Never set, never read; lanes are hardcoded strings |
| `GameConfig.sparkCarries` | `games.ts:48` + 6 entries | Never read |
| `GameConfig.patchCycle.patchDay` | `games.ts:35` + 6 entries | Never read (weekday comes from anchors); documentation value |
| `src/App.css` | whole file, 184 lines | Never imported; Vite template leftovers |
| `src/assets/hero.png`, `react.svg`, `vite.svg` | | Zero imports; scaffold leftovers |
| `public/icons.svg` | | Third-party template sprite, zero references |
| `setSnapshotId` no-op state | `game-resource-card.tsx:137` | Value never read |
| `setSaveCount` no-op state | `Resources.tsx:20` | Value never read |
| `importing` state | `Pulls.tsx:398` | Setter never called (dead inside dead page) |

Also exported-but-private (cosmetic): `probabilityWithSpark`, `probabilityOfFeatured*`, `pruneResourceHistory` are exported but only used within their own modules.

## C. Dormant — the deferred Pull Tracker feature (recommend KEEP)

`Pulls.tsx` (708 lines, route commented out) is the sole consumer of: `lib/parsers/*` (all 5 files), `data/item-names-*` (3 files), and the only writer of `PullRecord`. The whole subtree is unreachable in production but self-contained and compiles clean. Since the pull tracker is planned V1 scope, keep it. Gap noted: no parser exists for NTE or Uma; `parseImport` would throw for them.

## D. Coupled — needs your decision (touches DB schema or feature intent)

### D1. `characters` table / `CharacterRegistration` — a feature with no UI at all
No code creates or reads registrations; the only touchpoints are sync round-tripping an empty table (`sync.ts:129-141, :401`) and 11 Dexie migration declarations. Character identity actually lives denormalized on timeline entries. Delete the feature (type, table, sync branches) or build the UI; currently it's pure overhead. Supabase table would need a migration to drop.

### D2. `weaponFatePoints` — inert end to end
No input edits it, `probabilityOfFeaturedWeapon` intentionally ignores it (`_fatePoints`, weapon banners are modeled as 50/50 now), yet it's stored, synced, and passed around with three different sources (hardcoded 0 in Dashboard and editor, snapshot value in timeline). The stale docstring at `probability.ts:180-188` still describes the removed fate-point algorithm. Either implement fate points properly or strip the plumbing.

### D3. `bannerDurationDays` — write-only
Editor state saves it, sync ships it, nothing renders it (Uma bars come from `uma-scenarios.ts`).

### D4. Duplicated reward constants
`LIVESTREAM_CODES`, `PATCH_DAY_CURRENCY`, `WUWA_PATCH_TIDES`, `PATCH_DAY_HOUR`, `LIVESTREAM_HOUR` declared independently in `event-rewards.ts:13-17` and `daily-income.ts:142-146`. They agree today; one edit desynchronizes projection from accrual. Consolidate into one module.

### D5. Monthly pull item projection has no accrual counterpart
`daily-income.ts:175-192` projects +5 pulls/month (+20 NTE weapon) into estimates, but no accumulator ever credits them. Projections promise resources that never arrive.

## E. Minor / informational

- `timeline.ts:47-58` returns override dates by reference from a shared constant; any future mutation would corrupt the session's override table (all current consumers copy first).
- Timeline's portrait object URLs are never revoked on unmount (small memory leak).
- `SOFT_PITY_INCREMENT` has no uma keys; harmless only because Uma always routes to the spark model.
- Uma target selection: Dashboard uses start-of-day >= today, timeline uses strict > now; a banner starting today shows on one and not the other.
- `public/assets/portraits/**` (~100 images) is code-unreferenced but documented as a deliberate manual backup; keep.
- Dexie migration v5 deleted `weaponPullItems` then v7 recreated it as 0 — historical data loss, informational only.
