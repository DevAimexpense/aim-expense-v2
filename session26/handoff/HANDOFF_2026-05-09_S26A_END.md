# Session 26-A → Session 27 (or S26-B) — Handoff

> **Created:** 2026-05-09 (end of S26-A)
> **Worktree:** `.claude/worktrees/compassionate-liskov-2bc32d`
> **Branch:** `main`
> **Latest commit:** `eb2b3d7` (UI fix on /account/billing)
> **Type check:** ✅ 0 errors
> **DB migration:** ❌ NOT APPLIED YET — pi must run `npx prisma db push`

---

## 🎯 What S26-A delivered (5 commits — `eb2b3d7`, `d88dd35`, `d479e51`, `145cac0`)

### Code (all in main + worktree, type-check passing)

1. **`src/lib/plans.ts`** — Single source of truth
   - `PLAN_TIERS`, `PLAN_LIMITS` (users/businesses/ocrPerMonth/lineGroups), `PLAN_PRICING_THB`
   - `PLAN_FEATURES` set per tier (19 feature keys)
   - `hasFeature()`, `checkQuota()`, `effectivePlan()`, `isInTrial()`, `computeCommission()`
   - `REFERRAL_DISCOUNT` (20% + 100 OCR), `AFFILIATE_COMMISSION_SCHEDULE` (0/40/25/15 declining), `AFFILIATE_MIN_PAYOUT_THB = 500`

2. **`src/lib/auth/require-plan.ts`** — Server guard
   - `requireFeature(featureKey)` — auth + org + plan check + redirect
   - `getEffectivePlan(orgId)` — soft check, no redirect

3. **`src/server/lib/usage.ts`** — Quota counter
   - `incrementAndCheckQuota(orgId, "ocr")` — atomic check + increment
   - `getUsage(orgId, "ocr")` — read-only
   - `checkQuotaOnly(orgId, "ocr")` — read-only check

4. **Prisma schema** (`prisma/schema.prisma`)
   - Subscription: `trialPlan`, `trialStartedAt`, `trialEndsAt`, `stripeCustomerId`, `stripePriceId`, `billingInterval`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `isBetaTester`
   - **NEW tables:** `UsageCounter`, `AffiliatePartner`, `Referral`, `Commission`
   - User → 1:1 `affiliatePartner` relation

5. **Trial 30-day flow**
   - `src/app/api/onboarding/create-company/route.ts` — auto-enrol new orgs in 30d Pro trial
   - `src/server/routers/org.router.ts` — same enrol on `org.create`
   - `src/app/api/cron/expire-trials/route.ts` — daily sweep, auth via `CRON_SECRET` env
   - `vercel.json` — cron schedule `0 1 * * *` (08:00 BKK)

6. **12 page migrations** — `ALLOWED_PLANS = [...]` → `await requireFeature("revenueModule")`
   - customers/, quotations/, billings/, tax-invoices/ + their /new, /[id], /[id]/edit

7. **`/pricing`** — Public marketing page
   - 6-tier cards with hover, badges, CTAs
   - Detailed feature comparison table
   - Add-ons + affiliate code section

8. **`/account/billing`** — Current plan dashboard
   - Hero card with brand-blue gradient + plan icon (🌱🚀⭐💼👑🏢)
   - Trial countdown bar (if active)
   - 5 usage stat cards (OCR, Users, Businesses, Projects, LINE Groups) — auto-fill grid
   - Beta notice banner (Stripe coming soon)
   - Sidebar link `แพ็คเกจ + การใช้งาน` → here

9. **Affiliate cookie capture** — `src/middleware.ts`
   - `?ref=CODE` query → `aim_ref` cookie (30d, sameSite=lax)
   - Code format: `[A-Za-z0-9-]{4,16}`
   - On org create → look up `AffiliatePartner.code`, self-referral guard, create `Referral` (status=pending)

10. **Stripe test keys saved** in `.env.local`:
    - `STRIPE_SECRET_KEY=sk_test_51TV86HPRVl4ygcm07WIsSTYq9...`
    - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51TV86HPRVl4ygcm0WwzrT8MUdjjdQU...`
    - `STRIPE_WEBHOOK_SECRET=` (empty — fill when webhook endpoint created in S26-B)

### Design docs

- `session26/design/SUBSCRIPTION_TIERS.md` — Locked Excel-based tier matrix
- `session26/design/AFFILIATE_PROGRAM.md` — Customer referral + Partner affiliate, 4 commission options compared

---

## 🔴 BLOCKER — Pi must do this BEFORE S26-A is testable end-to-end

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense

# 1. Stop any old dev server
lsof -ti :3000 | xargs kill -9 2>/dev/null

# 2. Push 7 commits to remote
git push origin main

# 3. Apply DB migration to Supabase
#    Will add: trial_plan, trial_started_at, trial_ends_at, stripe_*, etc to subscriptions
#    + new tables: usage_counters, affiliate_partners, referrals, commissions
npx prisma db push   # answer "y, accept data loss" (no actual data lost — only adds cols/tables)

# 4. Clear stale .next cache (CRITICAL — Tailwind broke without this earlier)
rm -rf .next .claude/worktrees/*/.next

# 5. Start fresh dev server
npm run dev

# 6. Hard refresh browser (Cmd+Shift+R)
```

Without #3, `requireFeature` queries `trialPlan/trialEndsAt` columns that don't exist → `PrismaClientKnownRequestError`.

Without #4, Tailwind doesn't compile properly → raw HTML rendering (pi reported earlier).

---

## ✅ Verification checklist after pi completes blockers

| Test | URL | Expected |
|------|-----|----------|
| Public pricing | `/pricing` | 6-tier table, prices 189/399/699/1499 |
| Public privacy | `/privacy` | Renders OK |
| Login + redirect | `/` (logged-out) | 307 → `/login` |
| Auth-gated | `/tax-invoices` (logged-out) | 307 → `/login` |
| Logged-in dashboard | `/account/billing` | Hero card brand-blue gradient, "⭐ Pro" + 399, trial countdown bar (if new org), 5 stat cards with `OCR 0/300`, `Users 2/5`, `บริษัท 1/2`, etc. |
| Logged-in revenue | `/tax-invoices` | List page renders (auth-gate now uses `requireFeature("revenueModule")`) |
| Affiliate cookie | Visit `/?ref=ARTO-X9KQ` then DevTools → Application → Cookies | `aim_ref=ARTO-X9KQ` set, 30d expiry |
| Cron endpoint | `curl http://localhost:3000/api/cron/expire-trials` | `{"success":true,"expiredCount":0}` (no expired trials yet) |
| New org sign-up | Create company in onboarding | New `Subscription` row has `trial_plan="pro"`, `trial_ends_at = now+30d` |

---

## 🚀 S26-B scope (next session — Stripe integration in test mode)

Pi already has Stripe **test keys** saved (no KYC needed for test mode). Build:

1. **`/api/stripe/checkout/route.ts`** — POST → create Stripe Checkout session
   - Input: `{ tier: "pro" | "business" | ..., interval: "monthly" | "yearly", refCode?: string }`
   - Lookup price ID per tier+interval (we'll create 8 in Stripe products dashboard)
   - Apply ref discount via Stripe Coupon `ref-20pct-month1` if refCode valid
   - Return Checkout URL → frontend redirects

2. **`/api/stripe/webhook/route.ts`** — POST handler
   - Verify signature with `STRIPE_WEBHOOK_SECRET`
   - Handle: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
   - Update `Subscription.{plan, stripeSubscriptionId, currentPeriodEnd, cancelAtPeriodEnd}`
   - On `invoice.paid` for month-2 of a referral → mark `Referral.status="confirmed"` + create scheduled `Commission` rows (40/25/15 schedule)
   - On refund/payment_failed → claw back commissions

3. **`/api/stripe/portal/route.ts`** — POST → return Stripe Customer Portal URL

4. **`/account/billing` upgrades:**
   - Replace "Coming soon" with real "อัปเกรด → Stripe checkout" button
   - Wire "เปิด Customer Portal →" button

5. **`/pricing` upgrades:**
   - Plan select buttons → POST `/api/stripe/checkout` with tier
   - Yearly/monthly toggle
   - Apply `aim_ref` cookie → pass as `refCode` to checkout API

6. **Stripe products + prices setup** (manual via Stripe dashboard):
   - 4 products (Basic, Pro, Business, Max)
   - 8 prices (each × monthly + yearly)
   - 1 coupon `ref-20pct-month1` (20% off, applies once)

7. **Affiliate commission lifecycle**
   - Cron job `/api/cron/affiliate-payouts` — daily, mark scheduled commissions as ready when scheduled date passed
   - Admin payout batch UI (defer to S26-C)

**Estimated:** 5-7 hr in S26-B (a single focused session)

---

## ⚠️ Known issues / Watch out

1. **🔴 DB schema not migrated** — covered above, blocker
2. **🟡 Stale `.next` cache breaks Tailwind v4** — pi seen once already; `rm -rf .next` solves
3. **🟡 Multi-business switcher not gated yet** — Excel says Pro+, code lets Free use multi-org. Defer to S27 polish
4. **🟡 Sidebar `แพ็คเกจ + การใช้งาน`** added (`d479e51`) — only visible to `adminOnly`. Non-admins can't reach `/account/billing` unless we add it to non-admin nav
5. **🟡 Affiliate self-referral guard** uses `userId !== session.userId` — but partner's userId is owner. If they switch to another org before signing-up... edge case. Acceptable for MVP.
6. **🟡 OCR quota not enforced yet** — `incrementAndCheckQuota` exists but not wired into `/api/ocr/receipt` or LINE OCR flow. Wire in S27 when polishing closed-beta
7. **🟡 Cron `expire-trials` requires `CRON_SECRET` env** — pi needs to set in Vercel env (random string). Without it, endpoint is open (still gated by trial-not-yet-expired logic so harmless)

---

## 🔋 Environment State

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Worktree:        .claude/worktrees/compassionate-liskov-2bc32d
Branch:          main
HEAD:            eb2b3d7
Vercel:          Hobby ⚠️ (still need Pro before launch)
Type check:      ✅ 0 errors
DB:              Supabase Singapore — schema NOT MIGRATED (S26-A blocker)
Stripe:          Test mode (no KYC) — 2 keys in .env.local, webhook secret pending
Redis cache:     ✅ S25A live
PDPA docs:       ✅ S25A — pending lawyer review
```

### Phase status (cumulative)

| Phase | สถานะ |
|-------|-------|
| S25A Cache + PDPA + Monitoring | ✅ |
| S25B Tax Invoices + VAT P2 + Payment modal | ✅ |
| **S26-A Plan SSOT + Trial + /pricing + /account/billing + Affiliate cookie** | ✅ |
| S26-B Stripe Checkout + Webhook + Customer Portal | ❌ next session |
| S27 Polish (multi-business gate, OCR quota wiring, e-sig, multi-step approval) | ❌ |
| S28 Pre-launch (load test, status page, lawyer-revised docs) | ❌ |

---

## 📋 User & Org info (พี่)

```
User id     = 333d8b87-8b59-492f-b684-ee41c57768f8
LINE userId = Ua42c7d7729c56f8eab021918c168761c
Email       = dev@aimexpense.com
Org id      = 32e5a820-ddb1-4850-95f3-b226d4e3a3e2
Plan        = pro (manual in Prisma Studio for testing)
```

---

## 🎬 First-message template for next session

```
สวัสดีค่ะเอม นี่คือ Session 26-B (continue from S26-A)
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 Latest commit: eb2b3d7 — fix /account/billing palette + overflow

✅ Pre-conditions:
- [ ] git push origin main (7 commits)
- [ ] npx prisma db push (apply schema)
- [ ] rm -rf .next + npm run dev (clear stale cache)
- [ ] Smoke /account/billing renders correctly with brand colors

🎯 S26-B scope: Stripe Test Mode wire-up (~5-7 hr, full session)

อ่าน session26/handoff/HANDOFF_2026-05-09_S26A_END.md เพื่อ context
อ่าน session26/design/SUBSCRIPTION_TIERS.md + AFFILIATE_PROGRAM.md เพื่อ requirement

Stripe products to create manually in Stripe dashboard ก่อนเริ่ม code:
- 4 products: Basic, Pro, Business, Max
- 8 prices total (each × monthly + yearly recurring, THB)
- 1 coupon: ref-20pct-month1 (20% off, once)

ส่งมาให้ผม:
- STRIPE_WEBHOOK_SECRET (ตอน webhook endpoint ถูก create ใน Stripe dashboard)
- Stripe price IDs (8 ตัว) ที่สร้าง manually

Decisions ค้าง 11 ข้อจาก S26-A — ใช้ defaults ทั้งหมด:
- Currency: THB only
- Trial: 30 days (Excel locked)
- Discount combo: 20% off + 100 OCR bonus
- Commission: declining 0/40/25/15 over months 1-4
- 2 programs: Customer Referral (mutual 1mo) + Partner Affiliate (cash via PromptPay)
- Min payout: 500 THB
- Build affiliate ใน S27 (S26-B = Stripe only)

ลุย!
```

---

*Handoff by Claude — Session 26-A end — 2026-05-09*
