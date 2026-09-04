"use client";

import { useState } from "react";
import { STATUSES, type Connection, type Opening, type Status } from "@/lib/types";

type Props = {
  openings: Opening[];
  connections: Connection[];
  onEdit: (connection: Connection) => void;
  onAddProfiles: (opening: Opening) => void;
  onClose: (opening: Opening) => void;
  onReopen: (opening: Opening) => void;
  visibleStatuses: Set<Status>;
  onToggleStatus: (status: Status) => void;
  onUpdatePortalStatus: (opening: Opening, appliedOnPortal: boolean) => void;
  pending: boolean;
};

export function CompaniesView({ openings, connections, onEdit, onAddProfiles, onClose, onReopen, visibleStatuses, onToggleStatus, onUpdatePortalStatus, pending }: Props) {
  if (!openings.length) return <EmptyCompanies />;
  return <><section className="companies-toolbar" aria-label="Company profile filters"><div className="stage-filter" aria-label="Visible company profile statuses"><span>Show profiles:</span>{STATUSES.map((status) => <button key={status} className={visibleStatuses.has(status) ? `stage-toggle active ${status.toLowerCase()}` : "stage-toggle"} onClick={() => onToggleStatus(status)} aria-pressed={visibleStatuses.has(status)}>{status}</button>)}</div></section><div className="company-grid">{openings.map((opening) => <OpeningCard key={opening.id} opening={opening} connections={connections.filter((connection) => connection.opening_id === opening.id)} onEdit={onEdit} onAddProfiles={onAddProfiles} onClose={onClose} onReopen={onReopen} visibleStatuses={visibleStatuses} onUpdatePortalStatus={onUpdatePortalStatus} pending={pending} />)}</div></>;
}

function OpeningCard({ opening, connections, onEdit, onAddProfiles, onClose, onReopen, visibleStatuses, onUpdatePortalStatus, pending }: Omit<Props, "openings" | "connections" | "onToggleStatus"> & { opening: Opening; connections: Connection[] }) {
  const [expanded, setExpanded] = useState(false);
  const active = connections.filter((connection) => connection.status !== "Closed").length;
  const cracked = connections.filter((connection) => connection.status === "Cracked").length;
  const visibleConnections = connections.filter((connection) => visibleStatuses.has(connection.status));
  return <section className="company-card">
    <div className="company-card-head"><div><p className="eyebrow">{opening.is_open ? "OPENING" : "CLOSED OPENING"}</p><h2>{opening.company}</h2><p className="opening-role">{opening.role || "Role not set"}</p></div><span className={opening.is_open ? "opening-state open" : "opening-state"}>{opening.is_open ? "Open" : "Closed"}</span></div>
    <div className="opening-meta"><span>{connections.length} profile{connections.length === 1 ? "" : "s"}</span><span>{active} active</span><span>{cracked} cracked</span></div>
    <div className="opening-meta"><button type="button" className={`portal-toggle ${opening.applied_on_portal ? "applied" : ""}`} aria-pressed={opening.applied_on_portal} onClick={() => onUpdatePortalStatus(opening, !opening.applied_on_portal)} disabled={pending}>{opening.applied_on_portal ? "Applied on portal" : "Not applied on portal"}</button>{opening.job_url && <a href={opening.job_url} target="_blank" rel="noreferrer">Job link</a>}</div>
    <div className="opening-actions"><button className="secondary-button" onClick={() => onAddProfiles(opening)}>Add Profiles</button>{opening.is_open ? <button className="text-button" onClick={() => onClose(opening)}>Close</button> : <button className="text-button" onClick={() => onReopen(opening)}>Reopen</button>}</div>
    <button className="profiles-toggle" onClick={() => setExpanded(!expanded)}>{expanded ? "Hide profiles" : `Show profiles (${visibleConnections.length})`}</button>
    {expanded && <div className="opening-profiles">{visibleConnections.length ? visibleConnections.map((connection) => <button key={connection.id} className="company-person" onClick={() => onEdit(connection)}><span>{connection.name}</span><small><span className={`status-pill status-${connection.status.toLowerCase()}`}>{connection.status}</span>{connection.profile_url && " · LinkedIn"}</small></button>) : <p className="empty-state">No profiles match the selected statuses.</p>}</div>}
  </section>;
}

function EmptyCompanies() {
  return <section className="empty-panel"><p className="eyebrow">COMPANIES</p><h2>Create your first opening</h2><p>Use Add batch to create an opening and its profiles.</p></section>;
}
