# Monitoring & Observability — Aim Expense (S25 Phase 3)

> Setup checklist for soft-launch monitoring stack
> Updated: 2026-05-09

---

## 1. Vercel Analytics + Speed Insights

**Status: ✅ Code wired in S25A (commit Phase 3)**

- `<Analytics />` and `<SpeedInsights />` mounted in `src/app/layout.tsx`
- No env vars needed (auto-detected from Vercel project)
- Free tier — 25K events/month for Hobby; unlimited for Pro

### Verify post-deploy

1. Deploy to Vercel
2. Open https://vercel.com/<team>/<project>/analytics — should see page-view events
3. Open https://vercel.com/<team>/<project>/speed-insights — should see Core Web Vitals (FCP, LCP, TTFB, CLS)

---

## 2. Sentry — Error Tracking

**Status: ⚠️ Code wired but DSN-gated (Sentry won't fire until DSN env vars are set)**

### Files added

- `sentry.client.config.ts` — browser
- `sentry.server.config.ts` — Node runtime
- `sentry.edge.config.ts` — middleware
- `next.config.mjs` — wrapped with `withSentryConfig` (no-op without DSN)

### Setup steps (TODO before launch)

1. Create Sentry project at https://sentry.io (free tier: 5K errors/month)
2. Copy DSN
3. Add to `.env.local`:
   ```
   SENTRY_DSN=https://...@sentry.io/...
   NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
   SENTRY_ORG=<your-sentry-org-slug>
   SENTRY_PROJECT=<your-project-slug>
   SENTRY_AUTH_TOKEN=<from sentry org settings → auth tokens>
   ```
4. Add same vars to Vercel project env (settings → environment variables)
5. Deploy + trigger a test error to confirm it shows up in Sentry dashboard
6. Set up alert rule: `event.count > 50 in 1 hour` → Slack/email

### What gets tracked

- Unhandled exceptions (server + client)
- 10% sample of transactions (tracesSampleRate: 0.1)
- Replays only on errors (replaysOnErrorSampleRate: 1.0)
- **PII scrubbing:** Sentry's default scrubbing strips `password`, `token`, `authorization` headers. Audit other field names if exposing receipt content (we don't currently log receipt content)

---

## 3. Cache Hit/Miss Observability

**Status: ✅ In `src/server/lib/cache.ts`**

### Per-process counters

```typescript
import { getCacheStats } from "@/server/lib/cache";
const { hits, misses, errors } = getCacheStats();
// hit ratio = hits / (hits + misses)
```

### Vercel logs grep patterns

- `[sheets-api] get tab=...` — every Sheets API read (cache miss)
- `[sheets-api] batchGet tabs=...` — every batchGet API call
- `[cache] get failed` / `[cache] set failed` / `[cache] mget failed` — Redis errors (rare)

### Expected baseline (after launch)

- Hit ratio target: **>70%** within first hour of warm traffic
- Cache miss rate per org: ~2/min (one per 30s TTL window per active tab)
- Sheets API quota usage drop: **~80-90%** vs no-cache baseline

---

## 4. Google Sheets API quota dashboard

Monitor at: https://console.cloud.google.com/apis/api/sheets.googleapis.com/quotas

Quota requested 2026-05-03 (status: pending Google approval — check `dev@aimexpense.com` inbox):
- Read req/min/project: 300 → **3,000**
- Read req/min/user: 60 → **600**
- Write req/min/project: 300 → **600**

### Soft-launch SLO

- Stay below 80% of read quota per minute (with cache → should be ~10-30% headroom)
- 0% rate of `RATE_LIMIT_EXCEEDED` (429) errors

---

## 5. Load test (autocannon)

**Script:** `scripts/load-test/smoke.mjs`

```bash
# Public route (login)
node scripts/load-test/smoke.mjs

# Authed route (need cookie from logged-in browser)
TARGET_URL=http://localhost:3000/quotations \
TARGET_COOKIE='aim-session=...' \
DURATION=30 CONNECTIONS=50 \
node scripts/load-test/smoke.mjs
```

### Baseline result (S25A)

```
target:      http://localhost:3000/login
duration:    15s
connections: 50

avg latency:   50 ms
p99 latency:   79 ms
req/sec:       985.8
errors:        0
5xx:           0
```

✅ PASS — well under target (avg<1s, p99<3s, 0 5xx)

### Pre-launch validation

Run on **production-like environment** (Vercel preview deploy) with:
- 50 concurrent users on /quotations (with cache warmed)
- 100 concurrent users for stress test
- Verify cache hit ratio in Vercel logs during run

---

## 6. Status page (TODO post-launch)

- Free tier: BetterStack, UpDown.io, or Atlassian Statuspage
- Subscribe to: Vercel, Supabase, Google Cloud, LINE, Upstash

---

## Quick wire-check (post-deploy)

| Component | Quick check | Expected |
|-----------|-------------|----------|
| Vercel Analytics | open dashboard after 5min | events appear |
| Speed Insights | open dashboard after 5min | Web Vitals appear |
| Sentry (when DSN set) | force `throw new Error("test")` in route | error in Sentry within 1min |
| Cache | hit /quotations twice in 30s | 2nd is faster (~30-80ms vs 250ms) |
| Sheets API logs | grep `[sheets-api]` in Vercel logs | one entry per cache miss |
| autocannon | run smoke.mjs locally | PASS verdict |
