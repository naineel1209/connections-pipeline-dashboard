"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, type ConnectionInput, type OpeningInput, type ProfileInput, type Status } from "@/lib/types";

type Result = { error?: string; id?: string; profileCount?: number; createdOpening?: boolean };

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must sign in first.");
  return { supabase, user };
}

function cleanText(value: unknown, maximum = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) || null : null;
}

function normalizeUrl(value: unknown) {
  const text = cleanText(value, 2000);
  if (!text) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol) || !url.hostname) throw new Error();
    return url.toString();
  } catch {
    throw new Error("Enter a valid http or https URL.");
  }
}

function validateDate(value: unknown) {
  const date = cleanText(value, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("The date must use YYYY-MM-DD.");
  return date;
}

function validateOpening(input: OpeningInput) {
  const company = cleanText(input.company, 200);
  if (!company) throw new Error("A company is required.");
  return { company, role: cleanText(input.role, 300), job_url: normalizeUrl(input.job_url), applied_on_portal: Boolean(input.applied_on_portal) };
}

function validateConnection(input: ConnectionInput) {
  const name = cleanText(input.name, 200);
  if (!name) throw new Error("A contact name is required.");
  if (!input.opening_id) throw new Error("Select an opening first.");
  if (!STATUSES.includes(input.status)) throw new Error("The status is not valid.");
  return { opening_id: input.opening_id, name, profile_url: normalizeUrl(input.profile_url), status: input.status, notes: cleanText(input.notes), date_added: validateDate(input.date_added) };
}

async function requireOpening(id: string, ownerId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.from("openings").select("id").eq("id", id).eq("owner_id", ownerId).single();
  if (error || !data) throw new Error("The opening does not exist or is not available.");
}

export async function createOpening(input: OpeningInput): Promise<Result> {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("openings").insert({ ...validateOpening(input), owner_id: user.id }).select("id").single();
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return { id: data.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to create the opening." }; }
}

export async function updateOpening(id: string, input: OpeningInput): Promise<Result> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("openings").update(validateOpening(input)).eq("id", id).eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to update the opening." }; }
}

export async function updateOpeningPortalStatus(id: string, appliedOnPortal: boolean): Promise<Result> {
  try {
    const { supabase, user } = await requireUser();
    await requireOpening(id, user.id, supabase);
    const { error } = await supabase.from("openings").update({ applied_on_portal: Boolean(appliedOnPortal) }).eq("id", id).eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to update the job portal status." }; }
}

export async function closeOpening(id: string): Promise<Result> {
  try {
    const { supabase, user } = await requireUser();
    await requireOpening(id, user.id, supabase);
    const [{ error: openingError }, { error: profilesError }] = await Promise.all([
      supabase.from("openings").update({ is_open: false }).eq("id", id).eq("owner_id", user.id),
      supabase.from("connections").update({ status: "Closed" }).eq("opening_id", id).eq("owner_id", user.id),
    ]);
    if (openingError || profilesError) return { error: openingError?.message || profilesError?.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to close the opening." }; }
}

export async function reopenOpening(id: string): Promise<Result> {
  try {
    const { supabase, user } = await requireUser();
    await requireOpening(id, user.id, supabase);
    const [{ error: openingError }, { error: profilesError }] = await Promise.all([
      supabase.from("openings").update({ is_open: true }).eq("id", id).eq("owner_id", user.id),
      supabase.from("connections").update({ status: "Pending" }).eq("opening_id", id).eq("owner_id", user.id),
    ]);
    if (openingError || profilesError) return { error: openingError?.message || profilesError?.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to reopen the opening." }; }
}

export async function saveConnection(input: ConnectionInput & { id?: string }): Promise<Result> {
  try {
    const { supabase, user } = await requireUser();
    const connection = validateConnection(input);
    await requireOpening(connection.opening_id, user.id, supabase);
    const query = input.id
      ? supabase.from("connections").update(connection).eq("id", input.id).eq("owner_id", user.id)
      : supabase.from("connections").insert({ ...connection, owner_id: user.id, sort_order: Date.now() });
    const { error } = await query;
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to save the profile." }; }
}

export async function bulkCreateProfiles(openingId: string, inputs: ProfileInput[]): Promise<Result> {
  try {
    if (!inputs.length) return { error: "No valid profiles were found." };
    if (inputs.length > 500) return { error: "Add 500 profiles or fewer at one time." };
    const { supabase, user } = await requireUser();
    await requireOpening(openingId, user.id, supabase);
    const dateAdded = new Date().toISOString().slice(0, 10);
    const rows = inputs.map((input, index) => {
      const name = cleanText(input.name, 200);
      if (!name) throw new Error("Each profile needs a name.");
      return { owner_id: user.id, opening_id: openingId, name, profile_url: normalizeUrl(input.profile_url), status: "Pending" as Status, notes: null, date_added: dateAdded, sort_order: Date.now() + index };
    });
    const { error } = await supabase.from("connections").insert(rows);
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to add the profiles." }; }
}

export async function createOpeningWithProfiles(openingInput: OpeningInput, profiles: ProfileInput[]): Promise<Result> {
  try {
    const opening = validateOpening(openingInput);
    if (!profiles.length) return { error: "Add at least one valid profile." };
    if (profiles.length > 500) return { error: "Add 500 profiles or fewer at one time." };

    const { supabase, user } = await requireUser();
    const { data: existing, error: searchError } = await supabase
      .from("openings")
      .select("id, company, role, job_url")
      .eq("owner_id", user.id)
      .eq("is_open", true);
    if (searchError) return { error: searchError.message };

    const sameOpening = existing?.find((item) => item.company === opening.company
      && item.role === opening.role
      && item.job_url === opening.job_url);
    let openingId = sameOpening?.id;
    let createdOpening = false;

    if (!openingId) {
      const { data, error } = await supabase
        .from("openings")
        .insert({ ...opening, owner_id: user.id })
        .select("id")
        .single();
      if (error || !data) return { error: error?.message || "Unable to create the opening." };
      openingId = data.id;
      createdOpening = true;
    }

    const dateAdded = new Date().toISOString().slice(0, 10);
    const rows = profiles.map((input, index) => {
      const name = cleanText(input.name, 200);
      if (!name) throw new Error("Each profile needs a name.");
      return {
        owner_id: user.id,
        opening_id: openingId,
        name,
        profile_url: normalizeUrl(input.profile_url),
        status: "Pending" as Status,
        notes: null,
        date_added: dateAdded,
        sort_order: Date.now() + index,
      };
    });
    const { error } = await supabase.from("connections").insert(rows);
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return { id: openingId, profileCount: rows.length, createdOpening };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to add the opening and profiles." };
  }
}

export async function deleteConnection(id: string): Promise<Result> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("connections").delete().eq("id", id).eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to delete the profile." }; }
}

export async function updateConnectionStatus(id: string, status: Status): Promise<Result> {
  if (!STATUSES.includes(status)) return { error: "The status is not valid." };
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("connections").update({ status }).eq("id", id).eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to update the profile." }; }
}

export async function reorderConnections(items: Array<{ id: string; status: Status; sort_order: number }>): Promise<Result> {
  if (items.length > 500 || items.some((item) => !STATUSES.includes(item.status))) return { error: "The order data is not valid." };
  try {
    const { supabase, user } = await requireUser();
    const results = await Promise.all(items.map((item) => supabase.from("connections").update({ status: item.status, sort_order: item.sort_order }).eq("id", item.id).eq("owner_id", user.id)));
    const failure = results.find(({ error }) => error);
    if (failure?.error) return { error: failure.error.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to update the order." }; }
}

export async function saveProfile(input: { full_name: string; headline: string; message_template: string }): Promise<Result> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").upsert({ id: user.id, full_name: cleanText(input.full_name, 200), headline: cleanText(input.headline, 300), message_template: cleanText(input.message_template, 10000) });
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to save the profile settings." }; }
}
