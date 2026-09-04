"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConnectionForm } from "@/components/dashboard/connection-form";
import { KanbanBoard } from "@/components/dashboard/kanban-board";
import { CompaniesView } from "@/components/dashboard/companies-view";
import { ConnectionsTable } from "@/components/dashboard/connections-table";
import { useDialogFocus } from "@/components/dashboard/use-dialog-focus";
import { createClient } from "@/lib/supabase/client";
import { parseOpeningTsv } from "@/lib/opening-tsv";
import { parseProfileTsv } from "@/lib/profile-tsv";
import { buildActionQueue, type ActionQueueItem } from "@/lib/action-center";
import { defaultMessageTemplate, renderMessageTemplate } from "@/lib/message-template";
import { STATUSES, type Connection, type ConnectionInput, type Opening, type OpeningInput, type Profile, type Status } from "@/lib/types";
import { closeOpening, createOpeningWithProfiles, deleteConnection, reopenOpening, reorderConnections, saveConnection, saveProfile, updateConnectionStatus, updateOpeningPortalStatus } from "./actions";

type View = "Pipeline" | "Companies" | "Actions" | "Table";
type SortOption = "newest" | "oldest" | "company" | "name";

export default function DashboardClient({ initialConnections, initialOpenings, profile, email }: { initialConnections: Connection[]; initialOpenings: Opening[]; profile: Profile; email: string }) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [openings, setOpenings] = useState(initialOpenings);
  const [view, setView] = useState<View>("Pipeline");
  const [search, setSearch] = useState("");
  const [visibleStatuses, setVisibleStatuses] = useState<Set<Status>>(() => new Set(STATUSES));
  const [companyFilters, setCompanyFilters] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortOption>("newest");
  const [editing, setEditing] = useState<Connection>();
  const [batchOpening, setBatchOpening] = useState<Opening>();
  const [batchProfiles, setBatchProfiles] = useState("");
  const [showBatch, setShowBatch] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messageFor, setMessageFor] = useState<Connection>();
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => setConnections(initialConnections), [initialConnections]);
  useEffect(() => setOpenings(initialOpenings), [initialOpenings]);

  const allOpenings = useMemo(() => {
    const byId = new Map<string, Opening>();
    [...initialOpenings, ...openings, ...connections.map((connection) => connection.opening)].forEach((opening) => byId.set(opening.id, opening));
    return [...byId.values()].sort((left, right) => left.company.localeCompare(right.company) || (left.role || "").localeCompare(right.role || ""));
  }, [initialOpenings, openings, connections]);
  const companies = useMemo(() => [...new Set(connections.map((item) => item.opening.company).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [connections]);
  const filtered = useMemo(() => connections.filter((item) => {
    const text = `${item.name} ${item.opening.company} ${item.opening.role ?? ""} ${item.notes ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase()) && visibleStatuses.has(item.status) && (!companyFilters.size || companyFilters.has(item.opening.company));
  }).sort((left, right) => {
    if (sort === "company") return left.opening.company.localeCompare(right.opening.company) || left.name.localeCompare(right.name);
    if (sort === "name") return left.name.localeCompare(right.name);
    const leftDate = left.date_added ? new Date(`${left.date_added}T00:00:00`).valueOf() : 0;
    const rightDate = right.date_added ? new Date(`${right.date_added}T00:00:00`).valueOf() : 0;
    return sort === "newest" ? rightDate - leftDate : leftDate - rightDate;
  }), [connections, search, visibleStatuses, companyFilters, sort]);
  const counts = Object.fromEntries(STATUSES.map((status) => [status, connections.filter((item) => item.status === status).length])) as Record<Status, number>;
  const metrics = [
    { label: "Total Leads", value: connections.length, detail: "Total Outreach Contacts in Pipeline", tone: "total" },
    { label: "Cracked", value: counts.Cracked, detail: "Converted Referrals / Calls Scheduled", tone: "cracked" },
    { label: "Accepted", value: counts.Accepted, detail: "Active Network Connections", tone: "accepted" },
    { label: "Messaged", value: counts.Messaged, detail: "Outreach Sent - Awaiting Reply", tone: "messaged" },
    { label: "Pending", value: counts.Pending, detail: "Queued Leads / Portal Applied", tone: "pending" },
    { label: "Closed", value: counts.Closed, detail: "Positions Closed / Inactive", tone: "closed" },
  ];

  function report(error?: string, success?: string) {
    setNotice(error || success || "Saved.");
    window.setTimeout(() => setNotice(""), 3500);
  }
  function refresh(success?: string) { report(undefined, success); router.refresh(); }
  function save(input: ConnectionInput & { id?: string }) {
    startTransition(async () => {
      const result = await saveConnection(input);
      if (result.error) report(result.error); else { setEditing(undefined); refresh("Profile saved."); }
    });
    return Promise.resolve();
  }
  function remove(connection: Connection) {
    if (!window.confirm(`Delete ${connection.name}?`)) return;
    startTransition(async () => {
      const result = await deleteConnection(connection.id);
      if (result.error) report(result.error); else { setConnections((items) => items.filter((item) => item.id !== connection.id)); refresh("Profile deleted."); }
    });
  }
  function setStatus(connection: Connection, status: Status) {
    const previousStatus = connection.status;
    setConnections((items) => items.map((item) => item.id === connection.id ? { ...item, status } : item));
    startTransition(async () => {
      const result = await updateConnectionStatus(connection.id, status);
      if (result.error) { setConnections((items) => items.map((item) => item.id === connection.id ? { ...item, status: previousStatus } : item)); report(result.error); } else refresh("Status updated.");
    });
  }
  function toggleStatus(status: Status) {
    setVisibleStatuses((current) => {
      const next = new Set(current);
      if (next.has(status) && next.size > 1) next.delete(status); else next.add(status);
      return next;
    });
  }
  function toggleCompany(company: string) {
    setCompanyFilters((current) => {
      const next = new Set(current);
      if (next.has(company)) next.delete(company); else next.add(company);
      return next;
    });
  }
  function move(id: string, status: Status, beforeId?: string) {
    const moved = connections.find((item) => item.id === id);
    if (!moved) return;
    const rest = connections.filter((item) => item.id !== id);
    const target = rest.filter((item) => item.status === status).sort((a, b) => a.sort_order - b.sort_order);
    const index = beforeId ? Math.max(0, target.findIndex((item) => item.id === beforeId)) : target.length;
    target.splice(index, 0, { ...moved, status });
    const ordered = target.map((item, itemIndex) => ({ ...item, sort_order: Date.now() + itemIndex }));
    const next = [...rest, { ...moved, status }].map((item) => item.status === status ? ordered.find((candidate) => candidate.id === item.id) ?? item : item);
    setConnections(next);
    startTransition(async () => {
      const result = await reorderConnections(ordered.map(({ id: profileId, status: profileStatus, sort_order }) => ({ id: profileId, status: profileStatus, sort_order })));
      if (result.error) report(result.error); else refresh("Order saved.");
    });
  }
  function addBatch(input: OpeningInput, profilesText: string) {
    const profiles = parseProfileTsv(profilesText);
    startTransition(async () => {
      const result = await createOpeningWithProfiles(input, profiles);
      if (result.error) { report(result.error); return; }
      setShowBatch(false);
      setBatchOpening(undefined);
      setBatchProfiles("");
      refresh(`${result.profileCount ?? profiles.length} profiles added.`);
    });
  }
  function changeOpening(opening: Opening, action: "close" | "reopen") {
    startTransition(async () => {
      const result = action === "close" ? await closeOpening(opening.id) : await reopenOpening(opening.id);
      if (result.error) report(result.error); else {
        setOpenings((items) => items.map((item) => item.id === opening.id ? { ...item, is_open: action === "reopen" } : item));
        setConnections((items) => items.map((item) => item.opening_id === opening.id ? { ...item, status: action === "close" ? "Closed" : "Pending" } : item));
        refresh(action === "close" ? "Opening closed." : "Opening reopened.");
      }
    });
  }
  function changePortalStatus(opening: Opening, appliedOnPortal: boolean) {
    const previousStatus = opening.applied_on_portal;
    setOpenings((items) => items.map((item) => item.id === opening.id ? { ...item, applied_on_portal: appliedOnPortal } : item));
    setConnections((items) => items.map((item) => item.opening_id === opening.id ? { ...item, opening: { ...item.opening, applied_on_portal: appliedOnPortal } } : item));
    startTransition(async () => {
      const result = await updateOpeningPortalStatus(opening.id, appliedOnPortal);
      if (result.error) {
        setOpenings((items) => items.map((item) => item.id === opening.id ? { ...item, applied_on_portal: previousStatus } : item));
        setConnections((items) => items.map((item) => item.opening_id === opening.id ? { ...item, opening: { ...item.opening, applied_on_portal: previousStatus } } : item));
        report(result.error);
      } else refresh("Job portal status updated.");
    });
  }
  async function signOut() { await createClient().auth.signOut(); router.replace("/login"); router.refresh(); }
  function openBatch(opening?: Opening, profiles = "") { setBatchOpening(opening); setBatchProfiles(profiles); setShowBatch(true); }

  return <main className="dashboard-shell">
    <header className="topbar"><div className="workspace-mark"><span className="logo-mark" aria-hidden="true">C</span><div><p className="eyebrow">PRIVATE WORKSPACE</p><h1>Connections</h1></div></div><div className="topbar-actions"><span className="sync-state">Synced</span><div className="menu-wrap"><button className="secondary-button" onClick={() => setShowMore(!showMore)} aria-expanded={showMore}>More</button>{showMore && <div className="menu-panel right-menu"><button onClick={() => { setView("Table"); setShowMore(false); }}>Data table</button><a href="/api/export">Export CSV</a><button onClick={() => { setShowSettings(true); setShowMore(false); }}>Profile settings</button><button onClick={signOut}>Sign out</button></div>}</div><button className="primary-button" onClick={() => openBatch()}>Add batch</button></div></header>
    <nav className="main-nav" aria-label="Dashboard views">{(["Pipeline", "Companies", "Actions"] as View[]).map((item) => <button key={item} className={view === item ? "nav-item active" : "nav-item"} onClick={() => setView(item)}>{item}</button>)}</nav>
    <section className="dashboard-heading"><div><p className="eyebrow">CONNECTIONS · OUTREACH WORKSPACE</p><h2>{view === "Pipeline" ? "Pipeline overview" : view === "Companies" ? "Company openings" : view === "Actions" ? "Next actions" : "Data table"}</h2><p>{view === "Pipeline" ? "Track every introduction from first touch to referral." : view === "Companies" ? "Track each company role and its profiles." : view === "Actions" ? "Focus on profiles that need attention." : "View every profile in one place."}</p></div><div className="heading-stat"><strong>{connections.length}</strong><span>Total contacts</span></div></section>
    {view === "Pipeline" && <>
      <section className="scorecard-deck" aria-label="Pipeline metrics">{metrics.map((metric) => <article className={`metric-card metric-${metric.tone}`} key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.detail}</span></article>)}</section>
      <section className="pipeline-toolbar" aria-label="Pipeline controls">
        <label className="search-box"><span aria-hidden="true">Search</span><input aria-label="Search connections" placeholder="Search candidate, company, role, or notes..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <details className="company-filter"><summary>{companyFilters.size ? `${companyFilters.size} ${companyFilters.size === 1 ? "Company" : "Companies"}` : "All Companies"}</summary><div className="company-filter-menu"><button type="button" className="clear-companies" onClick={() => setCompanyFilters(new Set())}>All Companies</button>{companies.map((company) => <label key={company}><input type="checkbox" checked={companyFilters.has(company)} onChange={() => toggleCompany(company)} />{company}</label>)}</div></details>
        <div className="stage-filter" aria-label="Visible pipeline stages"><span>Show:</span>{STATUSES.map((status) => <button key={status} className={visibleStatuses.has(status) ? `stage-toggle active ${status.toLowerCase()}` : "stage-toggle"} onClick={() => toggleStatus(status)} aria-pressed={visibleStatuses.has(status)}>{status}</button>)}</div>
        <select aria-label="Sort connections" value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="newest">Date Added (Newest to Oldest)</option><option value="oldest">Date Added (Oldest to Newest)</option><option value="company">Company (A-Z)</option><option value="name">Candidate Name (A-Z)</option></select>
        <p className="view-counter">Showing <strong>{filtered.length}</strong> of <strong>{connections.length}</strong> Contacts</p>
      </section>
    </>}
    {notice && <p className="notice" role="status">{notice}</p>}{pending && <p className="pending" role="status">Saving changes...</p>}
    {view === "Pipeline" && <KanbanBoard connections={filtered} visibleStatuses={visibleStatuses} profile={profile} onEdit={setEditing} onMove={move} onStatus={setStatus} onMessage={setMessageFor} onDelete={remove} />}
    {view === "Companies" && <CompaniesView openings={allOpenings} connections={connections} onEdit={setEditing} onAddProfiles={openBatch} onClose={(opening) => changeOpening(opening, "close")} onReopen={(opening) => changeOpening(opening, "reopen")} visibleStatuses={visibleStatuses} onToggleStatus={toggleStatus} onUpdatePortalStatus={changePortalStatus} pending={pending} />}
    {view === "Actions" && <ActionsView connections={connections} onEdit={setEditing} onMessage={setMessageFor} onStatus={setStatus} onBatch={openBatch} />}
    {view === "Table" && <ConnectionsTable connections={filtered} onEdit={setEditing} onDelete={remove} />}
    {editing && <ConnectionForm connection={editing} openings={allOpenings} onClose={() => setEditing(undefined)} onSave={save} />}
    {showBatch && <BatchTsvDialog opening={batchOpening} initialProfiles={batchProfiles} pending={pending} onClose={() => { setShowBatch(false); setBatchOpening(undefined); setBatchProfiles(""); }} onSave={addBatch} />}
    {showSettings && <SettingsDialog profile={profile} email={email} onClose={() => setShowSettings(false)} onSave={(input) => startTransition(async () => { const result = await saveProfile(input); if (result.error) report(result.error); else { setShowSettings(false); refresh("Profile settings saved."); } })} />}
    {messageFor && <MessageDrawer connection={messageFor} profile={profile} onClose={() => setMessageFor(undefined)} />}
  </main>;
}

function ActionsView({ connections, onEdit, onMessage, onStatus, onBatch }: { connections: Connection[]; onEdit: (connection: Connection) => void; onMessage: (connection: Connection) => void; onStatus: (connection: Connection, status: Status) => void; onBatch: (opening?: Opening, profiles?: string) => void }) {
  const queue = buildActionQueue(connections);
  const [copiedId, setCopiedId] = useState<string>();

  async function copyFollowUp(item: ActionQueueItem) {
    const role = item.connection.opening.role || "this role";
    const message = `Hi ${item.connection.name}, bumping this in case it slipped past your inbox! Would love to connect regarding ${role}.`;
    try {
      await navigator.clipboard.writeText(message);
      setCopiedId(item.connection.id);
      window.setTimeout(() => setCopiedId(undefined), 1500);
    } catch {
      // The browser reports clipboard failures without changing the visible action state.
    }
  }

  function directAction(item: ActionQueueItem) {
    const { connection } = item;
    if (item.actionKind === "copy-follow-up") return <button className="primary-button" onClick={() => copyFollowUp(item)}>{copiedId === connection.id ? "✓ Copied!" : item.actionLabel}</button>;
    if (item.actionKind === "mark-closed") return <button className="primary-button" onClick={() => onStatus(connection, "Closed")}>{item.actionLabel}</button>;
    if (item.actionKind === "open-message") return <button className="primary-button" onClick={() => onMessage(connection)}>{item.actionLabel}</button>;
    if (item.actionKind === "open-profile" && connection.profile_url) return <a className="primary-button" href={connection.profile_url} target="_blank" rel="noreferrer">{item.actionLabel}</a>;
    if (item.actionKind === "open-job" && connection.opening.job_url) return <a className="primary-button" href={connection.opening.job_url} target="_blank" rel="noreferrer">{item.actionLabel}</a>;
    if (item.actionKind === "dial-phone" && item.phone) return <a className="primary-button" href={`tel:${item.phone}`}>{item.actionLabel}</a>;
    if (item.actionKind === "add-referral") return <button className="primary-button" onClick={() => onBatch(connection.opening, item.referredName ? `${item.referredName}\t` : "")}>{item.actionLabel}</button>;
    if (item.actionKind === "review-lockout") return <button className="primary-button" onClick={() => onEdit(item.blockedBy || connection)}>{item.actionLabel}</button>;
    return <button className="primary-button" onClick={() => onEdit(connection)}>{item.actionLabel}</button>;
  }

  return <section className="actions-panel"><div className="actions-heading"><div><p className="eyebrow">PRIORITY QUEUE</p><h3>{queue.length ? "Profiles that need attention" : "No active actions"}</h3></div><span>{queue.length} profile{queue.length === 1 ? "" : "s"}</span></div>{queue.length ? queue.map((item) => <article className={`action-row urgency-${item.urgency}`} key={item.connection.id}><div className="action-main"><div className="action-title"><strong>{item.connection.name}</strong><span className={`status-pill status-${item.connection.status.toLowerCase()}`}>{item.connection.status}</span></div><p>{item.connection.opening.company} · {item.connection.opening.role || "Role not set"}</p><p className="action-instruction"><b>{item.flag}.</b> {item.prompt}</p></div><div className="action-age"><strong>{item.ageDays === 1 ? "1 day" : `${item.ageDays} days`}</strong><span>since interaction</span></div><div className="action-controls">{directAction(item)}<button className="text-button" onClick={() => onEdit(item.connection)}>Details</button></div></article>) : <p className="empty-state">Add a batch to create an opening and its profiles.</p>}</section>;
}

function BatchTsvDialog({ opening, initialProfiles, pending, onClose, onSave }: { opening?: Opening; initialProfiles: string; pending: boolean; onClose: () => void; onSave: (input: OpeningInput, profiles: string) => void }) {
  const [openingText, setOpeningText] = useState(opening ? `${opening.company}\t${opening.role || ""}\t${opening.job_url || ""}` : "");
  const [form, setForm] = useState<OpeningInput>({ company: opening?.company || "", role: opening?.role || "", job_url: opening?.job_url || "", applied_on_portal: opening?.applied_on_portal || false });
  const [profiles, setProfiles] = useState(initialProfiles);
  const dialogRef = useRef<HTMLFormElement>(null);
  const openingRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const profileCount = parseProfileTsv(profiles).length;
  function updateOpeningText(value: string) {
    setOpeningText(value);
    const parsed = parseOpeningTsv(value)[0];
    if (parsed) setForm((current) => ({ ...current, company: parsed.company, role: parsed.role, job_url: parsed.job_url }));
  }
  useDialogFocus(dialogRef, onClose, openingRef);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form ref={dialogRef} className="dialog batch-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onSubmit={(event) => { event.preventDefault(); onSave(form, profiles); }}><div className="dialog-title"><div><p className="eyebrow">BATCH TSV</p><h2 id={titleId}>Add opening and profiles</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close">Close</button></div><p>Paste one opening, then paste its profiles below.</p><label>Opening TSV<textarea ref={openingRef} rows={3} value={openingText} onChange={(event) => updateOpeningText(event.target.value)} placeholder={"Company\tJob role\tJob link"} /></label><p className="detected-count">{form.company ? `Opening ready: ${form.company}${form.role ? `, ${form.role}` : ""}.` : "Enter Company, Job role, and Job link as tab-separated values."}</p><label>Profile TSV<textarea rows={8} value={profiles} onChange={(event) => setProfiles(event.target.value)} placeholder={"Name\tLinkedIn profile link"} /></label><p className="detected-count">{profileCount} profile{profileCount === 1 ? "" : "s"} detected. Headers are optional.</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={pending || !form.company.trim() || !profileCount}>{pending ? "Adding..." : `Add ${profileCount || ""} profiles`}</button></div></form></div>;
}

function SettingsDialog({ profile, email, onClose, onSave }: { profile: Profile; email: string; onClose: () => void; onSave: (input: { full_name: string; headline: string; message_template: string }) => void }) {
  const [full_name, setName] = useState(profile.full_name ?? ""); const [headline, setHeadline] = useState(profile.headline ?? ""); const [message_template, setTemplate] = useState(profile.message_template ?? defaultMessageTemplate);
  const dialogRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useDialogFocus(dialogRef, onClose, nameRef);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="dialog-title"><div><p className="eyebrow">SETTINGS</p><h2 id={titleId}>Profile settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close">Close</button></div><p>Signed in as {email}.</p><label>Your name<input ref={nameRef} value={full_name} onChange={(event) => setName(event.target.value)} /></label><label>Your headline<input value={headline} onChange={(event) => setHeadline(event.target.value)} /></label><label>Message template<textarea rows={12} value={message_template} onChange={(event) => setTemplate(event.target.value)} /></label><p>Use {"{name}"}, {"{company}"}, {"{job}"}, {"{joblink}"}, {"{headline}"}, and {"{sender}"}.</p><div className="dialog-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSave({ full_name, headline, message_template })}>Save profile</button></div></section></div>;
}

function MessageDrawer({ connection, profile, onClose }: { connection: Connection; profile: Profile; onClose: () => void }) {
  const initial = renderMessageTemplate(profile.message_template || defaultMessageTemplate, connection, profile);
  const [message, setMessage] = useState(initial);
  const [copied, setCopied] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  useDialogFocus(drawerRef, onClose, messageRef);
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The browser keeps the button unchanged when clipboard access fails.
    }
  }
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside ref={drawerRef} className="message-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="dialog-title"><div><p className="eyebrow">MESSAGE</p><h2 id={titleId}>Referral message</h2></div><button className="icon-button" onClick={onClose} aria-label="Close">Close</button></div><p>For {connection.name} at {connection.opening.company}.</p><textarea ref={messageRef} aria-label="Referral message" rows={14} value={message} onChange={(event) => setMessage(event.target.value)} /><div className="drawer-actions"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={copy}>{copied ? "Copied" : "Copy message"}</button></div></aside></div>;
}
