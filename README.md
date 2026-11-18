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

## Demo

1. Open the home page. The rate card and the four days are the company.
2. Open the desk. Approve a draft. Cue it. Nothing is sent to a network.
3. Paste a brief and cut the day.
4. Request a pilot from the home page. It shows up under Requests.
