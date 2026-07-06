import { supabase } from "./supabase"
import { db, type ResourceSnapshot, type TimelineEntry, type PullRecord, type CharacterRegistration, type CombatRewardClaim, type EventRewardClaim, type TaskItem } from "./db"

/**
 * Pulls all data from Supabase into local Dexie tables.
 * Called on login. Clears local tables first to avoid conflicts.
 * All 6 Supabase queries run in parallel for speed.
 */
export async function pullFromCloud(): Promise<void> {
  // Safety guard: never let older cloud data overwrite newer local data,
  // regardless of who called us or why.
  const [guardLocalTs, guardCloudTs] = await Promise.all([
    latestLocalUpdate(),
    latestCloudUpdate(),
  ])
  if (guardLocalTs && guardLocalTs > guardCloudTs) {
    console.warn(`[sync] Pull BLOCKED: local is newer (${guardLocalTs} > ${guardCloudTs || "none"})`)
    return
  }

  // Fetch all tables in parallel. fetchAllRows paginates past Supabase's
  // 1000-row response cap — without it, tables beyond 1000 rows silently
  // return only the OLDEST 1000 rows and the newest data never arrives.
  const [
    cloudResources,
    cloudTimeline,
    cloudPulls,
    cloudCharacters,
    cloudCombatClaims,
    cloudEventClaims,
    cloudTasks,
  ] = await Promise.all([
    fetchAllRows("resources"),
    fetchAllRows("timeline"),
    fetchAllRows("pulls"),
    fetchAllRows("characters"),
    fetchAllRows("combat_claims"),
    fetchAllRows("event_claims"),
    fetchAllRows("tasks"),
  ])
  console.log(`[sync] Pull: ${cloudResources.length} resources, ${cloudTimeline.length} timeline, ${cloudPulls.length} pulls`)

  // --- Resources ---
  if (cloudResources && cloudResources.length > 0) {
    await db.resources.clear()
    const mapped = cloudResources.map(r => ({
      gameId: r.game_id,
      updatedAt: r.updated_at,
      currency: r.currency,
      pullItems: r.pull_items,
      weaponPullItems: r.weapon_pull_items,
      paidCurrency: r.paid_currency,
      currentPity: r.current_pity,
      isGuaranteed: r.is_guaranteed,
      weaponCurrentPity: r.weapon_current_pity,
      weaponIsGuaranteed: r.weapon_is_guaranteed,
      weaponFatePoints: r.weapon_fate_points,
      monthlyPassActive: r.monthly_pass_active,
      monthlyPassExpiry: r.monthly_pass_expiry,
      dailyCommissionsActive: r.daily_commissions_active,
      secondaryPullItems: r.secondary_pull_items,
      charSparkCount: r.char_spark_count,
      supportSparkCount: r.support_spark_count,
      _cloudId: r.id,
    }))
    await db.resources.bulkAdd(mapped as unknown as ResourceSnapshot[])
  }

  // --- Timeline (data first, portraits downloaded in background) ---
  const portraitDownloads: { dexieId: number; url: string; isRecovery?: boolean }[] = []
  if (cloudTimeline && cloudTimeline.length > 0) {
    await db.timeline.clear()
    for (const t of cloudTimeline) {
      const dexieId = await db.timeline.add({
        gameId: t.game_id,
        version: t.version,
        phase: t.phase,
        startDate: t.start_date,
        characterName: t.character_name,
        characterPortrait: null, // filled in background
        portraitPath: t.character_portrait_url ?? null,
        valueTier: t.value_tier,
        isSpeculation: t.is_speculation,
        isPriority: t.is_priority,
        pullStatus: t.pull_status,
        pullingWeapon: t.pulling_weapon,
        bannerLane: t.banner_lane ?? undefined,
        bannerDurationDays: t.banner_duration_days ?? undefined,
        rateUpPercent: t.rate_up_percent ?? undefined,
        sparkCount: t.spark_count ?? undefined,
        dupeCount: t.dupe_count ?? undefined,
        dateOverride: t.date_override ?? undefined,
      } as unknown as TimelineEntry)

      if (t.character_portrait_url && dexieId) {
        portraitDownloads.push({ dexieId: dexieId as number, url: t.character_portrait_url })
      } else if (t.character_name && dexieId) {
        // Recovery: earlier syncs wiped character_portrait_url, but the blob may
        // still exist in Storage at its deterministic path. Try to restore it.
        portraitDownloads.push({
          dexieId: dexieId as number,
          url: portraitStoragePath(t.game_id, t.version, t.phase, t.character_name),
          isRecovery: true,
        })
      }
    }
  }

  // --- Pulls ---
  if (cloudPulls && cloudPulls.length > 0) {
    await db.pulls.clear()
    const mapped = cloudPulls.map(p => ({
      gameId: p.game_id,
      bannerType: p.banner_type,
      itemId: p.item_id,
      itemName: p.item_name,
      rarity: p.rarity,
      pity: p.pity,
      timestamp: p.timestamp,
      isRateUp: p.is_rate_up,
      rawData: p.raw_data ?? {},
      _cloudId: p.id,
    }))
    await db.pulls.bulkAdd(mapped as unknown as PullRecord[])
  }

  // --- Characters ---
  if (cloudCharacters && cloudCharacters.length > 0) {
    await db.characters.clear()
    const mapped = cloudCharacters.map(c => ({
      gameId: c.game_id,
      displayName: c.display_name,
      internalId: c.internal_id,
      portrait: null,
      releaseVersion: c.release_version,
      releasePhase: c.release_phase,
      releaseDate: c.release_date,
      valueTier: c.value_tier,
      _cloudId: c.id,
    }))
    await db.characters.bulkAdd(mapped as unknown as CharacterRegistration[])
  }

  // --- Combat Claims ---
  if (cloudCombatClaims && cloudCombatClaims.length > 0) {
    await db.combatClaims.clear()
    const mapped = cloudCombatClaims.map(c => ({
      modeId: c.mode_id,
      resetDate: c.reset_date,
      amount: c.amount,
      claimedAt: c.claimed_at,
      _cloudId: c.id,
    }))
    await db.combatClaims.bulkAdd(mapped as unknown as CombatRewardClaim[])
  }

  // --- Event Claims ---
  if (cloudEventClaims && cloudEventClaims.length > 0) {
    await db.eventClaims.clear()
    const mapped = cloudEventClaims.map(e => ({
      eventKey: e.event_key,
      gameId: e.game_id,
      eventType: e.event_type,
      version: e.version,
      amount: e.amount,
      claimedAt: e.claimed_at,
      _cloudId: e.id,
    }))
    await db.eventClaims.bulkAdd(mapped as unknown as EventRewardClaim[])
  }

  // --- Tasks ---
  if (cloudTasks && cloudTasks.length > 0) {
    await db.tasks.clear()
    const mapped = cloudTasks.map(t => ({
      gameId: t.game_id,
      name: t.name,
      type: t.type,
      isCompleted: t.is_completed,
      completedAt: t.completed_at,
      sortOrder: t.sort_order,
      scheduledTime: t.scheduled_time ?? undefined,
      _cloudId: t.id,
    }))
    await db.tasks.bulkAdd(mapped as unknown as TaskItem[])
  }

  // Deduplicate in case cloud had duplicates
  await deduplicateTimeline()

  // Start background portrait downloads (non-blocking)
  if (portraitDownloads.length > 0) {
    downloadPortraitsInBackground(portraitDownloads)
  }
}

/**
 * Fetches ALL rows from a cloud table, paginating past the 1000-row
 * PostgREST response cap. Throws on any query error — Supabase does not.
 * Ordered by id so pagination windows are stable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(table: string): Promise<any[]> {
  const PAGE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[sync] Pull failed on ${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

/**
 * Keeps only the newest N resource snapshots per game in Dexie.
 * Every save and accumulation adds a snapshot; without pruning the table
 * grows past the 1000-row pull cap and sync starts corrupting itself.
 */
export async function pruneResourceHistory(keepPerGame = 30): Promise<number> {
  const all = await db.resources.toArray()
  const byGame = new Map<string, ResourceSnapshot[]>()
  for (const r of all) {
    const arr = byGame.get(r.gameId) ?? []
    arr.push(r)
    byGame.set(r.gameId, arr)
  }

  const toDelete: number[] = []
  for (const snaps of byGame.values()) {
    if (snaps.length <= keepPerGame) continue
    snaps.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)) // newest first
    for (const old of snaps.slice(keepPerGame)) {
      if (old.id != null) toDelete.push(old.id)
    }
  }

  if (toDelete.length > 0) {
    await db.resources.bulkDelete(toDelete)
    console.log(`[sync] Pruned ${toDelete.length} old resource snapshot(s)`)
  }
  return toDelete.length
}

/** Builds the deterministic Storage path for a timeline portrait. */
export function portraitStoragePath(
  gameId: string,
  version: string,
  phase: number,
  characterName: string | null
): string {
  const safeName = (characterName ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
  return `timeline/${gameId}/${version}-p${phase}-${safeName}.png`
}

/** Event name fired whenever background portrait downloads write new blobs to Dexie. */
export const PORTRAITS_UPDATED_EVENT = "crvn-portraits-updated"

/** Event name fired after reward accumulations update resource snapshots in Dexie. */
export const RESOURCES_UPDATED_EVENT = "crvn-resources-updated"

/**
 * Deletes a portrait file from Supabase Storage.
 * Call when the user explicitly removes a portrait, so the
 * pull-time recovery logic doesn't resurrect it from Storage.
 */
export async function deletePortraitFromStorage(
  gameId: string,
  version: string,
  phase: number,
  characterName: string | null
): Promise<void> {
  try {
    await supabase.storage
      .from("portraits")
      .remove([portraitStoragePath(gameId, version, phase, characterName)])
  } catch { /* best effort */ }
}

/**
 * Downloads portrait blobs from Supabase Storage in parallel
 * and updates Dexie entries as they arrive. Runs after the page loads.
 * Dispatches PORTRAITS_UPDATED_EVENT so mounted views can re-read Dexie.
 */
async function downloadPortraitsInBackground(
  downloads: { dexieId: number; url: string; isRecovery?: boolean }[]
): Promise<void> {
  const BATCH_SIZE = 5
  let anyDownloaded = false
  for (let i = 0; i < downloads.length; i += BATCH_SIZE) {
    const batch = downloads.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async ({ dexieId, url, isRecovery }) => {
        try {
          const { data } = await supabase.storage
            .from("portraits")
            .download(url)
          if (data) {
            // On recovery, also restore the path so the next push re-links the cloud row
            await db.timeline.update(dexieId, isRecovery
              ? { characterPortrait: data, portraitPath: url }
              : { characterPortrait: data })
            anyDownloaded = true
          }
        } catch { /* portrait missing, skip */ }
      })
    )
    if (anyDownloaded) {
      window.dispatchEvent(new CustomEvent(PORTRAITS_UPDATED_EVENT))
    }
  }
}

/**
 * Deduplicates timeline entries in Dexie.
 * Keeps the entry with the most user data (character name, portrait, non-default status).
 * Removes duplicate entries that share the same gameId + version + phase.
 */
export async function deduplicateTimeline(): Promise<number> {
  const entries = await db.timeline.toArray()
  const seen = new Map<string, { id: number; score: number }>()
  const toDelete: number[] = []

  for (const e of entries) {
    const key = `${e.gameId}:${e.version}:${e.phase}`
    // Score entries: prefer entries with user data
    let score = 0
    if (e.characterName) score += 10
    if (e.characterPortrait) score += 5
    if (e.pullStatus && e.pullStatus !== "none") score += 3
    if (e.isPriority) score += 2
    if (e.pullingWeapon) score += 1
    if (e.dateOverride) score += 4
    score += (e.id ?? 0) // tiebreak: higher ID = more recent insert

    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, { id: e.id!, score })
    } else if (score > existing.score) {
      toDelete.push(existing.id)
      seen.set(key, { id: e.id!, score })
    } else {
      toDelete.push(e.id!)
    }
  }

  if (toDelete.length > 0) {
    await db.timeline.bulkDelete(toDelete)
    console.log(`[sync] Deduplicated timeline: removed ${toDelete.length} duplicate(s)`)
  }

  return toDelete.length
}

/** Mutex to prevent overlapping pushToCloud calls from creating duplicates */
let pushInProgress: Promise<void> | null = null

/**
 * Pushes all local Dexie data to Supabase.
 * Clears cloud tables first, then inserts all local rows.
 * Serialized: if a push is already in progress, waits for it then runs again.
 */
export async function pushToCloud(): Promise<void> {
  if (pushInProgress) {
    await pushInProgress
  }
  pushInProgress = _pushToCloudImpl()
  try {
    await pushInProgress
  } finally {
    pushInProgress = null
  }
}

async function _pushToCloudImpl(): Promise<void> {
  // Safety guard: never let older local data overwrite newer cloud data
  // (e.g., a stale tab firing its post-accumulation push).
  const [guardLocalTs, guardCloudTs] = await Promise.all([
    latestLocalUpdate(),
    latestCloudUpdate(),
  ])
  if (guardCloudTs && guardCloudTs > guardLocalTs) {
    console.warn(`[sync] Push BLOCKED: cloud is newer (${guardCloudTs} > ${guardLocalTs || "none"})`)
    return
  }

  // Keep snapshot history bounded so the cloud table never exceeds the
  // 1000-row pull cap again. Newest snapshots are always kept.
  await pruneResourceHistory()

  // Read all local data in parallel
  const [localResources, localTimeline, localPulls, localCharacters, localCombatClaims, localEventClaims, localTasks] = await Promise.all([
    db.resources.toArray(),
    db.timeline.toArray(),
    db.pulls.toArray(),
    db.characters.toArray(),
    db.combatClaims.toArray(),
    db.eventClaims.toArray(),
    db.tasks.toArray(),
  ])

  // Supabase returns { error } instead of throwing — every result must be
  // checked or failures pass silently and the cloud is left stale/partial.
  const errors: string[] = []
  const check = (label: string) => (res: { error: { message: string } | null }) => {
    if (res.error) errors.push(`${label}: ${res.error.message}`)
    return res
  }

  // Clear all cloud tables in parallel
  await Promise.all([
    supabase.from("resources").delete().neq("id", 0).then(check("delete resources")),
    supabase.from("timeline").delete().neq("id", 0).then(check("delete timeline")),
    supabase.from("pulls").delete().neq("id", 0).then(check("delete pulls")),
    supabase.from("characters").delete().neq("id", 0).then(check("delete characters")),
    supabase.from("combat_claims").delete().neq("id", 0).then(check("delete combat_claims")),
    supabase.from("event_claims").delete().neq("id", 0).then(check("delete event_claims")),
    supabase.from("tasks").delete().neq("id", 0).then(check("delete tasks")),
  ])
  if (errors.length > 0) {
    throw new Error(`[sync] Push failed during delete: ${errors.join("; ")}`)
  }

  // --- Timeline (sequential due to portrait uploads) ---
  if (localTimeline.length > 0) {
    const mapped = []
    for (const t of localTimeline) {
      // Preserve the known Storage path even when the blob hasn't been
      // downloaded locally yet (background download still in flight).
      // Overwriting it with null here is what wiped portraits from the cloud.
      let portraitPath: string | null = t.portraitPath ?? null

      if (t.characterPortrait) {
        portraitPath = portraitStoragePath(t.gameId, t.version, t.phase, t.characterName)
        const { error: uploadErr } = await supabase.storage
          .from("portraits")
          .upload(portraitPath, t.characterPortrait, {
            upsert: true,
            contentType: "image/png",
          })
        // Portrait upload failure shouldn't abort the data push; keep the
        // path (file may already exist from a previous upload) and log it.
        if (uploadErr) console.warn(`[sync] Portrait upload failed for ${portraitPath}: ${uploadErr.message}`)
      }

      mapped.push({
        game_id: t.gameId,
        version: t.version,
        phase: t.phase,
        start_date: t.startDate,
        character_name: t.characterName,
        character_portrait_url: portraitPath,
        value_tier: t.valueTier,
        is_speculation: t.isSpeculation,
        is_priority: t.isPriority,
        pull_status: t.pullStatus,
        pulling_weapon: t.pullingWeapon,
        banner_lane: t.bannerLane ?? null,
        banner_duration_days: t.bannerDurationDays ?? null,
        rate_up_percent: t.rateUpPercent ?? null,
        spark_count: t.sparkCount ?? null,
        dupe_count: t.dupeCount ?? null,
        date_override: t.dateOverride ?? null,
      })
    }
    check("insert timeline")(await supabase.from("timeline").insert(mapped))
  }

  // Insert remaining tables in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertOps: PromiseLike<any>[] = []

  if (localResources.length > 0) {
    const mapped = localResources.map(r => ({
      game_id: r.gameId,
      updated_at: r.updatedAt,
      currency: r.currency,
      pull_items: r.pullItems,
      weapon_pull_items: r.weaponPullItems ?? 0,
      paid_currency: r.paidCurrency ?? 0,
      current_pity: r.currentPity,
      is_guaranteed: r.isGuaranteed,
      weapon_current_pity: r.weaponCurrentPity ?? 0,
      weapon_is_guaranteed: r.weaponIsGuaranteed ?? false,
      weapon_fate_points: r.weaponFatePoints ?? 0,
      monthly_pass_active: r.monthlyPassActive,
      monthly_pass_expiry: r.monthlyPassExpiry,
      daily_commissions_active: r.dailyCommissionsActive ?? false,
      secondary_pull_items: r.secondaryPullItems ?? 0,
      char_spark_count: r.charSparkCount ?? 0,
      support_spark_count: r.supportSparkCount ?? 0,
    }))
    insertOps.push(supabase.from("resources").insert(mapped).then(check("insert resources")))
  }

  if (localPulls.length > 0) {
    for (let i = 0; i < localPulls.length; i += 500) {
      const batch = localPulls.slice(i, i + 500)
      const mapped = batch.map(p => ({
        game_id: p.gameId,
        banner_type: p.bannerType,
        item_id: p.itemId,
        item_name: p.itemName,
        rarity: p.rarity,
        pity: p.pity,
        timestamp: p.timestamp,
        is_rate_up: p.isRateUp,
        raw_data: p.rawData ?? {},
      }))
      insertOps.push(supabase.from("pulls").insert(mapped).then(check("insert pulls")))
    }
  }

  if (localCharacters.length > 0) {
    const mapped = localCharacters.map(c => ({
      game_id: c.gameId,
      display_name: c.displayName,
      internal_id: c.internalId,
      portrait_url: null,
      release_version: c.releaseVersion,
      release_phase: c.releasePhase,
      release_date: c.releaseDate,
      value_tier: c.valueTier,
    }))
    insertOps.push(supabase.from("characters").insert(mapped).then(check("insert characters")))
  }

  if (localCombatClaims.length > 0) {
    const mapped = localCombatClaims.map(c => ({
      mode_id: c.modeId,
      reset_date: c.resetDate,
      amount: c.amount,
      claimed_at: c.claimedAt,
    }))
    insertOps.push(supabase.from("combat_claims").insert(mapped).then(check("insert combat_claims")))
  }

  if (localEventClaims.length > 0) {
    const mapped = localEventClaims.map(e => ({
      event_key: e.eventKey,
      game_id: e.gameId,
      event_type: e.eventType,
      version: e.version,
      amount: e.amount,
      claimed_at: e.claimedAt,
    }))
    insertOps.push(supabase.from("event_claims").insert(mapped).then(check("insert event_claims")))
  }

  if (localTasks.length > 0) {
    const mapped = localTasks.map(t => ({
      game_id: t.gameId,
      name: t.name,
      type: t.type,
      is_completed: t.isCompleted,
      completed_at: t.completedAt,
      sort_order: t.sortOrder,
      scheduled_time: t.scheduledTime ?? null,
    }))
    insertOps.push(supabase.from("tasks").insert(mapped).then(check("insert tasks")))
  }

  await Promise.all(insertOps)

  if (errors.length > 0) {
    throw new Error(`[sync] Push failed during insert: ${errors.join("; ")}`)
  }
  console.log(`[sync] Push OK: ${localResources.length} resources, ${localTimeline.length} timeline, ${localPulls.length} pulls`)
}

/**
 * Checks if cloud has any data for the current user.
 */
export async function cloudHasData(): Promise<boolean> {
  const { count, error } = await supabase
    .from("resources")
    .select("*", { count: "exact", head: true })
  if (error) throw new Error(`[sync] cloudHasData failed: ${error.message}`)
  return (count ?? 0) > 0
}

/**
 * Checks if local Dexie has any data.
 */
export async function localHasData(): Promise<boolean> {
  const resourceCount = await db.resources.count()
  const timelineCount = await db.timeline.count()
  return resourceCount > 0 || timelineCount > 0
}

/**
 * Latest resource snapshot timestamp in local Dexie.
 * ISO strings compare correctly as plain strings.
 */
export async function latestLocalUpdate(): Promise<string> {
  const all = await db.resources.toArray()
  let max = ""
  for (const r of all) {
    if (r.updatedAt > max) max = r.updatedAt
  }
  return max
}

/**
 * Latest resource snapshot timestamp in the cloud.
 * Throws on query failure — returning "" would make the caller think the
 * cloud is empty and allow a destructive push over unknown cloud state.
 */
export async function latestCloudUpdate(): Promise<string> {
  const { data, error } = await supabase
    .from("resources")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
  if (error) throw new Error(`[sync] latestCloudUpdate failed: ${error.message}`)
  return data?.[0]?.updated_at ?? ""
}
