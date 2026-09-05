import type { Connection, Profile } from "@/lib/types";

export const MESSAGE_SITUATIONS = ["outreach", "applied"] as const;

export type MessageSituation = typeof MESSAGE_SITUATIONS[number];

export type MessageTemplates = Record<MessageSituation, string>;

export const defaultMessageTemplate = `Hi {firstName},

I hope you are doing well.

I came across the {job} opening at {company}: {joblink}

I work on Python and AWS data systems at ZURU Tech. My team built Spine, a configuration-driven Python ingestion framework that cut onboarding time for new data sources by 80%: https://github.com/victorlou/spine

I have also attached my resume here for context. If you think I could be a fit, would you be open to referring me? I would appreciate any help or advice on the team.

Thanks,`;

export const defaultAppliedMessageTemplate = `Hi {firstName},

I recently applied for the {job} opening at {company}: {joblink}

I work on Python and AWS data systems at ZURU Tech. My team built Spine, a configuration-driven Python ingestion framework that cut onboarding time for new data sources by 80%: https://github.com/victorlou/spine

I have also attached my resume here for context. If you think I could be a fit, would you be open to referring me? I would appreciate any help or advice on the team.

Thanks,`;

const defaultTemplates: MessageTemplates = {
  outreach: defaultMessageTemplate,
  applied: defaultAppliedMessageTemplate,
};

export function getMessageTemplates(value: string | null | undefined): MessageTemplates {
  const raw = value ?? "";
  const text = raw.trim();
  if (!text) return { ...defaultTemplates };

  if (!text.startsWith("{") && !text.startsWith("[")) {
    return { outreach: raw, applied: defaultAppliedMessageTemplate };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...defaultTemplates };
    const templates = parsed as Partial<Record<MessageSituation, unknown>>;
    if (!MESSAGE_SITUATIONS.some((situation) => typeof templates[situation] === "string")) return { ...defaultTemplates };
    return {
      outreach: typeof templates.outreach === "string" ? templates.outreach : defaultMessageTemplate,
      applied: typeof templates.applied === "string" ? templates.applied : defaultAppliedMessageTemplate,
    };
  } catch {
    return { ...defaultTemplates };
  }
}

export function serializeMessageTemplates(templates: MessageTemplates): string {
  return JSON.stringify({ outreach: templates.outreach, applied: templates.applied });
}

export function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "";
}

export function renderMessageTemplate(template: string, connection: Connection, profile: Profile): string {
  const values: Record<string, string> = {
    firstName: getFirstName(connection.name),
    name: getFirstName(connection.name),
    sender: "",
    company: connection.opening.company || "the company",
    job: connection.opening.role || "this role",
    joblink: connection.opening.job_url || "",
    headline: profile.headline || "",
  };

  return template.replace(/\{(firstName|name|sender|company|job|joblink|headline)\}/g, (_, key: keyof typeof values) => values[key]);
}
