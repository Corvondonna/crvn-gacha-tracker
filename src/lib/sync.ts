import { supabase } from "./supabase"
import { db, type ResourceSnapshot, type TimelineEntry, type PullRecord, type CharacterRegistration, type CombatRewardClaim, type EventRewardClaim } from "./db"

/**
 * Pulls all data from Supabase into local Dexie tables.
 * Called on login. Clears local tables first to avoid conflicts.
 */
export async function pullFromCloud(): Promise<void> {
  // --- Resources ---
  const { data: cloudResources } = await supabase.from("resources").select("*")
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

  // --- Timeline ---
  const { data: cloudTimeline } = await supabase.from("timeline").select("*")
  if (cloudTimeline && cloudTimeline.length > 0) {
    await db.timeline.clear()
    const mapped = cloudTimeline.map(t => ({
      gameId: t.game_id,
      version: t.version,
      phase: t.phase,
      startDate: t.start_date,
      characterName: t.character_name,
      characterPortrait: null, // portraits handled via Storage
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
      _cloudId: t.id,
    }))
    await db.timeline.bulkAdd(mapped as unknown as TimelineEntry[])
  }

  // --- Pulls ---
  const { data: cloudPulls } = await supabase.from("pulls").select("*")
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
  const { data: cloudCharacters } = await supabase.from("characters").select("*")
  if (cloudCharacters && cloudCharacters.length > 0) {
    await db.characters.clear()
    const mapped = cloudCharacters.map(c => ({
      gameId: c.game_id,
      displayName: c.display_name,
      internalId: c.internal_id,
      portrait: null, // portraits handled via Storage
      releaseVersion: c.release_version,
      releasePhase: c.release_phase,
      releaseDate: c.release_date,
      valueTier: c.value_tier,
      _cloudId: c.id,
    }))
    await db.characters.bulkAdd(mapped as unknown as CharacterRegistration[])
  }

  // --- Combat Claims ---
  const { data: cloudCombatClaims } = await supabase.from("combat_claims").select("*")
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
  const { data: cloudEventClaims } = await supabase.from("event_claims").select("*")
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
}

/**
 * Pushes all local Dexie data to Supabase.
 * Clears cloud tables first, then inserts all local rows.
 * Called after local changes or on a manual sync trigger.
 */
export async function pushToCloud(): Promise<void> {
  // --- Resources ---
  const localResources = await db.resources.toArray()
  await supabase.from("resources").delete().neq("id", 0) // clear all user rows (RLS scoped)
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
    await supabase.from("resources").insert(mapped)
  }

  // --- Timeline ---
  const localTimeline = await db.timeline.toArray()
  await supabase.from("timeline").delete().neq("id", 0)
  if (localTimeline.length > 0) {
    const mapped = localTimeline.map(t => ({
      game_id: t.gameId,
      version: t.version,
      phase: t.phase,
      start_date: t.startDate,
      character_name: t.characterName,
      character_portrait_url: null,
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
    }))
    await supabase.from("timeline").insert(mapped)
  }

  // --- Pulls ---
  const localPulls = await db.pulls.toArray()
  await supabase.from("pulls").delete().neq("id", 0)
  if (localPulls.length > 0) {
    // Insert in batches of 500 (Supabase has row limits per request)
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
      await supabase.from("pulls").insert(mapped)
    }
  }

  // --- Characters ---
  const localCharacters = await db.characters.toArray()
  await supabase.from("characters").delete().neq("id", 0)
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
    await supabase.from("characters").insert(mapped)
  }

  // --- Combat Claims ---
  const localCombatClaims = await db.combatClaims.toArray()
  await supabase.from("combat_claims").delete().neq("id", 0)
  if (localCombatClaims.length > 0) {
    const mapped = localCombatClaims.map(c => ({
      mode_id: c.modeId,
      reset_date: c.resetDate,
      amount: c.amount,
      claimed_at: c.claimedAt,
    }))
    await supabase.from("combat_claims").insert(mapped)
  }

  // --- Event Claims ---
  const localEventClaims = await db.eventClaims.toArray()
  await supabase.from("event_claims").delete().neq("id", 0)
  if (localEventClaims.length > 0) {
    const mapped = localEventClaims.map(e => ({
      event_key: e.eventKey,
      game_id: e.gameId,
      event_type: e.eventType,
      version: e.version,
      amount: e.amount,
      claimed_at: e.claimedAt,
    }))
    await supabase.from("event_claims").insert(mapped)
  }
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
