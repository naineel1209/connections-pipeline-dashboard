import type { Connection, Profile } from "@/lib/types";

export const defaultMessageTemplate = `Hi {name}, I hope you are doing well.

I came across the {job} opening at {company}: {joblink}

I work on Python and AWS data systems at ZURU Tech. My team built Spine, a configuration-driven Python ingestion framework that cut onboarding time for new data sources by 80%: https://github.com/victorlou/spine

I have also attached my resume here for context. If you think I could be a fit, would you be open to referring me? I would appreciate any help or advice on the team.

Thanks,
{sender}`;

export function renderMessageTemplate(template: string, connection: Connection, profile: Profile): string {
  const values: Record<string, string> = {
    name: connection.name,
    company: connection.opening.company || "the company",
    job: connection.opening.role || "this role",
    joblink: connection.opening.job_url || "",
    headline: profile.headline || "",
    sender: profile.full_name || "",
  };

  return template.replace(/\{(name|company|job|joblink|headline|sender)\}/g, (_, key: keyof typeof values) => values[key]);
}
