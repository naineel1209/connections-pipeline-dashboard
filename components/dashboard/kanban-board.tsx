"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMessageTemplates, renderMessageTemplate } from "@/lib/message-template";
import { STATUSES, type Connection, type Profile, type Status } from "@/lib/types";

type Props = {
  connections: Connection[];
  visibleStatuses: Set<Status>;
  profile: Profile;
  onEdit: (connection: Connection) => void;
  onMove: (id: string, status: Status, beforeId?: string) => void;
  onStatus: (connection: Connection, status: Status) => void;
  onMessage: (connection: Connection) => void;
  onDelete: (connection: Connection) => void;
};

const stageColours: Record<Status, string> = {
  Pending: "#6B7280",
  Messaged: "#F59E0B",
  Accepted: "#3B82F6",
  Cracked: "#10B981",
  Closed: "#9CA3AF",
};

export function KanbanBoard({ connections, visibleStatuses, profile, onEdit, onMove, onStatus, onMessage, onDelete }: Props) {
  const [dropStatus, setDropStatus] = useState<Status>();
  const [hoveredCompany, setHoveredCompany] = useState<string>();
  const [selectedCompany, setSelectedCompany] = useState<string>();
  const activeCompany = hoveredCompany || selectedCompany;

  return <div className="board-scroll"><div className="board" role="region" aria-label="Connections pipeline board">
    {STATUSES.filter((status) => visibleStatuses.has(status)).map((status) => {
      const cards = connections.filter((connection) => connection.status === status);
      return <section className={`pipeline-column column-${status.toLowerCase()} ${dropStatus === status ? "drag-target" : ""}`} key={status} onDragOver={(event) => { event.preventDefault(); setDropStatus(status); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropStatus(undefined); }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("connection-id"); if (id) onMove(id, status); setDropStatus(undefined); }}>
        <header><div className="column-heading"><span className="column-colour" style={{ background: stageColours[status] }} /><h3>{status}</h3></div><span className="column-count">{cards.length}</span></header>
        <div className="column-cards">{cards.length ? cards.map((connection) => <PipelineCard key={connection.id} connection={connection} profile={profile} accent={stageColours[status]} highlighted={Boolean(activeCompany && connection.opening.company === activeCompany)} selected={selectedCompany === connection.opening.company} onCompanyEnter={(company) => setHoveredCompany(company)} onCompanyLeave={() => setHoveredCompany(undefined)} onCompanyClick={(company) => setSelectedCompany((current) => current === company ? undefined : company)} onEdit={onEdit} onMove={onMove} onStatus={onStatus} onMessage={onMessage} onDelete={onDelete} />) : <p className="column-empty">No contacts</p>}</div>
      </section>;
    })}
  </div></div>;
}

type CardProps = Omit<Props, "connections" | "visibleStatuses"> & {
  connection: Connection;
  profile: Profile;
  accent: string;
  highlighted: boolean;
  selected: boolean;
  onCompanyEnter: (company: string) => void;
  onCompanyLeave: () => void;
  onCompanyClick: (company: string) => void;
};

function PipelineCard({ connection, profile, accent, highlighted, selected, onCompanyEnter, onCompanyLeave, onCompanyClick, onEdit, onMove, onStatus, onMessage, onDelete }: CardProps) {
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number }>();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const opening = connection.opening;
  const date = formatDate(connection.date_added);
  const templates = getMessageTemplates(profile.message_template);
  const message = renderMessageTemplate(connection.opening.applied_on_portal ? templates.applied : templates.outreach, connection, profile);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The browser keeps the button unchanged when clipboard access fails.
    }
  }

  function positionMenu() {
    const trigger = menuButtonRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 216;
    const estimatedHeight = 294;
    const gutter = 10;
    const left = Math.max(gutter, Math.min(rect.right - width, window.innerWidth - width - gutter));
    const fitsBelow = window.innerHeight - rect.bottom >= estimatedHeight + gutter;
    const top = fitsBelow
      ? Math.min(window.innerHeight - estimatedHeight - gutter, rect.bottom + 6)
      : Math.max(gutter, rect.top - estimatedHeight - 6);
    setMenuPosition({ left, top });
  }

  useEffect(() => {
    if (!menu) return;
    positionMenu();
    const firstItem = menuRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    firstItem?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) setMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(false);
        menuButtonRef.current?.focus();
      }
    };
    const moveMenuFocus = (event: KeyboardEvent) => {
      if (!menuRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = [...menuRef.current.querySelectorAll<HTMLElement>("[role='menuitem']")];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Home") items[0].focus();
      else if (event.key === "End") items[items.length - 1].focus();
      else if (event.key === "ArrowDown") items[current < 0 ? 0 : (current + 1) % items.length].focus();
      else items[current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length].focus();
    };
    const reposition = () => positionMenu();
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("keydown", moveMenuFocus);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("keydown", moveMenuFocus);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [menu]);

  return <article className={`connection-card ${highlighted ? "company-highlight" : ""}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("connection-id", connection.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const id = event.dataTransfer.getData("connection-id"); if (id) onMove(id, connection.status, connection.id); }}>
    <div className="card-header">
      <div className="card-identity"><button className="card-name" onClick={() => onEdit(connection)} title={`Edit ${connection.name}`}>{connection.name}</button><button className={`company-badge ${selected ? "selected" : ""}`} onMouseEnter={() => onCompanyEnter(opening.company)} onMouseLeave={onCompanyLeave} onFocus={() => onCompanyEnter(opening.company)} onBlur={onCompanyLeave} onClick={() => onCompanyClick(opening.company)} title={`Highlight contacts at ${opening.company}`}>{opening.company}</button></div>
      <div className="card-links">
        {connection.profile_url && <a className="quick-link" href={connection.profile_url} target="_blank" rel="noreferrer" aria-label={`Open ${connection.name}'s LinkedIn profile`} title="Open LinkedIn profile"><LinkedInIcon /></a>}
        {opening.job_url && <a className="job-link" href={opening.job_url} target="_blank" rel="noreferrer" aria-label={`Open job request for ${opening.company}`} title="Open job request">Job Req <ArrowIcon /></a>}
      </div>
    </div>
    <p className="card-role">{opening.role || "Target role not set"}</p>
    <div className={`notes-snippet ${connection.notes ? "" : "empty"}`} style={{ borderLeftColor: accent }}>{connection.notes || "No outreach notes yet."}</div>
    <footer><time>Added: {date}</time><div className="card-actions"><button className={`copy-message ${copied ? "copied" : ""}`} onClick={copyMessage}>{copied ? "✓ Copied!" : "Copy Msg"}</button><button ref={menuButtonRef} className="card-menu" onClick={() => setMenu((current) => !current)} aria-label={`Change status for ${connection.name}`} aria-expanded={menu} aria-controls={menu ? menuId : undefined} aria-haspopup="menu">•••</button></div></footer>
    {menu && menuPosition && createPortal(<div ref={menuRef} id={menuId} className="card-popover" role="menu" aria-label={`Actions for ${connection.name}`} style={{ left: menuPosition.left, top: menuPosition.top }}><p>Move to stage</p>{STATUSES.map((status) => <button key={status} role="menuitem" className={connection.status === status ? "current" : ""} onClick={() => { onStatus(connection, status); setMenu(false); }}>{status}{connection.status === status && <span>✓</span>}</button>)}<hr /><button role="menuitem" onClick={() => { onEdit(connection); setMenu(false); }}>Edit contact</button><button role="menuitem" onClick={() => { onMessage(connection); setMenu(false); }}>Edit message</button><button role="menuitem" className="danger" onClick={() => { onDelete(connection); setMenu(false); }}>Delete contact</button></div>, document.body)}
  </article>;
}

function formatDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(date);
}

function LinkedInIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8.5A1.75 1.75 0 1 0 6.5 5a1.75 1.75 0 0 0 0 3.5ZM5 10h3v9H5v-9Zm5 0h2.9v1.23h.04c.4-.76 1.4-1.56 2.88-1.56 3.08 0 3.65 2.02 3.65 4.65V19h-3v-4.17c0-1 0-2.28-1.39-2.28-1.39 0-1.6 1.08-1.6 2.2V19h-3v-9Z" fill="currentColor" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4m-5 0h5v5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
