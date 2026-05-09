# Session 25A → Session 25B (or 26) — Handoff (FINAL)

> **Created:** 2026-05-09 (end of S25A)
> **Worktree:** `.claude/worktrees/compassionate-liskov-2bc32d`
> **Type check:** ✅ 0 errors
> **Smoke status:** All Phase 1+2+3 changes pass; autocannon /login = avg 50ms, p99 79ms, 985 req/s, 0 errors

---

## 🎯 ที่ทำใน Session 25A

### Phase 1 — Redis cache layer (Upstash)

- `npm install @upstash/redis` — added to package.json
- `src/server/lib/cache.ts` — new (getOrFetch / mget / invalidate / sheets-tab key helpers + counters)
- `src/server/services/google-sheets.service.ts`:
  - `getAll(tab)` → cached (TTL 30s)
  - `getAllBatch(tabs)` → mget cache → fall through to Sheets batchGet on partial miss → warm cache
  - `getConfigMap()` → cached separately
  - `appendRows / updateById / deleteById / setConfig` → invalidate tab key
  - `ensureAllTabsExist()` → invalidate tabs whose columns were extended
  - `[sheets-api]` structured log on every actual Sheets API call (= cache miss)
- `session25/design/CACHE_LAYER_ADR.md` — documents override of SYSTEM_REQUIREMENTS principle 3
- `.env.local` cleaned: removed 3 duplicate UPSTASH blocks; final block has correct token
- Smoke test: Upstash SET 166ms / GET 126ms (will be ~30-80ms on Vercel SG)

### Phase 2 — PDPA compliance

**Docs (`docs/legal/`):**
- `README.md`
- `PRIVACY_POLICY_TH.md` + `PRIVACY_POLICY_EN.md`
- `TERMS_OF_SERVICE_TH.md` + `TERMS_OF_SERVICE_EN.md`
- `SUB_PROCESSORS.md` — Vercel, Supabase, Google, LINE, Upstash, AksonOCR, OpenAI, Sentry, Stripe
- `DPA_TEMPLATE.md` — for B2B customers (business+ plan)
- `ROPA.md` — Record of Processing Activities (PDPA §39)
- `INCIDENT_RESPONSE.md` — breach runbook, 72h PDPC notification

**UI:**
- `src/lib/legal/version.ts` — bumped LEGAL_VERSION to 2026-05-09, added `DPO_EMAIL = "dpo@aimexpense.com"`
- `src/app/(legal)/privacy/page.tsx` — added Upstash + cache disclosure + `/account/data` link + DPO contact
- `src/app/(legal)/terms/page.tsx` — added cache disclosure
- `src/app/(app)/account/data/page.tsx` — **new** DSR (Data Subject Rights) flow:
  - Shows account label + user ID
  - 6 mailto-based DSR request types (access, rectify, delete, restrict, portability, withdraw)
  - PDPC complaint link
- `src/app/(auth)/login/login-form.tsx` — explicit consent checkbox (required, default unchecked)
- `src/components/layout/sidebar.tsx` — legal links footer (data / privacy / terms)
- `src/app/globals.css` — `.sidebar-legal` styles

### Phase 3 — Monitoring + load test

- `npm install @vercel/analytics @vercel/speed-insights @sentry/nextjs autocannon`
- `src/app/layout.tsx` — `<Analytics />` + `<SpeedInsights />` mounted globally
- `sentry.{client,server,edge}.config.ts` — DSN-gated (no-op without env vars)
- `next.config.mjs` — wrapped with `withSentryConfig` (only when SENTRY_DSN present)
- `src/server/lib/cache.ts` — `getCacheStats()` exported (hits/misses/errors counter)
- `scripts/load-test/smoke.mjs` — autocannon harness with verdict pass/fail
- `session25/design/MONITORING_SETUP.md` — full setup guide

**Load test result (`/login`, 50 conn × 15s):**
```
avg latency:   50 ms
p99 latency:   79 ms
req/sec:       985.8
errors:        0
5xx:           0
```

---

## 📦 Commits

```
c21c7b3 feat(S25A): PDPA compliance — legal docs (PP/ToS/DPA/ROPA/SubProc/IR), DSR /account/data, login consent checkbox, sidebar legal links
f0e8a80 feat(S25A): Redis cache layer (Upstash) for Sheets reads + invalidate on writes + ADR override SR3
[pending Phase 3 commit] feat(S25A): monitoring (Vercel Analytics + Speed Insights + Sentry DSN-gated) + autocannon load test + cache stats
```

⚠️ **Push blocked by harness guardrail** (no direct push to main). Pi please push from Terminal:
```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense && git push origin main
```

---

## 🔴 Action items for พี่ before next session

### Must-do (blocker for soft launch)

1. **Push commits**:
   ```bash
   cd ~/Code/Aim\ Expense\ V2/aim-expense && git push origin main
   ```
2. **Add Upstash env vars to Vercel** (settings → environment variables):
   - `UPSTASH_REDIS_REST_URL=https://ethical-colt-119453.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN=gQAAAAAAAdKdAAIgcDIyODM2YmRiMjFlNmY0YzExYTYyMmE1ZmFkODI1OThjZQ`
3. **Send legal docs to lawyer** (~15-20K บาท / ~1 week):
   - `docs/legal/PRIVACY_POLICY_TH.md`
   - `docs/legal/TERMS_OF_SERVICE_TH.md`
   - `docs/legal/DPA_TEMPLATE.md` (for B2B)
   - `docs/legal/SUB_PROCESSORS.md` (consistency check)
4. **Fill in TODOs in legal docs**:
   - Company address (search "TODO:" in docs/legal/*)
   - Phone number
5. **Create email aliases**: `dpo@aimexpense.com`, `support@aimexpense.com` (forward → dev@ ok for MVP)
6. **Delete junk file**: `.env.localgQAAAAAAAdKdAAIgcDIyODM2YmRiMjFlNmY0YzExYTYyMmE1ZmFkODI1OThjZQ` (artifact from earlier paste; not in git)

### Should-do (before launch)

7. **Setup Sentry** project + add DSN env vars (see `session25/design/MONITORING_SETUP.md` §2)
8. **Run authed load test** on /quotations:
   ```bash
   TARGET_URL=http://localhost:3000/quotations \
   TARGET_COOKIE='aim-session=...' \
   DURATION=30 CONNECTIONS=50 \
   node scripts/load-test/smoke.mjs
   ```
9. **Verify Google Sheets API quota approval** — check email `dev@aimexpense.com`
10. **Vercel Hobby → Pro upgrade** (commercial TOS requirement)

---

## ⚠️ Known issues / Watch out (carry-forward)

1. **🟡 Sentry DSN not set** — Phase 3 wired but inactive until DSN configured. Errors won't be captured.
2. **🟡 Privacy/Terms drafts not lawyer-reviewed** — must not go live without review
3. **🟡 `.env.local` had duplicate UPSTASH blocks** — cleaned up; if pi re-pastes anything, watch for duplicate lines (last value wins per dotenv)
4. **🟡 Junk file `.env.localgQAAAAAA...`** in repo root (not in git) — pi please rm
5. **🟡 Upstash free tier 10K commands/day** — at 1K orgs we'd exceed. Plan upgrade to Pay-as-you-go ($0.20/100K commands ≈ $60/month at 1K orgs)
6. **🟡 Login checkbox UX** — every login (including re-login) requires re-checking the box. PDPA-defensible but slight friction. Could add cookie shortcut later.
7. **🟡 DSR flow is mailto-only** — actual deletion is manual via DPO email response within 30 days. Server-side automation (`/api/account/delete`) is out of scope for S25A.

### Carry-forward จาก S22-24

- 🟡 WHT Phase 2 ใบสรุป polish — รอ screenshot
- 🟡 Sidebar "รายงาน ภพ.30" rename — S25B พร้อม VAT Phase 2
- 🟡 Tax Invoice (S25B priority)

---

## 🚀 Session 25B priority

ตาม design S22 §14:
- TAX_INVOICES + TAX_INVOICE_LINES sheet tabs
- `taxInvoice.router.ts`:
  - `issue` (sequential numbering — gap detection critical for RD compliance!)
  - `void` (admin only + reason)
  - `convertFromBilling` + `convertFromQuotation`
- `/tax-invoices` page (locked layout post-issue)
- `/tax-invoices/new` + `/tax-invoices/[id]`
- `/documents/tax-invoice/[id]` PDF — RD-compliant layout (เลขผู้เสียภาษี + สาขา + VAT breakdown)
- VAT Phase 2:
  - `report.vatSales` (output VAT)
  - `report.vat30` (combined ภาษีซื้อ + ภาษีขาย + Net)
  - `/reports/vat30` (3 tabs)
- Sidebar rename "ภพ.30" → "รายงานภาษีซื้อ (ภ.พ.30)"

**Pattern reference:**
- `src/server/routers/billing.router.ts` ← convert + WHT calculation pattern
- `src/server/lib/cache.ts` ← cache pattern available for taxInvoice tabs (auto-invalidated by service-layer integration)
- `src/server/lib/doc-number.ts` ← `computeNextDocNumber` + statusFilter (TI = "issued" only for gap detection)
- `src/app/documents/billing/[id]/document.tsx` ← PDF 2-page pattern

---

## 🔋 Environment State (จบ S25A)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Worktree:        .claude/worktrees/compassionate-liskov-2bc32d
Branch:          main (commits c21c7b3 + f0e8a80 + Phase 3)
Vercel:          Hobby ⚠️ (need upgrade Pro before launch)
Type check:      ✅ 0 errors (worktree + main)
Smoke test:      ✅ /login, /privacy, /terms, /account/data routes
Load test:       ✅ /login: avg 50ms, p99 79ms, 985 req/s, 0 errors
DB:              Supabase Singapore — no schema changes in S25A
Redis:           Upstash Singapore — credentials cleaned in .env.local
Sentry:          Code wired, DSN-gated (off until pi configures)
Vercel Analytics: Wired, no env required (auto-detect on deploy)
```

### Phase status

| Phase | สถานะ |
|-------|-------|
| Cache layer (Redis/Upstash) | ✅ S25A Phase 1 |
| ADR documenting cache override | ✅ S25A Phase 1 |
| PDPA legal docs (drafts) | ✅ S25A Phase 2 (pending lawyer review) |
| DSR flow (/account/data) | ✅ S25A Phase 2 |
| Login consent checkbox | ✅ S25A Phase 2 |
| Sidebar legal links | ✅ S25A Phase 2 |
| Vercel Analytics + Speed Insights | ✅ S25A Phase 3 |
| Sentry (DSN-gated) | 🟡 S25A Phase 3 — needs pi to add DSN |
| Cache hit/miss metrics | ✅ S25A Phase 3 |
| autocannon load test | ✅ S25A Phase 3 |
| Tax Invoices + VAT Phase 2 | ❌ S25B priority |
| WHT Phase 2 polish | 🟡 S25B (carry-forward) |

---

## 📋 User & Org info (พี่)

```
User:
  id              = 333d8b87-8b59-492f-b684-ee41c57768f8
  email           = dev@aimexpense.com
  lineUserId      = Ua42c7d7729c56f8eab021918c168761c

Org:
  id   = 32e5a820-ddb1-4850-95f3-b226d4e3a3e2
  name = บริษัท อาร์โต จำกัด

Subscription:
  plan: pro (manually for testing)
```

---

*Handoff by Claude — Session 25A end — 2026-05-09*
