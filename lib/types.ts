export const STATUSES = ["Pending", "Messaged", "Accepted", "Cracked", "Closed"] as const;
export type Status = (typeof STATUSES)[number];

export type Opening = {
  id: string;
  owner_id?: string;
  company: string;
  role: string | null;
  job_url: string | null;
  applied_on_portal: boolean;
  is_open: boolean;
  created_at?: string;
};

export type Connection = {
  id: string;
  opening_id: string;
  name: string;
  profile_url: string | null;
  status: Status;
  notes: string | null;
  date_added: string | null;
  sort_order: number;
  opening: Opening;
};

export type ConnectionInput = {
  opening_id: string;
  name: string;
  profile_url: string | null;
  status: Status;
  notes: string | null;
  date_added: string | null;
};

export type OpeningInput = {
  company: string;
  role: string | null;
  job_url: string | null;
  applied_on_portal: boolean;
};

export type ProfileInput = {
  name: string;
  profile_url: string | null;
};

export type Profile = {
  full_name: string | null;
  headline: string | null;
  message_template: string | null;
};
