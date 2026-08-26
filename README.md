# Avantika & Prateek — Wedding OS

A planning system for Avantika Chowdhry and Prateek Mehan's wedding, targeting
16–19 June 2027.

It is not a checklist. Everything is connected: confirming twenty more guests
moves the catering forecast, the room requirement and the readiness score
without anyone editing a budget. When a number moves, the app says why.

---

## Running it locally

```bash
npm install
createdb ap_wedding_os                 # or point DATABASE_URL elsewhere
cp .env.example .env                   # then fill in DATABASE_URL and AUTH_SECRET
npx prisma migrate dev
npm run db:seed
npm run dev
```

Sign in with any of the nine accounts (starter password `wedding2027`):

| | |
|---|---|
| `avantika@apwedding.com` | Bride — Owner |
| `prateek@apwedding.com` | Groom — Owner |
| `namrita@apwedding.com` | Bride's Mother — Admin |
| `dheeraj@apwedding.com` | Bride's Father — Admin |
| `preeti@apwedding.com` | Groom's Mother — Admin |
| `ajay@apwedding.com` | Groom's Father — Admin |
| `anousha@apwedding.com` | Bride's Sister — Family |
| `trisha@apwedding.com` | Groom's Sister — Family |
| `aditya@apwedding.com` | Anousha's Partner — Family |

Everyone sees the whole wedding. Roles decide what each person can *change*.

### Useful commands

```bash
npm run dev        # dev server
npm test           # 55 domain tests — the forecast, readiness and impact engines
npm run health     # print what the engines currently compute, in the terminal
npm run db:seed    # rebuild from the couple's spreadsheet
npm run typecheck
```

---

## Where the data came from

The seed is built from the couple's own planning workbook, not invented content:

- **267 guests** across 84 households, with their tiers and attendance
  probabilities
- **112 room allocations** from the rooming plan
- **21 venue options** across Bali and Thailand (India ruled out)
- **The real budget split** — Chowdhry £80,370, Mehan £175,000
- **30 FX pairs** from their own rate table
- **15 milni pairings**

The wedding is seeded at the stage it is genuinely at: proposals in, no venue
chosen, no date locked, no invitations sent. Readiness is low because that is
the truth.

To re-import after editing the spreadsheet, regenerate
`prisma/data/wedding-import.json` and re-run `npm run db:seed`.

---

## Architecture

```
src/domain/     Pure functions over a snapshot. No database, no React.
                budget · readiness · impact · risk · timeline · guests · tasks
src/server/     Data access, auth, permissions, media, AI.
src/app/        Next.js App Router pages.
src/components/ UI primitives, media components, wedding-specific pieces.
```

The rule: **business logic lives in `src/domain` and nowhere else.** Every engine
is a pure function over a `WeddingSnapshot`, which is why the same code powers
the UI, the AI's tools and the tests. `src/server/snapshot.ts` is the only place
that knows how to build one.

Three decisions worth knowing:

- **Money** is stored as `Decimal(14,2)` in its original currency. Conversion
  happens at read time against dated `CurrencyRate` rows, so history stays
  truthful and each person can read the wedding in their own currency.
- **Times** are integer minutes from midnight, dates are `@db.Date`. Run-of-show
  arithmetic is exact and immune to timezone drift.
- **Alerts are computed, never stored.** Fix the problem and the alert
  disappears. Only dismissals persist.

---

## Deploying to Railway

The app needs a real filesystem for uploads, so it runs as a container with a
volume rather than serverless.

1. **New project → Deploy from GitHub repo.**
2. **Add a Postgres database.** Railway sets `DATABASE_URL` automatically.
3. **Add a Volume** to the app service, mounted at `/app/storage`.
4. **Set the variables:**

   ```
   AUTH_SECRET   = <openssl rand -base64 32>
   STORAGE_DIR   = /app/storage
   QWEN_API_KEY  = <optional>
   ```

5. Deploy. `railway.json` runs `prisma migrate deploy` on start.
6. Seed once, from the Railway shell: `npm run db:seed`.

> **The volume is not optional.** Without it, uploads succeed and then vanish on
> the next deploy, because container filesystems are ephemeral. `StorageService`
> is an interface — swapping to S3/R2 later means one new file, nothing else.

### Still to do before it's properly production-ready

- **Password changes.** Everyone shares the starter password; the schema has a
  `mustSetPassword` flag but the screen isn't built.
- **Email sign-in.** Magic links or OTP via Resend would remove passwords
  entirely — better than WhatsApping credentials.
- **Public RSVP pages.** Household tokens are generated and unguessable; the
  public page that consumes them isn't built.

---

## What the AI Planner can and can't do

It reads live wedding data through a fixed set of tools that run the same domain
engines as the UI — so it cannot see anything the viewer couldn't, and cannot
report a number that disagrees with the screen. Each answer lists which tools it
consulted.

It has **no write access**. Asked to change something, it explains what it would
change and what that would affect, then points at the page to do it on.

Without `QWEN_API_KEY` the page shows a clear notice and everything else works.
