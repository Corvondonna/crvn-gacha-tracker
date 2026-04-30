import { supabase } from "./supabase"
import { db, type ResourceSnapshot, type TimelineEntry, type PullRecord, type CharacterRegistration, type CombatRewardClaim, type EventRewardClaim } from "./db"

/**
 * Pulls all data from Supabase into local Dexie tables.
 * Called on login. Clears local tables first to avoid conflicts.
 * All 6 Supabase queries run in parallel for speed.
 */
export async function pullFromCloud(): Promise<void> {
  // Fetch all tables in parallel (single network round-trip batch)
  const [
    { data: cloudResources },
    { data: cloudTimeline },
    { data: cloudPulls },
    { data: cloudCharacters },
    { data: cloudCombatClaims },
    { data: cloudEventClaims },
  ] = await Promise.all([
    supabase.from("resources").select("*"),
    supabase.from("timeline").select("*"),
    supabase.from("pulls").select("*"),
    supabase.from("characters").select("*"),
    supabase.from("combat_claims").select("*"),
    supabase.from("event_claims").select("*"),
  ])

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
  const portraitDownloads: { dexieId: number; url: string }[] = []
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
      } as unknown as TimelineEntry)

      if (t.character_portrait_url && dexieId) {
        portraitDownloads.push({ dexieId: dexieId as number, url: t.character_portrait_url })
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

  // Deduplicate in case cloud had duplicates
  await deduplicateTimeline()

  // Start background portrait downloads (non-blocking)
  if (portraitDownloads.length > 0) {
    downloadPortraitsInBackground(portraitDownloads)
  }
}

/**
 * Downloads portrait blobs from Supabase Storage in parallel
 * and updates Dexie entries as they arrive. Runs after the page loads.
 */
async function downloadPortraitsInBackground(
  downloads: { dexieId: number; url: string }[]
): Promise<void> {
  const BATCH_SIZE = 5
  for (let i = 0; i < downloads.length; i += BATCH_SIZE) {
    const batch = downloads.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async ({ dexieId, url }) => {
        try {
          const { data } = await supabase.storage
            .from("portraits")
            .download(url)
          if (data) {
            await db.timeline.update(dexieId, { characterPortrait: data })
          }
        } catch { /* portrait missing, skip */ }
      })
    )
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
  // Read all local data in parallel
  const [localResources, localTimeline, localPulls, localCharacters, localCombatClaims, localEventClaims] = await Promise.all([
    db.resources.toArray(),
    db.timeline.toArray(),
    db.pulls.toArray(),
    db.characters.toArray(),
    db.combatClaims.toArray(),
    db.eventClaims.toArray(),
  ])

  // Clear all cloud tables in parallel
  await Promise.all([
    supabase.from("resources").delete().neq("id", 0),
    supabase.from("timeline").delete().neq("id", 0),
    supabase.from("pulls").delete().neq("id", 0),
    supabase.from("characters").delete().neq("id", 0),
    supabase.from("combat_claims").delete().neq("id", 0),
    supabase.from("event_claims").delete().neq("id", 0),
  ])

  // --- Timeline (sequential due to portrait uploads) ---
  if (localTimeline.length > 0) {
    const mapped = []
    for (const t of localTimeline) {
      let portraitPath: string | null = null

      if (t.characterPortrait) {
        const safeName = (t.characterName ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
        portraitPath = `timeline/${t.gameId}/${t.version}-p${t.phase}-${safeName}.png`
        await supabase.storage
          .from("portraits")
          .upload(portraitPath, t.characterPortrait, {
            upsert: true,
            contentType: "image/png",
          })
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
      })
    }
    await supabase.from("timeline").insert(mapped)
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
    insertOps.push(supabase.from("resources").insert(mapped))
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
      insertOps.push(supabase.from("pulls").insert(mapped))
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
    insertOps.push(supabase.from("characters").insert(mapped))
  }

  if (localCombatClaims.length > 0) {
    const mapped = localCombatClaims.map(c => ({
      mode_id: c.modeId,
      reset_date: c.resetDate,
      amount: c.amount,
      claimed_at: c.claimedAt,
    }))
    insertOps.push(supabase.from("combat_claims").insert(mapped))
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
    insertOps.push(supabase.from("event_claims").insert(mapped))
  }

  await Promise.all(insertOps)
}

/**
 * Checks if cloud has any data for the current user.
 */
export async function cloudHasData(): Promise<boolean> {
  const { count } = await supabase
    .from("resources")
    .select("*", { count: "exact", head: true })
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
 * Checks if cloud timeline entries have any portrait URLs set.
 * Used to detect if portraits have been synced to Storage yet.
 */
export async function cloudHasPortraits(): Promise<boolean> {
  const { data } = await supabase
    .from("timeline")
    .select("character_portrait_url")
    .not("character_portrait_url", "is", null)
    .limit(1)
  return (data?.length ?? 0) > 0
}
