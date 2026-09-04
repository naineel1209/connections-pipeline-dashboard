# Connections Pipeline Dashboard

This Next.js application stores each user's connections in Supabase PostgreSQL.

## Onboarding video

[Watch the onboarding video](video/onboarding/connections-pipeline-onboarding.mp4)

## Setup

1. Create a Supabase project.
2. Run `supabase/migrations/202609040001_connections_pipeline.sql` in the Supabase SQL Editor.
3. Enable Google in Supabase Authentication.
4. Add `http://localhost:3000/auth/callback` to Supabase redirect URLs.
5. Copy `.env.example` to `.env.local` and set its values.
6. Run `npm install` and `npm run dev`.

Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the Supabase publishable key.

The `SUPABASE_SERVICE_ROLE_KEY` only supports the import command.

Do not place `SUPABASE_SERVICE_ROLE_KEY` in Vercel runtime variables.

## Workbook import

Sign in through Google once before the import.

Set `SEED_OWNER_EMAIL` to that Google email address.

The workbook stays outside this project and Git.

Run this command from the project directory:

```sh
npm run import:workbook -- ../resume/Jobs\ Tracker.xlsx
```

The command needs `.env.local` with Supabase administrator credentials.

The command confirms 117 records and all workbook status counts.

The command uses stable source keys, so it can run again safely.

## Vercel deployment

1. Import this directory as a Vercel project.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Deploy the project.
4. Add `https://YOUR-VERCEL-DOMAIN/auth/callback` to Supabase redirect URLs.
5. Set the Supabase Authentication site URL to `https://YOUR-VERCEL-DOMAIN`.

Each Google user gets a profile row through the database trigger.

Row-level security limits each user to their own profile and connections.

## Verification

Run these commands from the project directory:

```sh
npm test
npm run lint
npm run build
```

Test Google login on the deployed Vercel domain after you set the redirect URL.
