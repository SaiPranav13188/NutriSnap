# NutriSnap — Full Project Plan
### (A Cal AI–style AI Calorie & Macro Tracker — Web + iOS + Android)

---

## 0. What you're building, in one paragraph

A cross-platform app where a new user answers a short onboarding quiz (goal: lose / maintain / gain weight, plus body stats and activity level), the app calculates their personalized daily calorie and macro targets (protein/carbs/fat), and from then on the user snaps a photo of their food, an AI vision model identifies the dish and portion, and the app logs calories + protein + carbs + fat + sugar automatically. A dashboard shows daily rings (like your Image 1), and a Progress tab shows a weight/calorie trend graph filterable by 90D / 1M / 6M / 1Y / All (like your Image 4). Built with a Next.js web app, an Expo (React Native) mobile app for iOS/Android, a shared Supabase backend, a small API layer for AI food-recognition, deployed on Vercel (web) and Render (API worker), testable instantly via Expo Go.

---

## 1. Reference research — what Cal AI–style apps ask before login

Based on Cal AI and similar top apps (Dr. Cal, FoodPilot, CaloCare), the onboarding pattern is consistent. Yours should follow this shape:

### 1.1 Universal questions (asked to everyone, before the goal-specific branch)
1. **Gender** — Male / Female / Other
2. **Goal** — Lose weight / Maintain weight / Gain weight *(this branches the flow — see 1.2)*
3. **Date of birth / Age**
4. **Height** — with unit toggle (cm / ft‑in), slider-style picker
5. **Current weight** — with unit toggle (kg / lb), slider-style picker
6. **Activity level** — Sedentary / Lightly active / Moderately active / Very active / Extremely active (this drives the TDEE multiplier)
7. **How many workouts per week?** — 0 / 1–3 / 4–6 / 7+
8. **Where did you hear about us?** (optional, marketing) — App Store / TikTok / Instagram / Friend / Other
9. **Have you tried other calorie tracking apps before?** — Yes / No (used to tune the "why we're different" screen)
10. **Any dietary preference?** — Classic / Vegetarian / Vegan / Pescatarian *(affects future food suggestions, optional)*
11. **Any foods to avoid / allergies?** (optional free text or chips: gluten, dairy, nuts, shellfish…)

### 1.2 Goal-specific branch questions

**If "Lose weight":**
- Target/goal weight (slider, must be less than current weight)
- Desired rate of loss — 0.25 / 0.5 / 0.75 / 1 kg per week (shows an "aggressive vs. steady" hint — faster = lower calorie target)
- "Do you want a summer/event deadline?" — optional target date, used to draw the projected-weight-loss graph (like CaloCare/Calorie Counter apps do)

**If "Maintain weight":**
- Confirm current weight as goal weight
- Focus area — General health / Improve energy / Build better habits / Track macros precisely

**If "Gain weight" (bulk / muscle gain):**
- Target/goal weight (must be greater than current weight)
- Desired rate of gain — 0.25 / 0.5 / 0.75 kg per week (lean bulk vs. faster bulk)
- Training focus — Strength training / General fitness / Athlete / Not currently training (affects protein target — lifters get higher g/kg protein)

### 1.3 Closing / trust screens (optional but recommended, matches Cal AI conversion pattern)
- A short "how it works" screen (snap a photo → AI detects food → auto-logs macros)
- A "Crafting your plan…" animated loading screen (2–3 seconds, cycles through checks: "Calculating BMR," "Setting macro split," "Applying activity level," "Personalizing plan")
- Final reveal screen: shows computed daily calorie target + macro rings, with a "This is based on your BMR and activity level" note, before Sign Up / Log In

### 1.4 Auth
- Continue with Apple / Continue with Google / Email+Password (Supabase Auth handles all three)
- Do the quiz **before** requiring login (this maximizes completion, matches every reference app), then save answers to the account right after signup.

---

## 2. The core calculation — calories fully driven by height, weight, and goal

This is the formula engine. Use it exactly like this so the numbers are defensible and match how Cal AI-style apps compute it.

### Step 1 — BMR (Mifflin-St Jeor equation, the modern standard, more accurate than Harris-Benedict)
```
Male:   BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age(years) + 5
Female: BMR = 10 × weight(kg) + 6.25 × height(cm) − 5 × age(years) − 161
```

### Step 2 — TDEE (Total Daily Energy Expenditure) = BMR × activity multiplier
```
Sedentary (little/no exercise):        × 1.2
Lightly active (1–3 workouts/wk):      × 1.375
Moderately active (3–5 workouts/wk):   × 1.55
Very active (6–7 workouts/wk):         × 1.725
Extremely active (physical job/2x/day):× 1.9
```

### Step 3 — Adjust TDEE for the goal
```
Lose weight:  daily target = TDEE − (rate_kg_per_week × 7700 / 7)
              (7700 kcal ≈ 1 kg of fat; e.g. 0.5 kg/week → −550 kcal/day)
              Never let the target fall below 1200 (female) / 1500 (male) — enforce a safety floor.

Maintain:     daily target = TDEE

Gain weight:  daily target = TDEE + (rate_kg_per_week × 7700 / 7)
              (typical lean bulk = +250–500 kcal/day)
```

### Step 4 — Macro split (grams), goal-dependent
```
Protein:
  Lose weight / Maintain: 1.6–2.0 g per kg of bodyweight (preserves muscle in a deficit)
  Gain weight + training:  1.8–2.2 g per kg of bodyweight

Fat: 25–30% of total daily calories ÷ 9 kcal/g

Carbs: remaining calories ÷ 4 kcal/g
  (total_calories − protein_kcal − fat_kcal) / 4
```

### Step 5 — Store all of this per user in `daily_targets` so it can be recalculated whenever weight/goal changes (weekly recompute, exactly like Cal AI adjusts your plan as you log weigh-ins).

This logic should live in ONE shared function (e.g. `calculateTargets()`), imported by both the web app and the mobile app (put it in a shared `packages/core` module — see architecture below) so numbers never drift between platforms.

---

## 3. Feature list (what the app actually does)

### 3.1 Food logging via photo (the headline feature)
- Camera screen with a big shutter button (mirrors Image 2): "Scan Food," "Barcode," "Food Label" tabs
- User snaps a photo → image uploads to storage → sent to a vision AI model → model returns:
  - Dish name
  - Ingredient list with individual calorie contribution (like "Lettuce," "Parmesan," "Croutons," "Cherry Tomatoes" in Image 2)
  - Total **calories, protein (g), carbs (g), fat (g), sugar (g)** — sugar is the extra you asked for beyond Cal AI's default 3
  - **Bonus fields worth adding beyond Cal AI:** fiber (g), sodium (mg), a confidence score (%) on the estimate, and estimated portion size in grams so the user can nudge it with a stepper
- Results screen (mirrors Image 3): editable serving-size stepper ("1x"), "Fix Results" button (re-prompts the AI with a correction, e.g. "this is 2 servings not 1"), ingredient list is editable/removable, "Add more" ingredients manually
- On "Done," this gets written to `food_logs` and instantly reflected in the day's ring totals

### 3.2 Other logging methods
- **Barcode scanner** — looks up a packaged product via Open Food Facts API (free, no key needed) or Nutritionix
- **Food label scanner** — OCR the nutrition facts panel (vision model can do this directly)
- **Manual text entry** — "Fried rice and egg" → AI parses it into structured macros (natural-language logging, seen in reference apps)
- **Favorites / recent foods** — one-tap re-log

### 3.3 Home dashboard (mirrors Image 1)
- Week strip (Sun–Sat) with a completion ring per day, streak flame counter (top right)
- Big calorie ring: "X / Y calories eaten," remaining calories emphasized
- Three sub-rings: Protein / Carbs / Fat, each with eaten/target
- "Recently uploaded" feed of logged meals with thumbnail, name, time, calories, and macro chips

### 3.4 Progress tab (mirrors Image 4 — this is what you specifically asked for)
- Weight card: current weight, progress bar toward goal weight, "Log Weight" button
- Streak card: day-streak flame + weekly checkmark row
- **Weight Progress graph** with a segmented control: **90D / 1M / 6M / 1Y / ALL** — exactly the filters you asked for
  - Line/area chart, tooltip on tap showing date + weight
  - Dotted goal-weight reference line
  - Dynamic encouragement message under the chart ("Great job! Consistency is key…") generated from trend direction
- Daily Average Calories card with week-over-week % change
- **Extra chart worth adding:** stacked macro-over-time chart (protein/carbs/fat per day) and a "calories in vs. TDEE" chart so users see deficit/surplus trend, not just weight

### 3.5 Groups / Social (optional, seen in Image 1's nav — can be phase 2)
- Friends, shared challenges, leaderboards

### 3.6 Profile & Settings
- Edit body stats (triggers target recompute)
- Change goal (lose/maintain/gain) any time
- Units toggle (metric/imperial)
- Notifications: meal reminders, streak reminders
- Export data (CSV)
- Apple Health / Google Fit sync (phase 2 — pulls in workout calories to adjust TDEE dynamically, like the watch complication in Image 5)

### 3.7 Apple Watch–style widget concept (Image 5)
- If you build the Expo app with `expo-dev-client`, a companion watch app is a stretch goal (WatchOS needs native Swift — flag this as **out of scope for MVP**, note it as a phase-3 item). For MVP, replicate the same three "pill" stat cards as a home-screen widget instead (Expo supports widgets via `expo-widgets`/native modules) or simply skip and revisit later.

---

## 4. Futuristic UI/UX direction

**Visual language:** dark-first "bio-glass" theme — deep charcoal/near-black backgrounds, translucent frosted-glass cards (glassmorphism), a single vivid accent gradient (e.g., electric lime → cyan, or coral → violet) used only for the calorie ring and CTAs so it stays purposeful, not noisy. Rounded-2xl corners, soft ambient shadows, subtle grain/noise texture on backgrounds for depth.

**Typography:** one geometric sans (e.g., "General Sans," "Satoshi," or "Inter" as a free fallback) — big, confident numbers for calories/macros (this is what makes Cal AI's UI feel premium — huge numerals, small labels).

**Motion (the "realistic animation" you asked for):**
- Ring charts animate their arc from 0 → value with spring easing on every screen load (`react-native-reanimated` on mobile, `Framer Motion` on web)
- Camera → results transition: photo flies up into a card, ingredient labels "pop in" sequentially with a pointer-line draw animation, exactly like Image 2's leader-lines to "Lettuce/Parmesan/Croutons" — animate those lines drawing in with a stroke-dashoffset animation
- Number counters animate (count up from 0 to 1250 calories) using a spring/ease-out tween
- "Crafting your plan" onboarding loader: animated checklist ticking off items with haptic feedback on mobile
- Micro-interactions: button press scale-down (0.96), success toast slide-in with a confetti burst on hitting a streak milestone, pull-to-refresh with a custom liquid/blob animation
- Page transitions: shared-element transition from a meal card to its full nutrition detail screen (Framer Motion `layoutId` on web, `react-navigation` shared element transitions on mobile)
- Use **Lottie** for a couple of hero animations (scanning radar effect over the camera viewfinder while AI is processing)

**Libraries to use:**
- Web: Tailwind CSS + Framer Motion + Recharts (for the progress graphs) + Lottie-react
- Mobile: NativeWind (Tailwind for RN) + React Native Reanimated + Victory Native or React Native Gifted Charts (for the same graphs) + Lottie-react-native

---

## 5. Architecture & tech stack

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│   Web App (Next.js 14)      │        │  Mobile App (Expo / RN)  │
│   Vercel deployment         │        │  Expo Go for dev/testing │
│   Tailwind + Framer Motion  │        │  NativeWind + Reanimated │
└──────────────┬──────────────┘        └─────────────┬────────────┘
               │  both call the same REST/Edge API      │
               └───────────────┬─────────────────────────┘
                                ▼
                  ┌───────────────────────────┐
                  │   API layer (Node/Express  │
                  │   or Fastify) — Render     │
                  │   - /auth (delegates to    │
                  │     Supabase Auth)         │
                  │   - /food/analyze (image → │
                  │     vision AI → macros)    │
                  │   - /targets/calculate     │
                  │   - /logs (CRUD)           │
                  │   - /progress (aggregates) │
                  └──────────────┬─────────────┘
                                 ▼
                  ┌───────────────────────────┐
                  │        Supabase           │
                  │  - Postgres (all tables)  │
                  │  - Auth (email/Google/    │
                  │    Apple)                 │
                  │  - Storage (meal photos)  │
                  │  - Row Level Security     │
                  │  - Realtime (optional,    │
                  │    live dashboard updates)│
                  └──────────────┬─────────────┘
                                 ▼
                  ┌───────────────────────────┐
                  │  AI Vision Provider        │
                  │  (Anthropic Claude Vision  │
                  │   or OpenAI GPT-4o Vision) │
                  │  + Open Food Facts API     │
                  │    for barcode lookups     │
                  └───────────────────────────┘
```

**Why this split:**
- **Vercel** for the Next.js web app — first-class support, edge functions, instant preview deploys.
- **Render** for the API service — a long-running Node server is a better fit there than serverless when you're doing image processing/AI calls that can take a few seconds (avoids serverless cold-start/timeout headaches on Vercel functions).
- **Supabase** is the single source of truth for both clients — same database, same auth, same storage bucket, so web and mobile users are always in sync.
- **Expo** lets you build one React Native codebase for iOS + Android and test instantly on a physical phone via the **Expo Go** app during development (no need to build native binaries until you're ready to publish to the App Store/Play Store, at which point you switch to EAS Build).

### 5.1 Monorepo layout (recommended)
```
nutrisnap/
├── apps/
│   ├── web/              # Next.js app → deployed on Vercel
│   └── mobile/           # Expo app → run with `npx expo start`, opened in Expo Go
├── services/
│   └── api/              # Node/Fastify API → deployed on Render
├── packages/
│   ├── core/             # shared TS: calculateTargets(), macro math, types
│   └── ui/                # optional shared design tokens (colors, spacing)
├── supabase/
│   ├── migrations/       # SQL schema, versioned
│   └── seed.sql
└── turbo.json / pnpm-workspace.yaml
```
Use **Turborepo** + **pnpm workspaces** to share the `core` calculation package between web and mobile so the calorie math is identical everywhere.

---

## 6. Database schema (Supabase / Postgres)

```sql
-- Extends Supabase's built-in auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  gender text check (gender in ('male','female','other')),
  date_of_birth date,
  height_cm numeric,
  goal text check (goal in ('lose','maintain','gain')),
  current_weight_kg numeric,
  goal_weight_kg numeric,
  rate_kg_per_week numeric default 0.5,
  activity_level text check (activity_level in
    ('sedentary','light','moderate','very_active','extreme')),
  workouts_per_week text,
  dietary_preference text,
  allergies text[],
  units text default 'metric',
  onboarding_completed boolean default false,
  created_at timestamptz default now()
);

create table daily_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  effective_date date default current_date,
  created_at timestamptz default now()
);

create table food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  photo_url text,
  name text,
  serving_multiplier numeric default 1,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  sugar_g numeric,
  fiber_g numeric,
  sodium_mg numeric,
  ai_confidence numeric,
  ingredients jsonb,               -- [{name, calories, grams}, ...]
  logged_at timestamptz default now(),
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack'))
);

create table weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  weight_kg numeric,
  logged_at timestamptz default now()
);

create table streaks (
  user_id uuid primary key references profiles(id) on delete cascade,
  current_streak int default 0,
  longest_streak int default 0,
  last_logged_date date
);

-- Row Level Security: every table's SELECT/INSERT/UPDATE restricted to `auth.uid() = user_id`
```

---

## 7. API endpoints (service on Render)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/onboarding/complete` | Save quiz answers → calls `calculateTargets()` → writes `profiles` + `daily_targets` |
| POST | `/api/food/analyze` | Accepts an image (or base64) → calls vision AI → returns structured macros + ingredient breakdown |
| POST | `/api/food/analyze-text` | Natural-language meal description → structured macros |
| POST | `/api/food/barcode/:code` | Looks up Open Food Facts / Nutritionix → returns macros |
| GET | `/api/logs?date=` | Get a day's food logs + totals |
| POST | `/api/logs` | Create/edit a food log entry (after user hits "Done"/"Fix Results") |
| DELETE | `/api/logs/:id` | Remove a log |
| POST | `/api/weight` | Log a new weight entry → recomputes targets if trend requires it |
| GET | `/api/progress?range=90d\|1m\|6m\|1y\|all` | Aggregated weight + calorie series for the Progress graphs |
| GET | `/api/targets` | Current daily targets |

**Vision AI prompt pattern for `/api/food/analyze`** (send the photo + this instruction to Claude/GPT-4o vision):
> "Identify the food in this image. Return strict JSON: `{ name, confidence_0_to_1, estimated_grams, ingredients: [{name, grams, calories}], totals: { calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg } }`. Base nutrition values on standard USDA nutrition data for the identified ingredients and estimated portion size."

---

## 8. Build roadmap (suggested order)

1. **Supabase setup** — create project, run the schema migration above, enable email+Google+Apple auth, create a `meal-photos` storage bucket with RLS.
2. **Shared `core` package** — implement `calculateTargets()` and macro-split logic, unit-test it against known BMR values.
3. **API service skeleton** on Render — auth middleware (verify Supabase JWT), the onboarding + targets endpoints first.
4. **Web app onboarding flow** — build the full quiz (branches by goal) in Next.js, hook it to `/api/onboarding/complete`.
5. **Web dashboard** — calorie/macro rings, manual food entry first (fastest to validate the data model) before wiring AI vision.
6. **AI food photo pipeline** — image upload → Supabase Storage → `/api/food/analyze` → vision model → results screen with editable ingredients.
7. **Progress graphs** — implement the 90D/1M/6M/1Y/All aggregation endpoint and Recharts UI.
8. **Polish pass** — animations (Framer Motion), glassmorphism theme, loading states, empty states.
9. **Mirror everything in Expo mobile app**, reusing the `core` package and hitting the same API — test continuously via `npx expo start` scanned into **Expo Go** on your phone.
10. **Deploy**: web → Vercel, API → Render, mobile → EAS Build for TestFlight/Play internal testing once it's stable in Expo Go.

---

## 9. The master build prompt

Copy everything in the box below into an AI coding assistant (Claude Code, Cursor, etc.) as your first message to scaffold the whole project. It encodes everything above.

```
You are building "NutriSnap," a Cal AI–style AI calorie tracking app, as a
pnpm + Turborepo monorepo with this exact structure:

apps/web        -> Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion + Recharts
apps/mobile     -> Expo (React Native) + TypeScript + NativeWind + React Native Reanimated
                   + React Native Gifted Charts, runnable instantly via `npx expo start`
                   and scanning the QR code in Expo Go
services/api    -> Node.js + Fastify (or Express) TypeScript API, deployable to Render
packages/core   -> shared TypeScript: calorie/macro calculation engine + shared types
supabase/       -> SQL migrations for the schema below

DATA MODEL (Postgres via Supabase):
- profiles(id, full_name, gender, date_of_birth, height_cm, goal[lose|maintain|gain],
  current_weight_kg, goal_weight_kg, rate_kg_per_week, activity_level, workouts_per_week,
  dietary_preference, allergies[], units, onboarding_completed, created_at)
- daily_targets(id, user_id, calories, protein_g, carbs_g, fat_g, effective_date, created_at)
- food_logs(id, user_id, photo_url, name, serving_multiplier, calories, protein_g, carbs_g,
  fat_g, sugar_g, fiber_g, sodium_mg, ai_confidence, ingredients jsonb, logged_at, meal_type)
- weight_logs(id, user_id, weight_kg, logged_at)
- streaks(user_id, current_streak, longest_streak, last_logged_date)
Apply Row Level Security so users only access their own rows.

CALCULATION ENGINE (packages/core, must be identical on web & mobile):
1. BMR (Mifflin-St Jeor):
   male:   10*weight_kg + 6.25*height_cm - 5*age + 5
   female: 10*weight_kg + 6.25*height_cm - 5*age - 161
2. TDEE = BMR * activity multiplier
   sedentary 1.2, light 1.375, moderate 1.55, very_active 1.725, extreme 1.9
3. Goal adjustment:
   lose: TDEE - (rate_kg_per_week * 7700 / 7), floor at 1200 kcal (female) / 1500 kcal (male)
   maintain: TDEE
   gain: TDEE + (rate_kg_per_week * 7700 / 7)
4. Macros:
   protein_g = bodyweight_kg * (1.6 to 2.2 depending on goal/training)
   fat_g = (0.275 * total_calories) / 9
   carbs_g = (total_calories - protein_g*4 - fat_g*9) / 4
Export a pure function `calculateTargets(profile): { calories, protein_g, carbs_g, fat_g }`.

ONBOARDING FLOW (before login, save to Supabase right after signup):
Universal: gender, goal(lose/maintain/gain), date_of_birth, height (metric/imperial toggle,
slider UI), current_weight (slider UI), activity_level, workouts_per_week, dietary_preference,
allergies, "how did you hear about us", "have you tried other apps before".
Branch by goal:
  lose -> goal_weight (< current), desired weekly loss rate, optional target date
  maintain -> confirm goal_weight = current_weight, focus_area
  gain -> goal_weight (> current), desired weekly gain rate, training_focus
End with an animated "Crafting your plan..." loader (checklist ticking: Calculating BMR,
Setting macro split, Applying activity level, Personalizing plan), then reveal the computed
calorie/macro targets with animated count-up numbers, THEN show sign up (Apple/Google/Email
via Supabase Auth).

CORE FEATURES:
1. Camera-based food logging: capture/upload a photo -> POST to /api/food/analyze -> a vision
   AI model (Anthropic Claude vision or OpenAI GPT-4o vision) returns JSON: name, confidence,
   estimated_grams, ingredients[{name, grams, calories}], totals{calories, protein_g, carbs_g,
   fat_g, sugar_g, fiber_g, sodium_mg}. Show an animated results screen with leader-lines
   pointing at ingredients in the photo (draw-in line animation), an editable serving-size
   stepper, a "Fix Results" button that re-prompts the AI with user corrections, and "Done"
   which writes to food_logs and updates the day's totals.
2. Barcode scanning via Open Food Facts API; food label OCR via the vision model; manual
   natural-language meal entry (e.g. "fried rice and egg") parsed by the same vision/text model.
3. Home dashboard: week strip with per-day completion rings, streak counter, big animated
   calorie ring (eaten/target), three sub-rings for protein/carbs/fat, "Recently uploaded" feed.
4. Progress tab: weight card with goal progress bar and "Log Weight" action, streak card,
   a weight-over-time chart with a segmented filter for 90D / 1M / 6M / 1Y / ALL (fetch
   aggregated series from GET /api/progress?range=), a daily-average-calories card with
   week-over-week % change, and a stacked macro-over-time chart.
5. Profile/settings: edit body stats & goal (recomputes targets), units toggle, notifications,
   CSV export.

API (services/api on Render):
POST /api/onboarding/complete, POST /api/food/analyze, POST /api/food/analyze-text,
POST /api/food/barcode/:code, GET/POST/DELETE /api/logs, POST /api/weight,
GET /api/progress?range=, GET /api/targets. All routes verify a Supabase JWT.

UI/UX DIRECTION — "futuristic bio-glass":
Dark-first theme, deep charcoal background, frosted glassmorphism cards, one vivid accent
gradient (electric lime -> cyan) reserved for rings/CTAs, rounded-2xl corners, big confident
numerals for calories/macros, geometric sans font. Animate: ring charts drawing from 0 to
value with spring easing on load; numeric counters animating upward; the "Crafting your
plan" checklist loader; leader-line draw-in on food-photo results; button press scale
micro-interaction; confetti burst on streak milestones; shared-element transition from a
meal card into its detail view. Use Lottie for a scanning-radar effect over the camera
viewfinder while the AI call is in flight.

DEPLOYMENT:
- apps/web deploys to Vercel (connect the GitHub repo, root directory apps/web).
- services/api deploys to Render as a Web Service (Node), with SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, and the vision-model API key as environment variables.
- apps/mobile runs in development via `npx expo start` and is opened by scanning the QR
  code with the Expo Go app on a physical iOS/Android phone; when ready for production,
  switch to `eas build` for TestFlight/Play Store binaries.
- Supabase project holds Postgres + Auth + Storage for both web and mobile.

Start by scaffolding the monorepo structure and the Supabase migration file, then build
packages/core with tests, then the API's onboarding+targets endpoints, then the web
onboarding flow end-to-end, then the mobile app reusing the same core package and API.
```

---

## 10. Advanced / 2026-era features worth adding

I checked what the current best-in-class apps (PlateLens, SnapCalorie, MacroFactor, Cronometer) are doing in 2026 beyond the basic Cal AI feature set. Here's what's genuinely worth building in, roughly ordered by effort-to-value:

### 10.1 Adaptive/dynamic calorie targets (high value, low effort)
Instead of a static number computed once at onboarding, recompute the target weekly using **actual logged intake vs. actual weight change** — this is what MacroFactor and PlateLens are known for and it's a big differentiator from basic Cal AI clones. If a user logs 1800 kcal/day for 2 weeks and their weight isn't moving the way the math predicted, their true TDEE is different from the formula estimate — adjust the target to match reality instead of trusting Mifflin-St Jeor forever.
```
new_TDEE ≈ old_TDEE + (expected_weight_change − actual_weight_change) × 7700 / days_elapsed
```
Add a `target_adjustments` table logging each recompute with the reason, and surface it to the user transparently ("We adjusted your target from 1850 → 1920 kcal based on your last 14 days").

### 10.2 AI nutrition coach / chatbot
A conversational assistant (same Claude API you're already using) that can see the user's own logged history and answer things like "why am I not losing weight this week?" or "what should I eat for dinner to hit my protein goal?". Feed it the last 7–14 days of `food_logs` + `weight_logs` + `daily_targets` as context. This is now a standard feature in top-ranked 2026 apps, not a nice-to-have.

### 10.3 Multimodal portion accuracy improvements
Plain single-photo estimation typically has meaningful error on portion size specifically (ingredient identification is already quite good — 85%+ — but grams-per-ingredient is the weak point). Two upgrades, easiest first:
- **Reference-object calibration:** ask the user to include a common reference (their hand, a standard fork/plate) in frame, or let them tap "this looks like X grams" to recalibrate — cheap and effective.
- **iPhone Pro / LiDAR depth capture (phase 2, iOS only):** if `expo-camera` exposes depth data on supported devices, use it to estimate volume directly instead of relying purely on 2D visual guessing. Flag as an enhancement, not MVP-blocking.
- Always show the AI's confidence and let the user nudge portion with the stepper — this loop matters more than any single model upgrade.

### 10.4 Voice logging
Add a mic button next to manual text entry — "log a chicken salad and an apple" spoken instead of typed. Use `expo-speech`/the browser's Web Speech API for capture, then send the transcript through the same `/api/food/analyze-text` endpoint you already have. Very low incremental cost since the text-parsing path already exists.

### 10.5 Continuous Glucose Monitor (CGM) / wearable integration (phase 2+)
2026's top-ranked apps for metabolic health sync with Dexcom/Libre and Apple Health/Google Health Connect to show glucose response alongside meals, and pull in workout calories to adjust the day's remaining budget in real time (this is exactly the "Burn an extra 500 cal, unlock a bigger lunch" pattern some apps use). Concretely:
- Apple Health / Google Health Connect sync for steps + workouts → dynamically add earned calories to the day's target
- Optional CGM data pull (read-only) plotted on the same timeline as meals, purely informational — **do not** make clinical claims like "this food caused your glucose spike"; correlation display only, and this is health-adjacent enough that it deserves a clear non-medical-advice disclaimer.

### 10.6 Predictive / forecasting features
Using the user's own historical pattern (not medical claims — just their own trend), forecast: "at your current pace, you'll hit your goal weight around [date]" on the Progress graph as a dotted projection line, and a gentle plateau-detection nudge ("your weight hasn't moved in 10 days — want to adjust your target or check your logging consistency?").

### 10.7 Meal planning / recipe suggestions
Given the day's remaining calorie/macro budget, suggest a meal that would fit ("You have 480 kcal and 40g protein left — here are 3 dinner ideas"). Can start as simple template-based suggestions and later become AI-generated with the same Claude API, respecting the dietary preference/allergies captured at onboarding.

### 10.8 Body composition / measurements tracking
Beyond a single weight number: optional waist/hip/chest measurements, progress photos (stored privately in Supabase Storage, never shared without explicit action), and body-fat % estimate if the user provides it — all plotted on their own timeline alongside weight.

### 10.9 Habit/streak gamification beyond the daily flame
Weekly challenges, badges for logging streaks or hitting protein goals N days in a row, and a "consistency score" that rewards logging itself (even imperfect logging) since consistency — not precision — is what the research shows actually predicts results.

### 10.10 Full data ownership export
A one-tap "export everything as JSON/CSV" in Settings. Several 2026-ranked apps now lead with this as a trust feature — it costs little to build (you already have all the data in Postgres) and is a strong selling point.

**Suggested priority for your build:** ship the MVP from Sections 1–9 first, then add in this order: 10.1 (adaptive targets) → 10.4 (voice logging) → 10.2 (AI coach) → 10.9 (gamification) → 10.10 (export) → 10.6 (forecasting) → 10.3/10.5/10.7/10.8 as phase-3 stretch goals.

---

## 11. Notes for building this in Cursor (automated agentic build)

Since you're building this with Cursor rather than by hand, a few adjustments make the automated build go smoother:

- **Give Cursor this whole document as context** (drop this `.md` file into the repo root, e.g. `PROJECT_PLAN.md`) before running the master prompt from Section 9 — Cursor's agent mode will reference it throughout the session instead of just reading your first message once.
- **Add a `.cursor/rules` file** (or `.cursorrules`) at the repo root pinning the non-negotiables so every agent action respects them, e.g.:
  ```
  - Always put shared calorie/macro logic in packages/core, never duplicate it in apps/web or apps/mobile.
  - Use TypeScript strict mode everywhere.
  - Every Supabase table must have Row Level Security enabled before the migration is considered done.
  - Never hardcode API keys; always read from environment variables.
  - Match the "bio-glass" dark futuristic theme described in PROJECT_PLAN.md for every screen.
  ```
- **Build in the phased order from Section 8**, as separate Cursor sessions/prompts rather than one giant one-shot generation — agentic coding tools do noticeably better accuracy when scoped to one layer at a time (schema → core package → API → web → mobile) rather than asked to generate the entire monorepo in a single pass.
- **Ask Cursor to write tests for `calculateTargets()` first**, using a few known BMR/TDEE reference values from Section 2, so you catch any math drift immediately if the agent refactors that file later.
- **Review the Supabase RLS policies it generates by hand** — this is the one area where an agent silently getting it wrong is genuinely dangerous (it would let users read each other's food/weight logs), so don't skip a manual check here even though everything else can be trusted to the automated flow.

---

## 12. Practical notes before you start

- **Vision AI cost/accuracy tip:** food-photo calorie estimation is inherently approximate (Cal AI itself is often off by 10–30%). Always show the AI's confidence and let users correct portions/ingredients — that "Fix Results" loop is what keeps accuracy acceptable in production, not the raw model.
- **Free tier for testing:** Open Food Facts (barcode data) is free and keyless — use it before paying for Nutritionix.
- **Expo Go limitation:** Expo Go can't run fully custom native modules. Everything listed above (NativeWind, Reanimated, Gifted Charts, camera, image picker, Lottie) works fine in Expo Go. Only if you later add something like a native WatchOS companion would you need a custom dev client/EAS build instead of Expo Go.
- **Legal:** if you ever monetize this, add a visible "not medical advice, consult a professional for medical nutrition therapy" disclaimer, since calorie/macro targets are general wellness guidance, not clinical advice.
