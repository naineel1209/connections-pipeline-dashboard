"use client";

import type { Connection } from "@/lib/types";

export function ConnectionsTable({ connections, onEdit, onDelete }: { connections: Connection[]; onEdit: (connection: Connection) => void; onDelete: (connection: Connection) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Profile</th><th>Company</th><th>Role</th><th>Status</th><th>Added</th><th>Links</th><th></th></tr></thead><tbody>{connections.map((connection) => <tr key={connection.id}>
    <td data-label="Profile"><button className="cell-button" onClick={() => onEdit(connection)}>{connection.name}</button></td><td data-label="Company">{connection.opening.company}</td><td data-label="Role">{connection.opening.role || "Not set"}</td><td data-label="Status"><span className={`status-pill status-${connection.status.toLowerCase()}`}>{connection.status}</span></td><td data-label="Added">{connection.date_added || "Not set"}</td>
    <td data-label="Links">{connection.profile_url && <a href={connection.profile_url} target="_blank" rel="noreferrer">LinkedIn</a>}{connection.profile_url && connection.opening.job_url && " · "}{connection.opening.job_url && <a href={connection.opening.job_url} target="_blank" rel="noreferrer">Job</a>}</td>
    <td data-label="Actions"><button className="text-button danger" onClick={() => onDelete(connection)}>Delete</button></td>
  </tr>)}</tbody></table>{connections.length === 0 && <p className="empty-state">No profiles match this view.</p>}</div>;
}
