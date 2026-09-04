import { createClient } from "@/lib/supabase/server";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await supabase.from("connections")
    .select("name,profile_url,status,notes,date_added,opening:openings(company,role,job_url)")
    .order("sort_order");
  if (error) return new Response(error.message, { status: 500 });
  const headers = ["Name", "Profile Link", "Target Job", "Job Company", "Job Link", "Status", "Notes", "Date Added"];
  const rows = (data ?? []).map((row) => {
    const opening = Array.isArray(row.opening) ? row.opening[0] : row.opening;
    return [row.name, row.profile_url, opening?.role, opening?.company, opening?.job_url, row.status, row.notes, row.date_added];
  });
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=connections.csv" } });
}
