import type { Connection } from "@/lib/types";

export const ACTION_CENTER_TODAY = "2026-09-04";

export type ActionKind =
  | "copy-follow-up"
  | "mark-closed"
  | "open-message"
  | "open-profile"
  | "open-job"
  | "dial-phone"
  | "add-referral"
  | "review-lockout"
  | "review-details";

export type ActionQueueItem = {
  connection: Connection;
  ageDays: number;
  interactionDate: string | null;
  priority: number;
  urgency: "urgent" | "high" | "medium" | "normal" | "muted";
  flag: string;
  prompt: string;
  actionKind: ActionKind;
  actionLabel: string;
  phone?: string;
  referredName?: string;
  blockedBy?: Connection;
  suppressed?: boolean;
};

const stageWeights = { Cracked: 50, Accepted: 40, Messaged: 20, Pending: 10, Closed: 0 } as const;

function validIsoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : value;
}

function toIsoDate(day: string, month: string, year: string): string | null {
  const result = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return validIsoDate(result);
}

export function getInteractionDate(connection: Connection): string | null {
  const notes = connection.notes || "";
  const iso = notes.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return validIsoDate(iso[1]) || connection.date_added;
  const slashDate = notes.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashDate) return toIsoDate(slashDate[1], slashDate[2], slashDate[3]) || connection.date_added;
  return connection.date_added;
}

export function getAgeDays(date: string | null, today = ACTION_CENTER_TODAY): number {
  if (!date) return 0;
  const start = new Date(`${date}T00:00:00Z`).valueOf();
  const end = new Date(`${today}T00:00:00Z`).valueOf();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function getReferralName(notes: string): string | undefined {
  const match = notes.match(/asked\s+to\s+connect\s+to\s+([^\n.,;()]+)/i);
  return match?.[1].trim() || undefined;
}

function initialAction(connection: Connection, ageDays: number): Omit<ActionQueueItem, "connection" | "ageDays" | "interactionDate" | "priority"> {
  const profileAction: Pick<ActionQueueItem, "actionKind" | "actionLabel"> = connection.profile_url
    ? { actionKind: "open-profile", actionLabel: "Open profile" }
    : { actionKind: "review-details", actionLabel: "View details" };

  if (connection.status === "Pending") {
    if (ageDays <= 2) return { urgency: "normal", flag: "Fresh lead", prompt: "Initiate outreach with a tailored connection request.", ...profileAction };
    if (ageDays <= 6) return { urgency: "medium", flag: "Action overdue", prompt: "Send a connection note or rotate this lead.", ...profileAction };
    return { urgency: "high", flag: "Stale queue", prompt: "Send outreach now or re-assign this company contact.", ...profileAction };
  }
  if (connection.status === "Messaged") {
    if (ageDays <= 3) return { urgency: "normal", flag: "Awaiting reply", prompt: "Wait during the normal response window.", actionKind: "review-details", actionLabel: "View details" };
    if (ageDays <= 7) return { urgency: "medium", flag: "Follow-up due", prompt: "Send a brief follow-up message.", actionKind: "copy-follow-up", actionLabel: "Copy follow-up" };
    if (ageDays <= 13) return { urgency: "high", flag: "Multi-thread trigger", prompt: "Add a second contact at this company.", actionKind: "add-referral", actionLabel: "Add contact" };
    return { urgency: "muted", flag: "Ghosted or expired", prompt: "Close this record after 14 days without a response.", actionKind: "mark-closed", actionLabel: "Mark closed" };
  }
  if (connection.status === "Accepted") {
    if (ageDays <= 1) return { urgency: "urgent", flag: "Golden window", prompt: "Send the role link and request a 10-minute call.", actionKind: "open-message", actionLabel: "Prepare message" };
    if (ageDays <= 4) return { urgency: "medium", flag: "Conversation stalled", prompt: "Send a polite check-in with project context.", actionKind: "open-message", actionLabel: "Prepare message" };
    return { urgency: "high", flag: "Stale connection", prompt: "Re-engage with a direct question about the team.", actionKind: "open-message", actionLabel: "Prepare message" };
  }
  if (connection.status === "Cracked") {
    if (ageDays <= 1) return { urgency: "urgent", flag: "Interview or call due", prompt: "Prepare for the call and confirm the schedule.", ...profileAction };
    if (ageDays <= 2) return { urgency: "high", flag: "Post-call follow-up", prompt: "Send thanks and share the requisition details.", actionKind: "open-message", actionLabel: "Prepare message" };
    if (ageDays <= 6) return { urgency: "medium", flag: "Crack review", prompt: "Review the referral and application progress.", actionKind: "review-details", actionLabel: "View details" };
    return { urgency: "normal", flag: "Portal verification", prompt: "Confirm the referral status or check the portal.", actionKind: connection.opening.job_url ? "open-job" : "review-details", actionLabel: connection.opening.job_url ? "Open job" : "View details" };
  }
  return { urgency: "muted", flag: "Closed record", prompt: "Review this closed contact only if the referral can continue.", actionKind: "review-details", actionLabel: "View details" };
}

function applyKeywordRule(item: ActionQueueItem): ActionQueueItem {
  const notes = item.connection.notes || "";
  const lowerNotes = notes.toLowerCase();
  const phone = notes.match(/\b(\d{10})\b/)?.[1];
  const referredName = getReferralName(notes);

  if (phone) return { ...item, urgency: "urgent", flag: "Phone call required", prompt: "Dial the listed number and add call notes.", actionKind: "dial-phone", actionLabel: "Dial phone", phone };
  if (/call\s+(tomorrow|scheduled)/i.test(notes)) return { ...item, urgency: "urgent", flag: "Call due tomorrow", prompt: "Prepare and confirm the scheduled call.", actionKind: "review-details", actionLabel: "View details" };
  if (/said\s*-?\s*will\s+refer\s+me/i.test(notes)) return { ...item, urgency: "high", flag: "Requisition details", prompt: "Send the job link and resume within 12 hours.", actionKind: item.connection.opening.job_url ? "open-job" : "open-message", actionLabel: item.connection.opening.job_url ? "Open job" : "Prepare message" };
  if (referredName) return { ...item, urgency: "medium", flag: "Add referral lead", prompt: `Add ${referredName} as a contact for this opening.`, actionKind: "add-referral", actionLabel: "Add referral", referredName };
  if (/will\s+be\s+checking\s+on\s+portal/i.test(notes)) return { ...item, urgency: "medium", flag: "Portal status check", prompt: "Follow up within 48 hours to confirm submission.", actionKind: item.connection.opening.job_url ? "open-job" : "review-details", actionLabel: item.connection.opening.job_url ? "Open job" : "View details" };
  if (lowerNotes.includes("referral") && item.connection.status === "Closed") return { ...item, urgency: "normal", flag: "Pivot referral", prompt: "Re-route this referral to a new lead.", actionKind: "add-referral", actionLabel: "Add contact" };
  return item;
}

function getPriority(connection: Connection, ageDays: number): number {
  const notes = (connection.notes || "").toLowerCase();
  const phoneOrCall = /\b\d{10}\b/.test(notes) || notes.includes("call");
  const referral = notes.includes("will refer") || notes.includes("referral");
  const closed = notes.includes("job closed");
  return stageWeights[connection.status] + Math.min(ageDays * 2, 30) + (phoneOrCall ? 40 : 0) + (referral ? 25 : 0) - (closed ? 100 : 0);
}

export function buildActionQueue(connections: Connection[]): ActionQueueItem[] {
  const messagedCounts = new Map<string, number>();
  const crackedByCompany = new Map<string, Connection>();
  for (const connection of connections) {
    if (connection.status === "Messaged") messagedCounts.set(connection.opening.company, (messagedCounts.get(connection.opening.company) || 0) + 1);
    if (connection.status === "Cracked" && !crackedByCompany.has(connection.opening.company)) crackedByCompany.set(connection.opening.company, connection);
  }

  return connections
    .filter((connection) => !(connection.status === "Closed" && /job\s+closed/i.test(connection.notes || "")))
    .map((connection) => {
      const interactionDate = getInteractionDate(connection);
      const ageDays = getAgeDays(interactionDate);
      let item: ActionQueueItem = {
        connection,
        ageDays,
        interactionDate,
        priority: getPriority(connection, ageDays),
        ...initialAction(connection, ageDays),
      };
      item = applyKeywordRule(item);
      const crackedContact = crackedByCompany.get(connection.opening.company);
      const reachesMessageLimit = (messagedCounts.get(connection.opening.company) || 0) >= 4;
      if (connection.status !== "Cracked" && crackedContact) {
        item = { ...item, urgency: "high", flag: "Referral lockout", prompt: `${crackedContact.name} has a cracked referral. Pause new outreach at this company.`, actionKind: "review-lockout", actionLabel: "Review cracked lead", blockedBy: crackedContact, suppressed: true };
      } else if ((connection.status === "Pending" || connection.status === "Messaged") && reachesMessageLimit) {
        item = { ...item, urgency: "high", flag: "Outreach limit", prompt: "Four or more contacts await replies. Pause new outreach and review the company queue.", actionKind: "review-lockout", actionLabel: "Review queue", suppressed: true };
      }
      return item;
    })
    .sort((left, right) => right.priority - left.priority || left.connection.name.localeCompare(right.connection.name));
}
