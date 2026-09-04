"use client";

import { useEffect, useId, useRef, useState } from "react";
import { STATUSES, type Connection, type ConnectionInput, type Opening } from "@/lib/types";
import { useDialogFocus } from "./use-dialog-focus";

const today = () => new Date().toISOString().slice(0, 10);

export function ConnectionForm({ connection, openings, onClose, onSave }: { connection: Connection; openings: Opening[]; onClose: () => void; onSave: (input: ConnectionInput & { id: string }) => Promise<void> }) {
  const [form, setForm] = useState<ConnectionInput>({ opening_id: connection.opening_id, name: connection.name, profile_url: connection.profile_url, status: connection.status, notes: connection.notes, date_added: connection.date_added ?? today() });
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  useEffect(() => setForm({ opening_id: connection.opening_id, name: connection.name, profile_url: connection.profile_url, status: connection.status, notes: connection.notes, date_added: connection.date_added ?? today() }), [connection]);
  useDialogFocus(dialogRef, onClose, nameRef);
  function change(field: keyof ConnectionInput, value: string) { setForm((current) => ({ ...current, [field]: value || null })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onSave({ ...form, opening_id: String(form.opening_id), id: connection.id });
    setSaving(false);
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onSubmit={submit}>
    <div className="dialog-title"><div><p className="eyebrow">PROFILE</p><h2 id={titleId}>Edit profile</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button></div>
    <label>Name<input ref={nameRef} required value={form.name} onChange={(event) => change("name", event.target.value)} /></label>
    <label>Opening<select value={form.opening_id} onChange={(event) => setForm((current) => ({ ...current, opening_id: event.target.value }))}>{openings.map((opening) => <option key={opening.id} value={opening.id}>{opening.company}{opening.role ? ` · ${opening.role}` : ""}</option>)}</select></label>
    <div className="form-grid"><label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ConnectionInput["status"] }))}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label>Date added<input type="date" value={form.date_added ?? ""} onChange={(event) => change("date_added", event.target.value)} /></label></div>
    <label>LinkedIn URL<input value={form.profile_url ?? ""} onChange={(event) => change("profile_url", event.target.value)} placeholder="linkedin.com/in/name" /></label>
    <label>Notes<textarea rows={5} value={form.notes ?? ""} onChange={(event) => change("notes", event.target.value)} placeholder="Add context, follow-up details, or outcomes." /></label>
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button></div>
  </form></div>;
}
