# Refactor Plan — Dead & Conflicting Code Cleanup

Companion to `DEAD-CODE-AUDIT.md`. Ordered so each phase is independently shippable, with correctness fixes first and cosmetic cleanup last. Each step lists files, the change, and how to verify. Steps marked **[DECISION]** need your call before implementation.

---

## Phase 1 — Correctness fixes (wrong numbers today)

### Step 1.1 — Finish the shared-currency probability fix in the node editor
Audit refs: A1, A2.
Files: `src/components/timeline/node-editor.tsx`
- Pass the 9th `sharedPulls` argument (`config.weaponPullItem ? currencyPulls : 0`) to `computeCombinedProbability`, mirroring timeline-view.
- Change `isGuaranteed` to `!config.has5050 || (resource.isGuaranteed ?? false)`.
- Align `weaponFP` source with timeline (`resource.weaponFatePoints ?? 0`) so all three callers agree, even though the param is currently inert.
Verify: open a WuWa node with "+ Weapon" — editor percentage matches the timeline badge. Open an NTE node — editor shows guaranteed-tier odds.

### Step 1.2 — Serialize the three reward accumulators
Audit ref: new finding (accumulator race).
Files: `src/App.tsx`
- Replace `Promise.all([accumulateDailyIncome(), claimCombatRewards(...), accumulateEventRewards(...)])` with sequential `await`s. Each function already re-reads the latest snapshot, so ordering alone eliminates the lost-update race.
- Order: daily income → event rewards → combat rewards (combat last so its conversion sees the final currency total).
Verify: on a load where multiple rewards fire, all toasts appear AND the sum of increments matches the snapshot delta.

### Step 1.3 — Retire `reverseCombatRewardInflation`
Audit ref: A3.
Files: `src/lib/combat-rewards.ts`, `src/App.tsx`
- Delete the function and its call. The one-time cleanup ran on your main device long ago; every number since has been manually corrected. Keeping it risks repeated subtraction on any new device; removing it risks nothing.
Verify: fresh browser profile → login → currency unchanged after load.

### Step 1.4 — Fix `deduplicateTimeline` scoring and key
Audit ref: A4.
Files: `src/lib/sync.ts`
- Compare quality score first; use `id` only as a true tiebreak (compare tuple `(score, id)` instead of `score + id`).
- Include `bannerLane` in the dedupe key: `gameId:version:phase:lane`.
Verify: craft two duplicate entries in Dexie (one filled, one empty with higher id) → dedupe keeps the filled one. Uma char + support entries with the same version both survive.

### Step 1.5 — Combat resets use the game's reset hour
Audit ref: A10.
Files: `src/data/combat-modes.ts`
- Replace hardcoded `4` with `GAMES[mode.gameId].dailyResetHour` in all schedule branches.
Verify: NTE rails reset computes at 05:00, HoYo/WuWa modes still 04:00.

### Step 1.6 — Fix `accumulateDailyIncome` double-computation
Audit ref: A11.
Files: `src/lib/daily-income.ts`
- Remove the `getDailyIncome() <= 0` early-exit gate (or make the gate check the same inline components). Compute income once; let the inline expiry-aware path be the single source.
- Delete the dead `effectiveDays` local.
Verify: snapshot with commissions off + pass expired mid-gap → partial pass income accrues instead of being dropped.

### Step 1.7 — Accumulation respects manual date overrides
Audit ref: A6.
Files: `src/App.tsx`
- Before building `patchStarts`, read timeline entries with `dateOverride` set (same as Dashboard's `runtimeOverrides`) and pass them into `generatePatchSeries`.
Verify: override a patch date in the editor → patch-day reward accrues on the overridden date, not the calculated one.

### Step 1.8 — **[DECISION]** Unify `autoConvertCurrency` across accumulators
Audit ref: A8.
Files: `src/lib/daily-income.ts`, `src/lib/event-rewards.ts`
- Option A: all three accumulators convert for GI/HSR/ZZZ (currency stays below 160, everything lands as pull items). Consistent, but changes long-standing daily-income behavior.
- Option B (recommended): none of them auto-convert; remove the conversion from combat-rewards too, and rely on the manual → button. Simplest mental model: accumulators only ever add currency, you convert when you want.
- Either way the flag then has a single meaning. Option B makes `autoConvertCurrency` deletable.

### Step 1.9 — **[DECISION]** Stop `seedTimeline` resurrecting deleted nodes
Audit ref: A5.
Files: `src/lib/seed-timeline.ts`, `src/components/timeline/timeline-view.tsx`
- Option A (recommended): seed only when `db.timeline` is completely empty (first-run bootstrap). Deleted nodes stay deleted.
- Option B: keep per-slot reseeding but add a tombstone flag to TimelineEntry.
- Also: derive seed versions from `PATCH_ANCHORS` instead of the stale hardcoded lists, and stop writing placeholder `startDate = now()`.

### Step 1.10 — **[DECISION]** Unify projection horizon between Dashboard and Timeline
Audit ref: A7.
- Option A (recommended): both project from now to the banner date, regardless of view year (probability for a Jan banner is identical on both screens).
- Option B: leave as-is, accept the discrepancy on year boundaries.
Files: `src/components/timeline/timeline-view.tsx` (probability effect).

### Step 1.11 — **[DECISION]** Node editor spark count field
Audit ref: A9.
- Option A (recommended): remove the editor input and `TimelineEntry.sparkCount`; the resource snapshot's spark counters are the real source.
- Option B: make the editor input write through to the resource snapshot.
Files: `src/components/timeline/node-editor.tsx`, `src/lib/db.ts`, `src/lib/sync.ts` (+ cloud column stays, just unused).

---

## Phase 2 — Safe deletions and consolidation (zero behavior change)

### Step 2.1 — Delete unreferenced code
Audit ref: section B.
- `computeProbability` (`probability.ts`)
- `src/types/index.ts` (whole file)
- `GameConfig` fields: `weaponMaxFatePoints`, `timelineLanes`, `sparkCarries`, `patchCycle.patchDay` (+ their 6 entries each)
- `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg`
- No-op state: `setSnapshotId` (game-resource-card), `setSaveCount` (Resources.tsx), `importing` (Pulls.tsx)
Verify: `tsc --noEmit` + `vite build` clean; app renders all three pages.

### Step 2.2 — De-export module-private functions
- Remove `export` from `probabilityWithSpark`, `probabilityOfFeaturedCharacter`, `probabilityOfFeaturedWeapon`, `probabilityOfCharAndWeapon`, `pruneResourceHistory`.

### Step 2.3 — Consolidate duplicated reward constants
Audit ref: D4.
- New `src/data/reward-constants.ts` exporting `LIVESTREAM_CODES`, `PATCH_DAY_CURRENCY`, `WUWA_PATCH_TIDES`, `PATCH_DAY_HOUR`, `LIVESTREAM_HOUR`; both `daily-income.ts` and `event-rewards.ts` import from it.
Verify: projected and accrued amounts unchanged (values identical, single source).

### Step 2.4 — Update stale docs
- Fix `probability.ts` weapon docstring (fate points → 50/50).
- Fix CLAUDE.md: combat rewards DO modify snapshots (or will match whatever Step 1.8 decides); remove `reverseCombatRewardInflation` mention after 1.3.

---

## Phase 3 — Coupled decisions (feature intent)

### Step 3.1 — **[DECISION]** `characters` table
Audit ref: D2/E2.
- Option A (recommended): keep. CLAUDE.md documents character registration as planned scope for the pull tracker (ID → name mapping). Costs nothing but two sync branches.
- Option B: remove type, Dexie table (schema bump), sync branches, and drop the Supabase table.

### Step 3.2 — **[DECISION]** `weaponFatePoints` plumbing
Audit ref: C3/D2.
- Option A (recommended): remove the `_fatePoints` param from the probability functions and the three call-site variables; keep the DB column dormant (no schema churn, format compatibility).
- Option B: full removal including DB column and sync mapping (schema bump + Supabase migration).
- Option C: implement fate points properly (only worth it if a tracked game reintroduces them).

### Step 3.3 — **[DECISION]** `bannerDurationDays`
- Option A (recommended): keep (planned Uma manual banner durations, matches CLAUDE.md).
- Option B: remove editor input + field.

### Step 3.4 — **[DECISION]** Monthly pull item projection asymmetry
Audit ref: D5/E5.
- Option A: add a monthly accrual counterpart so projections and reality match.
- Option B (recommended): remove the monthly projection block; projections become slightly conservative but never promise phantom resources.

---

## Phase 4 — Hygiene (low priority)

- 4.1 `timeline.ts`: return copies of override dates (`new Date(hardcoded.phase1Start)`), not references.
- 4.2 `timeline-view.tsx`: revoke portrait object URLs on unmount.
- 4.3 Uma pity-model guard: throw or console.warn if `getCharRateTable("uma")` is ever called.
- 4.4 Align Uma "next banner" selection between Dashboard (start-of-day) and timeline (strict > now).
- 4.5 Keep `Pulls.tsx` + parsers + item-name tables dormant as planned scope (no action).

---

## Commit strategy

One commit per step (1.1–1.7 individually, 2.1–2.4 can merge into two commits, phase 3 per decision). Run `tsc --noEmit` + `vite build` before each commit. Push after Phase 1 so correctness fixes deploy immediately; phases 2–4 can ride together.

## Decisions needed before starting

| # | Question | Recommendation |
|---|---|---|
| 1.8 | Auto-convert currency in all accumulators, or none? | None (remove conversion, manual → button only) |
| 1.9 | Seed timeline only when empty? | Yes |
| 1.10 | Unify projection horizon across views? | Yes, now → banner date |
| 1.11 | Editor spark count field | Remove it |
| 3.1 | `characters` table | Keep (planned feature) |
| 3.2 | `weaponFatePoints` | Strip params, keep DB column |
| 3.3 | `bannerDurationDays` | Keep |
| 3.4 | Monthly pull projection | Remove projection block |
