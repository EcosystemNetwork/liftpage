# LiftPage

Attention into traction.

LiftPage is a digital media marketing agency for technology companies. The public pages sell the work: platforms, services, a sample launch week, and pricing. The production desk at `/desk` is where campaigns are planned, drafted, approved, and published.

## Run

```bash
npm run dev
```

Desk: http://localhost:3070

## Stack

| Piece | What it does here |
|---|---|
| Next.js 16, React 19, Tailwind 4 | The site, the desk, accounts |
| Supabase Postgres | Boards, posts, review notes, client messages, runs, requests, metrics, network connections, rate limits |
| Supabase Auth | Sign-in, sign-up, invites, password resets |
| Supabase Storage | Post media (`post-media` bucket), uploaded straight from the desk on signed URLs |
| HarnessRouter | Cuts the day from a brief (falls back to the local operator) |
| Inngest | Publishes cued posts at their slot, request emails, daily insight sync, token refresh |
| X, LinkedIn, Instagram, YouTube, TikTok APIs | Publishing and weekly insights |
| Stripe | Deposit checkout for a request; the webhook marks it paid |
| Resend | Request confirmations, invites, resets, receipts |
| PostHog, Sentry | Product events; errors and traces |

Every service but Supabase is optional. Without its keys the feature says so and steps aside: no Resend, and admins get one-time links to pass on; no Inngest, and cued posts wait for Publish now; no network keys, and Connect is greyed out.

## Set up

1. Make a Supabase project. Run `supabase/migrations/*.sql` in order in the SQL editor (or `supabase db push`).
2. Copy `.env.example` to `.env.local`. Fill the Supabase URL and keys, `NEXT_PUBLIC_SITE_URL`, and `LIFTPAGE_ADMIN_PASSWORD`. Admin is locked to the owner emails in `lib/owner.ts`; the owner account is made with that password on first start.
3. In Supabase Auth > URL Configuration, set the site URL and allow `<site>/auth/confirm`. If Supabase sends its own emails (no Resend), set the confirm-signup and reset templates to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account` (use `type=recovery&next=/auth/password` for reset).
4. `npm run dev`. For scheduled publishing, also run `npx inngest-cli@latest dev -u http://localhost:3070/api/inngest` with `INNGEST_DEV=1`.
5. For each network, make the developer app, register `<site>/api/social/<platform>/callback`, set its keys and `LIFTPAGE_TOKEN_KEY`, then Connect it from a board on the desk.

Network apps need review before they post publicly. TikTok posts are private (`SELF_ONLY`) until TikTok audits the app; YouTube uploads from unaudited Google projects are private; LinkedIn company pages need the Community Management API product. Apply early.

## Accounts and boards

- `/login`, `/signup`, `/forgot`: sign-in, client self sign-up (`LIFTPAGE_OPEN_SIGNUP=false` closes it), password reset.
- `/account` opens on **Your projects**: each website (live address, uptime, Check now) and social project (drafts to review, scheduled, published, networks), with Request a change on every card and its status (Received → In progress → Done). Under them sits the monthly plan: price, what it includes, and its terms. The plan is either a free first month (the card goes on file at Start free month and the first charge lands when the month ends) or a locked price held through a date. Admins set projects and the plan under Projects and plan on `/admin/customers/[id]`. An hourly job checks every live site and emails LiftPage when one goes down or comes back. Stripe's webhook needs `customer.subscription.updated` and `customer.subscription.deleted` added to keep plan status in step.
- Clients also serve themselves on `/account`: **Start a campaign** (package + brief, filled from their account, same email and deposit flow as the home-page form), **Your photos** (private `client-photos` bucket, uploaded on signed URLs, read on hour-long signed links), **Your social media accounts** (per network: here's my handle, make one for me, or not needed; never passwords), and **Ask for a change** for anything not tied to one project. Admins see photos and the social checklist on `/admin/customers/[id]`, mark each network done, and get an email for each.
- Also on `/account`: a client's messages with LiftPage, their board (approve a draft, request changes with a note, comment), their requests with a deposit button, and their weekly numbers with ranges, CSV import/export, and Sync now.
- `/admin`: clients, pipeline, won and paid value, requests.
- `/admin/messages`: every client thread, newest first, with unread counts. Open one to reply.
- `/admin/users`: invite accounts by email, switch accounts off, send reset links, change roles.
- `/admin/customers/[id]`: one client's message thread, board link (or Open a board), numbers, Sync now.
- **Content autopilot** (on `/admin/customers/[id]`): switch it on per client, pick a day, write standing instructions. On that day (3pm Pacific, Inngest `content-autopilot`) it reads what the client approved and sent back, last week's numbers by network, and the instructions, then cuts next week as drafts and can email the client to review. It never approves, schedules, or posts, and it holds off while 4+ drafts wait on review. Run now works without Inngest. Needs the `autopilot` migration and an AI backend.
- `/desk?board=<id>`: one board at a time. Cut, edit, attach media, approve, cue, Publish now, connect networks, read and answer the client's review. Admin-only, as are its APIs.

Identity is Supabase Auth. Role and the switched-off flag live in `profiles` and are read on every request, so a demotion or switch-off bites at once. All tables have row-level security on with no policies: only the server, with the secret key, touches them, after `lib/dal.ts` has checked the caller. Network tokens are sealed with AES-256-GCM before they are stored.

## Demo

1. Open the home page. The rate card and the four days are the company.
2. Open the desk. Approve a draft. Cue it: with Inngest and a connected network it posts at its slot.
3. Paste a brief and cut the day.
4. Request a campaign from the home page. A confirmation email goes out and it shows up under Requests; pay the deposit and it turns Won.
5. Make an account from the request, open a board for that client, and review it as the client from `/account`.
