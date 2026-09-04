import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mapLegacyStatus, readConnectionsWorkbook } from "../lib/workbook";
import { parseProfileTsv } from "../lib/profile-tsv";
import { parseOpeningTsv } from "../lib/opening-tsv";

test("Jobs Tracker workbook has 117 valid connection records", () => {
  const rows = readConnectionsWorkbook(path.resolve("../resume/Jobs Tracker.xlsx"));
  assert.equal(rows.length, 117);
  assert.ok(rows.every((row) => row.name));
  assert.ok(rows.every((row) => row.date_added === null || /^\d{4}-\d{2}-\d{2}$/.test(row.date_added)));
  assert.ok(rows.some((row) => row.profile_url?.startsWith("https://www.linkedin.com/")));
  assert.ok(rows.some((row) => row.job_url?.startsWith("https://")));
  assert.ok(rows.every((row) => row.status === "Pending" || row.status === "Accepted" || row.status === "Messaged" || row.status === "Cracked" || row.status === "Closed"));
  const counts = rows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.status]: (result[row.status] ?? 0) + 1 }), {});
  assert.ok(Object.keys(counts).length > 1);
});

test("legacy workbook statuses map to pipeline statuses", () => {
  assert.equal(mapLegacyStatus("New"), "Pending");
  assert.equal(mapLegacyStatus("Contacted"), "Accepted");
  assert.equal(mapLegacyStatus("Follow up"), "Messaged");
  assert.equal(mapLegacyStatus("Referred"), "Cracked");
  assert.equal(mapLegacyStatus("Applied"), "Cracked");
  assert.equal(mapLegacyStatus("Closed"), "Closed");
});

test("profile text accepts an optional header and ignores blank rows", () => {
  assert.deepEqual(parseProfileTsv("Name\tLinkedIn URL\nAvery\tlinkedin.com/in/avery\n\nBlair\thttps://linkedin.com/in/blair"), [
    { name: "Avery", profile_url: "linkedin.com/in/avery" },
    { name: "Blair", profile_url: "https://linkedin.com/in/blair" },
  ]);
  assert.deepEqual(parseProfileTsv("Casey\tlinkedin.com/in/casey\n\t\n"), [{ name: "Casey", profile_url: "linkedin.com/in/casey" }]);
});

test("opening text accepts an optional header and ignores blank rows", () => {
  assert.deepEqual(parseOpeningTsv("Company\tJob Role\tJob Link\nAcme\tData Engineer\thttps://acme.example/jobs/1\n\nNorthstar\tSoftware Engineer\thttps://northstar.example/jobs/2"), [
    { company: "Acme", role: "Data Engineer", job_url: "https://acme.example/jobs/1" },
    { company: "Northstar", role: "Software Engineer", job_url: "https://northstar.example/jobs/2" },
  ]);
  assert.deepEqual(parseOpeningTsv("Plain Company\tBackend Engineer\thttps://plain.example/jobs/3\n\t\t"), [
    { company: "Plain Company", role: "Backend Engineer", job_url: "https://plain.example/jobs/3" },
  ]);
});
