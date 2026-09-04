import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import type { Status } from "./types";

export const WORKBOOK_HEADERS = ["Name", "Profile Link", "Target Job", "Job Company", "Job Link", "Status", "Notes", "Date Added"] as const;
export type WorkbookProfile = {
  name: string;
  profile_url: string | null;
  role: string | null;
  company: string | null;
  job_url: string | null;
  status: Status;
  notes: string | null;
  date_added: string | null;
};

export const LEGACY_STATUS_MAP: Record<string, Status> = {
  New: "Pending",
  Contacted: "Accepted",
  "Follow up": "Messaged",
  Referred: "Cracked",
  Applied: "Cracked",
  Closed: "Closed",
  Pending: "Pending",
  Accepted: "Accepted",
  Messaged: "Messaged",
  Cracked: "Cracked",
};

function dateToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

export function mapLegacyStatus(value: unknown): Status {
  return LEGACY_STATUS_MAP[String(value ?? "").trim()] || "Pending";
}

export function mapWorkbookRows(rows: unknown[][]): WorkbookProfile[] {
  const headerIndex = rows.findIndex((row) => row[0] === "Name" && row[5] === "Status");
  if (headerIndex < 0) throw new Error("The Connections sheet does not contain the expected eight headers.");
  const header = rows[headerIndex].slice(0, 8);
  if (WORKBOOK_HEADERS.some((value, index) => header[index] !== value)) throw new Error("The Connections sheet headers are not in the expected order.");
  return rows.slice(headerIndex + 1).filter((row) => String(row[0] ?? "").trim()).map((row) => ({
    name: String(row[0]).trim(),
    profile_url: row[1] ? String(row[1]).trim() : null,
    role: row[2] ? String(row[2]).trim() : null,
    company: row[3] ? String(row[3]).trim() : null,
    job_url: row[4] ? String(row[4]).trim() : null,
    status: mapLegacyStatus(row[5]),
    notes: row[6] ? String(row[6]).trim() : null,
    date_added: dateToIso(row[7]),
  }));
}

export function readConnectionsWorkbook(path: string) {
  const workbook = XLSX.readFile(path, { cellDates: true });
  const sheet = workbook.Sheets.Connections;
  if (!sheet) throw new Error("The workbook does not contain a Connections sheet.");
  return mapWorkbookRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }));
}

export function workbookSourceKey(row: WorkbookProfile, index: number) {
  const content = [index, row.name, row.profile_url, row.role, row.company, row.job_url, row.status, row.notes, row.date_added].join("\u001f");
  return `workbook-${createHash("sha256").update(content).digest("hex")}`;
}
