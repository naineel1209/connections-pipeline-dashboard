import type { OpeningInput } from "./types";

export type ParsedOpening = Pick<OpeningInput, "company" | "role" | "job_url">;

const companyHeaders = new Set(["company", "job company"]);
const roleHeaders = new Set(["job role", "role", "target job", "job title"]);
const jobLinkHeaders = new Set(["job link", "job url", "link", "url"]);

export function parseOpeningTsv(text: string): ParsedOpening[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  if (!rows.length) return [];

  const first = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = first.some((cell) => companyHeaders.has(cell))
    && first.some((cell) => roleHeaders.has(cell))
    && first.some((cell) => jobLinkHeaders.has(cell));
  const data = hasHeader ? rows.slice(1) : rows;

  return data
    .map(([company = "", role = "", job_url = ""]) => ({
      company,
      role: role || null,
      job_url: job_url || null,
    }))
    .filter((opening) => Boolean(opening.company));
}
