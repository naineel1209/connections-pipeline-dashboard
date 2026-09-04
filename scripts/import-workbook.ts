import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readConnectionsWorkbook, workbookSourceKey } from "../lib/workbook";

dotenv.config({ path: ".env.local" });
dotenv.config();

const workbookPath = process.argv[2];
const ownerEmail = process.env.SEED_OWNER_EMAIL;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function openingKey(company: string, role: string | null, jobUrl: string | null) {
  return [company, role || "", jobUrl || ""].join("\u001f");
}

async function main() {
  if (!workbookPath || !ownerEmail || !url || !serviceKey) {
    throw new Error("Use: npm run import:workbook -- /absolute/path/Jobs\\ Tracker.xlsx. Set SEED_OWNER_EMAIL and Supabase environment variables.");
  }
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userPage, error: userError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (userError) throw userError;
  const owner = userPage.users.find((user) => user.email?.toLowerCase() === ownerEmail.toLowerCase());
  if (!owner) throw new Error(`No Google user exists for ${ownerEmail}. Sign in once before importing.`);
  const rows = readConnectionsWorkbook(path.resolve(workbookPath));
  if (rows.length !== 117) throw new Error(`Expected 117 profile records, but found ${rows.length}.`);
  const { data: existingOpenings, error: openingReadError } = await supabase.from("openings").select("id,company,role,job_url").eq("owner_id", owner.id);
  if (openingReadError) throw openingReadError;
  const openings = new Map((existingOpenings ?? []).map((opening) => [openingKey(opening.company, opening.role, opening.job_url), opening.id]));
  for (const row of rows) {
    const company = row.company || "Unspecified company";
    const key = openingKey(company, row.role, row.job_url);
    if (openings.has(key)) continue;
    const isOpen = rows.some((candidate) => openingKey(candidate.company || "Unspecified company", candidate.role, candidate.job_url) === key && candidate.status !== "Closed");
    const { data, error } = await supabase.from("openings").insert({ owner_id: owner.id, company, role: row.role, job_url: row.job_url, is_open: isOpen }).select("id").single();
    if (error) throw error;
    openings.set(key, data.id);
  }
  const payload = rows.map((row, index) => ({
    owner_id: owner.id,
    opening_id: openings.get(openingKey(row.company || "Unspecified company", row.role, row.job_url)),
    name: row.name,
    profile_url: row.profile_url,
    status: row.status,
    notes: row.notes,
    date_added: row.date_added,
    sort_order: index,
    source_key: workbookSourceKey(row, index),
  }));
  if (payload.some((row) => !row.opening_id)) throw new Error("Each workbook profile must link to an opening.");
  const { error: importError } = await supabase.from("connections").upsert(payload, { onConflict: "owner_id,source_key" });
  if (importError) throw importError;
  const { data: inserted, error: checkError } = await supabase.from("connections").select("id,opening_id,status,source_key").eq("owner_id", owner.id).like("source_key", "workbook-%");
  if (checkError) throw checkError;
  const expectedStatuses = Object.fromEntries([...new Set(rows.map((row) => row.status))].map((status) => [status, rows.filter((row) => row.status === status).length]));
  const actualStatuses = Object.fromEntries(Object.keys(expectedStatuses).map((status) => [status, (inserted ?? []).filter((row) => row.status === status).length]));
  if ((inserted ?? []).length !== rows.length || (inserted ?? []).some((row) => !row.opening_id) || JSON.stringify(actualStatuses) !== JSON.stringify(expectedStatuses)) throw new Error("Import verification failed. Profile count, opening links, or statuses changed.");
  console.log(`Imported and verified ${inserted.length} profiles for ${ownerEmail}.`);
  console.log(JSON.stringify(actualStatuses));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
