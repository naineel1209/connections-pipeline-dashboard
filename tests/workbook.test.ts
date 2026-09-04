import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mapLegacyStatus, readConnectionsWorkbook } from "../lib/workbook";
import { parseProfileTsv } from "../lib/profile-tsv";
import { parseOpeningTsv } from "../lib/opening-tsv";
import { buildActionQueue, getAgeDays, getInteractionDate } from "../lib/action-center";
import { defaultMessageTemplate, renderMessageTemplate } from "../lib/message-template";
import type { Connection, Status } from "../lib/types";

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "connection-1",
    opening_id: "opening-1",
    name: "Avery Smith",
    profile_url: "https://www.linkedin.com/in/avery",
    status: "Pending",
    notes: null,
    date_added: "2026-09-01",
    sort_order: 1,
    opening: { id: "opening-1", company: "Acme", role: "Data Engineer", job_url: "https://acme.example/jobs/1", applied_on_portal: false, is_open: true },
    ...overrides,
  };
}

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

test("message template fills the job link token", () => {
  const result = renderMessageTemplate("{name}|{company}|{job}|{joblink}|{headline}|{sender}", connection(), { full_name: "Nai Neel", headline: "Python engineer", message_template: defaultMessageTemplate });
  assert.equal(result, "Avery Smith|Acme|Data Engineer|https://acme.example/jobs/1|Python engineer|Nai Neel");
});

test("message template leaves a missing job link empty", () => {
  const result = renderMessageTemplate("Role: {joblink}", connection({ opening: { id: "opening-1", company: "Acme", role: "Data Engineer", job_url: null, applied_on_portal: false, is_open: true } }), { full_name: null, headline: null, message_template: null });
  assert.equal(result, "Role: ");
});

test("action timing uses a Notes timestamp before Date Added", () => {
  assert.equal(getInteractionDate(connection({ notes: "Call scheduled 2026-09-02", date_added: "2026-08-01" })), "2026-09-02");
  assert.equal(getInteractionDate(connection({ notes: "Spoke on 03/09/2026", date_added: "2026-08-01" })), "2026-09-03");
  assert.equal(getAgeDays("2026-09-02"), 2);
});

test("phone calls receive the keyword boost and direct dial action", () => {
  const [item] = buildActionQueue([connection({ status: "Cracked", notes: "7011657678 - Call tomorrow", date_added: "2026-09-03" })]);
  assert.equal(item.priority, 92);
  assert.equal(item.actionKind, "dial-phone");
  assert.equal(item.phone, "7011657678");
});

test("Job closed records do not appear in the active action queue", () => {
  const queue = buildActionQueue([connection({ status: "Closed", notes: "Applied on portal (Job closed)" })]);
  assert.equal(queue.length, 0);
});

test("four unanswered messages pause outreach for the company", () => {
  const queue = buildActionQueue([0, 1, 2, 3].map((index) => connection({ id: `message-${index}`, status: "Messaged" as Status, name: `Person ${index}` })));
  assert.ok(queue.every((item) => item.flag === "Outreach limit" && item.suppressed));
});

test("a cracked referral pauses other company contacts", () => {
  const queue = buildActionQueue([
    connection({ id: "cracked", name: "Jordan", status: "Cracked" }),
    connection({ id: "pending", name: "Avery", status: "Pending" }),
  ]);
  const pending = queue.find((item) => item.connection.id === "pending");
  assert.equal(pending?.flag, "Referral lockout");
  assert.equal(pending?.blockedBy?.id, "cracked");
});
