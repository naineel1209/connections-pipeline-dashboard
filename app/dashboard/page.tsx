import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { createClient } from "@/lib/supabase/server";
import type { Connection, Opening, Profile } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: connections, error: connectionError }, { data: openings, error: openingError }, { data: profile }] = await Promise.all([
    supabase.from("connections").select("id,opening_id,name,profile_url,status,notes,date_added,sort_order,opening:openings(id,company,role,job_url,applied_on_portal,is_open)").order("sort_order"),
    supabase.from("openings").select("id,company,role,job_url,applied_on_portal,is_open,created_at").order("created_at", { ascending: false }),
    supabase.from("profiles").select("full_name,headline,message_template").single(),
  ]);
  if (connectionError || openingError) throw new Error(connectionError?.message || openingError?.message);
  const normalizedConnections = (connections ?? []).map((connection) => ({
    ...connection,
    opening: Array.isArray(connection.opening) ? connection.opening[0] : connection.opening,
  })).filter((connection) => Boolean(connection.opening)) as unknown as Connection[];
  return <DashboardClient initialConnections={normalizedConnections} initialOpenings={(openings ?? []) as Opening[]} profile={(profile ?? {}) as Profile} email={user.email ?? ""} />;
}
