# NutriSnap

A Cal AI–style AI calorie and macro tracker. Photograph a meal, and a vision model
identifies the dish, breaks it into ingredients, and logs calories, protein, carbs, fat,
sugar, fibre and sodium against a target calculated from your own body and goal.

Web, iOS and Android share one Supabase backend, one API, and — critically — one copy of
the calorie maths.

The full product specification is in [NutriSnap_project_plan.md](NutriSnap_project_plan.md).

---

## What's here

```
nutrisnap/
├── apps/
│   ├── web/          Next.js 15 App Router → Vercel
│   └── mobile/       Expo SDK 57 (React Native) → Expo Go, then EAS Build
├── services/
│   └── api/          Fastify + TypeScript → Render
├── packages/
│   ├── core/         Calorie/macro engine, shared types, onboarding quiz (70 tests)
│   └── ui/           Design tokens for the bio-glass theme
└── supabase/
    └── migrations/   Schema, Row Level Security, aggregation functions
```

**`packages/core` is the single source of truth for every number in the app.** BMR, TDEE,
the goal adjustment, the safety floor, the macro split, the progress ranges and the
onboarding quiz definition all live there, and web, mobile and the API all import from it.
Nothing recalculates anything locally — that is what stops the two clients quietly
disagreeing about how many calories you have left.

---

## Prerequisites

- **Node 20+** and **pnpm 10+** (`corepack enable` will do)
- A **Supabase** project (free tier is fine)
- A **free Google Gemini API key** for the vision model ([aistudio.google.com/apikey](https://aistudio.google.com/apikey) — no card required)
- **Expo Go** on your phone, to run the mobile app without a native build

---

## Setup

### 1. Install

```bash
pnpm install
pnpm --filter @nutrisnap/core build
```

### 2. Supabase

Create a project, then run the three migrations in `supabase/migrations/` in order. Either
paste them into the SQL editor, or use the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

They create the schema, enable Row Level Security on every table, and create the private
`meal-photos` storage bucket.

In **Authentication → Providers**, enable Email, and Google/Apple if you want them. Add
`http://localhost:3000/auth/callback` to the allowed redirect URLs.

> **Check the RLS policies by hand before you put real data in.** This is the one place
> where a silent mistake means one user can read another's food and weight logs.
> `20260920000200_rls_policies.sql` is written to be read — every table gets explicit
> per-operation policies keyed on `auth.uid()`.

### 3. Environment

Copy `.env.example` and fill in each app's values:

```bash
# services/api/.env
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
GEMINI_API_KEY=<your gemini key>
API_CORS_ORIGINS=http://localhost:3000

# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_API_URL=http://localhost:8080

# apps/mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8080
```

The service role key bypasses Row Level Security. It belongs in `services/api` and
nowhere else — never in a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` variable.

For mobile, `EXPO_PUBLIC_API_URL` must be your machine's LAN address (`192.168.x.x`), not
`localhost` — a physical phone cannot reach your laptop's loopback.

### 4. Run

```bash
pnpm dev:api      # http://localhost:8080
pnpm dev:web      # http://localhost:3000
pnpm dev:mobile   # scan the QR code with Expo Go
```

---

## Verifying a change

```bash
pnpm test         # 70 unit tests over the calculation engine
pnpm typecheck    # every package
pnpm build        # core, api and web
```

The maths is pinned to published reference values — a 30-year-old 80 kg male at 180 cm has
a BMR of exactly 1780 kcal, 0.5 kg/week is exactly a 550 kcal/day deficit, and the safety
floor is enforced at 1200/1500 kcal. If a refactor moves any of those, the tests fail
rather than the numbers quietly drifting.

To check the mobile app still bundles for Expo Go without a phone in hand:

```bash
pnpm --filter @nutrisnap/mobile exec expo export --platform android
```

---

## Deployment

| Piece | Target | Notes |
|---|---|---|
| `apps/web` | Vercel | `vercel.json` at the root sets the monorepo build. Add the three `NEXT_PUBLIC_*` variables. |
| `services/api` | Render | `render.yaml` is a blueprint — connect the repo and set the secrets marked `sync: false`. |
| `apps/mobile` | Expo Go → EAS Build | Expo Go for development; `eas build` for TestFlight and Play internal testing. |
| Database | Supabase | Postgres, Auth and Storage for both clients. |

---

## Notes on the build

**If `expo start` fails with "Cannot find module .../@react-native/dev-middleware/dist/index.js".**
pnpm sometimes writes an incomplete nested copy of that package under
`node_modules/@expo/cli/node_modules/` — the folder exists but its `dist/` does
not. A complete copy is already at the workspace root, so deleting the broken
nested one lets Node resolve up to it:

```powershell
Remove-Item -Recurse -Force "node_modules/@expo/cli/node_modules/@react-native/dev-middleware"
```

Note that `expo export` succeeds even when this is broken — only the dev
server needs it, which is why a passing bundle check does not rule it out.

**Why the monorepo hoists.** `pnpm-workspace.yaml` sets `nodeLinker: hoisted`. Expo's Metro
bundler resolves transitive peers by walking `node_modules` directories, and pnpm's default
isolated store hides them — the bundle fails on imports that nothing declared directly. A
consequence is that both apps share one React, so `apps/web` pins the exact React version
Expo SDK 57 requires.

**Why the mobile charts are hand-drawn SVG.** The plan suggests Victory Native or Gifted
Charts. Both pull native dependencies that are not guaranteed inside Expo Go, and Expo Go is
how this app is meant to be tested. `react-native-svg` already ships inside Expo Go, so
`WeightChart` draws its own paths and runs on a physical phone with no custom dev client.

**Why food analysis uses structured outputs.** `/api/food/analyze` sends the photo together
with a JSON Schema generated from the same Zod schema that types the result, so the model is
constrained to return valid nutrition JSON rather than us parsing hopefully-valid text. The
response is still validated against that schema before it is trusted — a model is a model.
The provider lives in `services/api/src/ai/vision.ts` and nowhere else.

**About the free Gemini tier.** Google's free tier needs no card, but it is rate limited
(roughly 15 requests a minute — the API surfaces that as a clear 429) and **Google may use
prompts and images sent through it to improve their models**, meal photos included. That is
fine for development. Before this holds real users' data, move to a paid tier or a provider
that does not train on input. Swapping is a single file: `vision.ts` is the only place that
talks to a model.

**Accuracy.** Photo-based calorie estimation is approximate — ingredient identification is
good, grams-per-ingredient is the weak point. Every estimate carries a confidence score,
and the serving stepper plus the "Fix Results" correction loop are what keep it usable in
practice. That feedback loop matters more than any single model upgrade.

---

## Not yet built

Deliberately out of scope for this first pass, in the plan's suggested order: adaptive
weekly target recomputation is implemented in `packages/core` (`computeAdaptiveTarget`) and
has a database table waiting for it, but nothing calls it on a schedule yet. Voice logging,
the AI nutrition coach, gamification beyond the streak, Apple Health / Google Fit sync,
CGM integration, meal planning and the watch app are all untouched.

---

## Disclaimer

NutriSnap provides general wellness guidance, not medical advice. Calorie and macro targets
are estimates. Anyone with a medical condition, or making significant dietary changes,
should talk to a qualified professional.
