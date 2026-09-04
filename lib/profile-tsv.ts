import type { ProfileInput } from "./types";

export function parseProfileTsv(text: string): ProfileInput[] {
  const rows = text.split(/\r?\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  const first = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = first.includes("name") && first.some((cell) => cell === "linkedin url" || cell === "linkedin" || cell === "profile url");
  return rows.slice(hasHeader ? 1 : 0)
    .map(([name = "", profile_url = ""]) => ({ name, profile_url: profile_url || null }))
    .filter((item) => Boolean(item.name));
}
