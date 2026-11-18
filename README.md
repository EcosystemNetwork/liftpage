# LiftPage

Attention into traction.

LiftPage is a social media marketing site for technology companies. The public pages sell the work: platforms, services, a campaign, and pricing. The production desk at `/desk` holds the HarnessRouter Labs pilot for The Big Hack Game (Nov 17–20, 2026). That campaign is an offer, not a signed partnership.

## Run

```bash
npm run dev
```

Desk: http://localhost:3070

## Keys

Copy `.env.example` to `.env.local`. The HarnessRouter key stays on the server. Model calls need a provider key in the HarnessRouter console (Bring Your Own Key). Until that key is there, LaunchLoop cuts the day with the local operator and says so on the run.

## Accounts

Set `LIFTPAGE_ADMIN_EMAIL` and `LIFTPAGE_ADMIN_PASSWORD` in `.env.local` before the first start. That makes the owner account. Set `LIFTPAGE_SESSION_SECRET` in production.

- `/login`, `/signup`: sign-in and client self sign-up (`LIFTPAGE_OPEN_SIGNUP=false` closes it).
- `/account`: a client's requests and weekly numbers (followers, impressions, engagements, clicks, leads per platform), plus a password change.
- `/admin`: clients, pipeline and won value, requests with status, and a customer table from the latest logged week.
- `/admin/users`: make accounts with a one-time password, switch accounts off, reset passwords, change roles.
- `/admin/customers/[id]`: one client's numbers; admins can log weeks for them.
- `/desk` and its APIs are admin-only.

Accounts and numbers live in `data/accounts.json` (git-ignored) next to `data/desk.json`. Passwords are scrypt hashes. Sessions are signed cookies that are checked against the account on every request, so switching an account off or changing its password signs it out everywhere.

## Demo

1. Open the home page. The rate card and the four days are the company.
2. Open the desk. Approve a draft. Cue it. Nothing is sent to a network.
3. Paste a brief and cut the day.
4. Request a pilot from the home page. It shows up under Requests.
