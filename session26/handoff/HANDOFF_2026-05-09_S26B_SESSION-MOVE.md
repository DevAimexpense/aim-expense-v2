# 🚚 Session Move Handoff — S26-B → Session 27

> **Created:** 2026-05-09 — session running low, moving to fresh session
> **Worktree:** `.claude/worktrees/compassionate-liskov-2bc32d`
> **Branch:** `main` · **HEAD:** `2aa81eb`
> **Type check:** ✅ 0 errors
> **Status:** S26-B code COMPLETE + type-checks, but NOT smoke-tested end-to-end yet

---

## ⚡ TL;DR for next session

S26 (Subscription + Stripe) code is **done and committed**. What's left:
1. **Pi must run pre-conditions** (push, prisma db push, clear cache) — NONE done yet
2. **Fix /pricing page styling** — pi says it doesn't match other pages (TASK 1)
3. **Investigate + fix errors** pi reported (unspecified — likely schema-not-migrated)
4. **Smoke test** full Stripe checkout flow

---

## 🔴 PRE-CONDITIONS — Pi has NOT done these yet (likely cause of all errors)

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense

# 1. Push commits (13 unpushed: S25A→S26-B)
git push origin main

# 2. ⚠️ CRITICAL — apply Prisma schema to Supabase
#    Without this: trialPlan/trialEndsAt/UsageCounter/AffiliatePartner columns
#    don't exist → EVERY authenticated page errors (requireFeature queries them)
npx prisma db push     # answer "y" — only ADDS columns/tables, no data loss

# 3. ⚠️ CRITICAL — clear stale .next cache (Tailwind v4 breaks otherwise)
rm -rf .next .claude/worktrees/*/.next

# 4. Restart dev
npm run dev

# 5. (for Stripe test) separate terminal:
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

**The "errors" pi mentioned are almost certainly because steps 2 + 3 were never run.**
Diagnose first by checking: does `npx prisma db push` show pending changes? Does the
error mention a missing column like `trial_plan`?

---

## 🎨 TASK 1 (priority) — Redesign /pricing to match app format

**Pi's complaint:** `/pricing` page styling ไม่เหมือนหน้าอื่นในโปรเจกต์.

**Current state:**
- `src/app/pricing/page.tsx` — server component, standalone marketing layout
  (own `<header>`, white bg, raw Tailwind utility classes)
- `src/app/pricing/pricing-actions.tsx` — client component with tier cards +
  interval toggle + Stripe checkout buttons

**Problem:** It uses a bespoke marketing layout, NOT the project's standard
`app-page` / `app-card` / `app-btn` / brand-color classes that every other
page uses (see `/quotations`, `/billings`, `/tax-invoices`, `/account/billing`).

**Note /pricing is PUBLIC** (no auth, no sidebar) — so it CANNOT use the `(app)`
route group layout. But it SHOULD reuse:
- `globals.css` color tokens: `var(--color-brand-*)` (blue), `var(--color-accent-*)` (yellow)
- Card visual style consistent with `app-card` (border `#e2e8f0`, radius, shadow)
- Same font sizes / spacing rhythm

**Reference for the "correct" look:** `/account/billing` was already redesigned
in commit `eb2b3d7` to match project palette — copy that visual language to /pricing:
- brand-blue (not purple/violet)
- `app-card`-style cards
- consistent spacing

**Suggested approach:**
- Keep `/pricing` public + server-rendered for SEO
- Rewrite both `page.tsx` + `pricing-actions.tsx` using brand colors + card style
  matching `/account/billing`
- Keep the functional bits intact: interval toggle, `TierUpgradeButton` →
  POST `/api/stripe/checkout`, `aim_ref` cookie display, comparison table

---

## 🐞 TASK 2 — Investigate "errors" pi reported

Pi said "ยังติดอีกหลายอย่าง และมี error" but didn't specify. Likely candidates:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Pages error after login | Prisma schema not migrated | `npx prisma db push` |
| CSS/Tailwind broken (raw HTML) | Stale `.next` cache | `rm -rf .next` |
| /account/billing 500 error | `trialPlan` column missing | `npx prisma db push` |
| Stripe checkout fails | webhook secret rotated / dev server not restarted | restart + re-check `.env.local` |
| New org signup fails | `Subscription.trialPlan` write to missing column | `npx prisma db push` |

**Action:** Ask pi for the EXACT error message / screenshot, then fix. Most are
resolved by the pre-conditions above.

---

## ✅ S26 — What's DONE (committed, type-checks clean)

### S26-A (commits `145cac0`, `d479e51`, `d88dd35`, `eb2b3d7`)
- `src/lib/plans.ts` — Plan SSOT (limits, features, pricing, helpers)
- `src/lib/auth/require-plan.ts` — `requireFeature()` server guard
- `src/server/lib/usage.ts` — OCR quota counter (`incrementAndCheckQuota`)
- Prisma schema: Subscription trial/stripe fields + UsageCounter + AffiliatePartner + Referral + Commission
- Trial 30-day auto-enrol (create-company + org.router) + `/api/cron/expire-trials`
- 13 pages migrated `ALLOWED_PLANS` → `requireFeature("revenueModule")`
- `/pricing` page (needs restyle — TASK 1)
- `/account/billing` page (already restyled to brand palette ✅)
- Affiliate `?ref=CODE` cookie capture in middleware + referral record on signup
- Sidebar: "แพ็คเกจ + การใช้งาน" → `/account/billing`

### S26-B (commits `7eab138`, `a71b0a1`, `2aa81eb`)
- `src/lib/stripe.ts` — SDK singleton + `getPriceByTierInterval()` (env-first, lookup_key fallback) + `REFERRAL_COUPON_ID` (env override)
- `src/app/api/stripe/checkout/route.ts` — create Checkout Session + ref coupon
- `src/app/api/stripe/webhook/route.ts` — 6 event handlers + affiliate commission lifecycle
- `src/app/api/stripe/portal/route.ts` — Customer Portal URL
- `src/app/pricing/pricing-actions.tsx` — client tier cards + interval toggle
- `src/app/(app)/account/billing/portal-button.tsx` — Customer Portal button

### Stripe Dashboard config (VERIFIED via API ✅)
All 8 prices created + correct + active:
| Lookup | Price | Interval |
|--------|------:|----------|
| Basic | 189 / 1,890 | monthly / yearly |
| Pro | 399 / 3,990 | monthly / yearly |
| Business | 699 / 6,990 | monthly / yearly |
| Max | 1,499 / 14,990 | monthly / yearly |

Coupon: `ref-20pct-month1` (display name) — actual Stripe ID is `rPkdeFwu` →
stored in env `STRIPE_REFERRAL_COUPON_ID=rPkdeFwu`.

---

## 🔑 Environment (`.env.local` — gitignored, local only)

Already populated in main repo `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_51TV86HPRVl4ygcm07WIsSTYq9...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51TV86HPRVl4ygcm0WwzrT8MU...
STRIPE_WEBHOOK_SECRET=whsec_4b373a7e2254aa175426fc6f2d1d6111b0b8e84a0e37c147f1e6fb5a0fcd915f
STRIPE_PRICE_BASIC_MONTHLY=price_1TVXjrPRVl4ygcm0mLd9TlO6
STRIPE_PRICE_BASIC_YEARLY=price_1TVXl7PRVl4ygcm00D4mDDY5
STRIPE_PRICE_PRO_MONTHLY=price_1TVXnnPRVl4ygcm0IOEuMtp6
STRIPE_PRICE_PRO_YEARLY=price_1TVXnnPRVl4ygcm0TiV4RVwe
STRIPE_PRICE_BUSINESS_MONTHLY=price_1TVXtSPRVl4ygcm05B4BgAcO
STRIPE_PRICE_BUSINESS_YEARLY=price_1TVXtSPRVl4ygcm0vQFRBpIY
STRIPE_PRICE_MAX_MONTHLY=price_1TVXuaPRVl4ygcm06zPAjSu9
STRIPE_PRICE_MAX_YEARLY=price_1TVXuaPRVl4ygcm08zkVNMpZ
STRIPE_REFERRAL_COUPON_ID=rPkdeFwu
```
⚠️ webhook secret rotates each `stripe listen` — update env if pi restarts CLI.
⚠️ If next session uses a NEW worktree → copy `.env.local` from main repo.

---

## 🧪 Smoke test (after pre-conditions done)

1. `/pricing` → toggle Monthly/Yearly → prices update
2. Login → click "เลือก Pro ⭐" → redirect to `checkout.stripe.com`
3. Test card `4242 4242 4242 4242`, future expiry, CVC `123`
4. Stripe redirects → `/account/billing?stripe=success`
5. `stripe listen` terminal shows: `checkout.session.completed` → `customer.subscription.created` → `invoice.paid`
6. `/account/billing` → "Pro" + 399 THB + working Customer Portal button
7. New org signup → `Subscription.trialPlan="pro"`, `trialEndsAt=+30d`
8. `?ref=XXXX` → `aim_ref` cookie set → /pricing shows "🎁 Code applied"

---

## 📋 S27 scope (after S26 verified)

1. **TASK 1** — /pricing restyle (carry into S27 if not done)
2. Fix errors from pi's testing
3. Wire OCR quota into `/api/ocr/receipt` (`incrementAndCheckQuota` exists, just call it)
4. Multi-business gate (Pro+ — currently open to all plans)
5. Email templates (trial-expiring, receipt, welcome)
6. ใบสำคัญรับเงิน + e-sig canvas (Wave 2 #20)
7. Multi-step approval (Wave 2 #19)
8. Vercel cron `affiliate-payouts`

### KYC / go-live (waiting on pi's company registration)
- Stripe KYC → switch test keys → live keys
- Vercel Hobby → Pro
- Lawyer-revised legal docs

---

## 🎬 First-message template for new session

```
สวัสดีค่ะเอม นี่คือ Session 27 (continue S26-B — session move)
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 HEAD: 2aa81eb

🔴 อ่านก่อน: session26/handoff/HANDOFF_2026-05-09_S26B_SESSION-MOVE.md

พี่ยังไม่ได้ทำ pre-conditions — รันก่อนเทสอะไร:
  git push origin main
  npx prisma db push          ← CRITICAL (schema not migrated = errors ทั้งหมด)
  rm -rf .next && npm run dev  ← CRITICAL (stale cache = Tailwind พัง)

🎯 งาน Session 27:
1. แก้หน้า /pricing ให้ใช้ format/สี เหมือนหน้าอื่น (brand blue, app-card style)
   — reference: /account/billing ที่ทำสวยแล้วใน commit eb2b3d7
2. Investigate error ที่พี่เจอ (ขอ error message ชัด ๆ ก่อน)
3. Smoke test Stripe checkout flow เต็ม ๆ
4. (ถ้าเหลือเวลา) S27 polish — OCR quota, multi-business gate, email templates

Stripe config เสร็จหมดแล้ว (8 prices + coupon verified ผ่าน API)
.env.local มี keys ครบ — ถ้า new worktree ต้อง copy มาจาก main repo

ลุย!
```

---

*Handoff by Claude — S26-B session move — 2026-05-09*
