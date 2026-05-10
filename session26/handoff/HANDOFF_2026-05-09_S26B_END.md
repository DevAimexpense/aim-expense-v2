# Session 26-B → Session 27 — Handoff

> **Created:** 2026-05-09 (end of S26-B)
> **Worktree:** `.claude/worktrees/compassionate-liskov-2bc32d`
> **Branch:** `main`
> **Latest commit:** `7eab138` (S26-B Stripe wire-up)
> **Type check:** ✅ 0 errors
> **DB migration:** ❌ NOT YET — pi must run `npx prisma db push` (carry-forward from S26-A)
> **Stripe:** Test mode keys saved, webhook secret saved (`whsec_4b373a7e22...`)

---

## 🎯 What S26-B delivered (1 commit `7eab138` + carry-over from S26-A)

### Code

1. **`src/lib/stripe.ts`** — Stripe SDK singleton
   - Pinned `apiVersion: "2026-03-25.dahlia"`
   - `getPriceByTierInterval(tier, interval)` — fetches price by `lookup_key` (no hard-coded IDs)
   - Module-level cache for price lookups
   - `REFERRAL_COUPON_ID = "ref-20pct-month1"`

2. **`src/app/api/stripe/checkout/route.ts`** — POST → Checkout Session
   - Auth + active org guard
   - Body: `{ tier, interval, refCode? }` (refCode falls back to `aim_ref` cookie)
   - Find/create Stripe Customer (per-org, idempotent)
   - Apply ref coupon `ref-20pct-month1` if valid affiliate code
   - Self-referral guard (can't use own code)
   - Returns `{ url }` for client redirect
   - Sends `subscription_data.metadata` with `orgId, tier, interval, refCode, refPartnerId`

3. **`src/app/api/stripe/webhook/route.ts`** — POST event handler
   - Verifies `stripe-signature` against `STRIPE_WEBHOOK_SECRET`
   - Handles: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`
   - Updates `Subscription.{plan, stripeSubscriptionId, stripePriceId, billingInterval, currentPeriodEnd, cancelAtPeriodEnd}`
   - Clears trial fields once paid plan kicks in
   - **Affiliate referral lifecycle:**
     - First invoice (subscription_create) → no commission, wait
     - Month-2 invoice (subscription_cycle) → mark `Referral.status="confirmed"`, schedule 3 `Commission` rows (40/25/15 of normalised monthly price)
   - `runtime: "nodejs"` (signature verify needs node, not edge)

4. **`src/app/api/stripe/portal/route.ts`** — POST → Customer Portal URL
   - Auth + lookup `stripeCustomerId`
   - Returns `billingPortal.sessions.create()` URL
   - Return URL = `/account/billing`

5. **`src/app/pricing/pricing-actions.tsx`** — Client component
   - `<IntervalToggle>` — Monthly / Yearly toggle (yearly shows "ประหยัด 17%" badge)
   - `<TierUpgradeButton>` — POSTs `/api/stripe/checkout` → window.location.href = stripe URL
   - `<PricingCardsClient>` — wraps 6 tier cards with reactive interval state
   - Reads `aim_ref` cookie → shows "🎁 Code applied" notice
   - Auth-gate: 401 from API → redirect to `/login?return=/pricing`

6. **`src/app/pricing/page.tsx`** — Server-rendered marketing page
   - Hero + comparison table stays SSR (SEO)
   - Tier cards section delegated to `<PricingCardsClient>`
   - Comparison table now includes quantitative limits row (Users/Companies/OCR/LINE Group)

7. **`src/app/(app)/account/billing/portal-button.tsx`** — Client component
   - POSTs `/api/stripe/portal` → redirect to portal

8. **`src/app/(app)/account/billing/page.tsx`** — replaced disabled "Coming soon" button with `<CustomerPortalButton />`

### Env saved (in `.env.local`, NOT committed)

```
STRIPE_SECRET_KEY=sk_test_51TV86HPRVl4ygcm07WIsSTYq9...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51TV86HPRVl4ygcm0WwzrT8MUdjjdQU...
STRIPE_WEBHOOK_SECRET=whsec_4b373a7e2254aa175426fc6f2d1d6111b0b8e84a0e37c147f1e6fb5a0fcd915f
```

⚠️ Webhook secret rotates each `stripe listen` invocation in dev. If pi restarts CLI → must update `.env.local`.

---

## 🔴 BLOCKERS — Pi must do this BEFORE end-to-end testing

### 1. Push commits + apply Prisma migration (carry from S26-A)

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
git push origin main          # 9+ commits backlog
npx prisma db push            # apply schema changes (subscriptions + new tables)
```

### 2. Create Stripe products + lookup keys (carry from S26-A)

In Stripe Dashboard → Products:

| Product | Monthly price | Monthly lookup_key | Yearly price | Yearly lookup_key |
|---------|--:|---|--:|---|
| Aim Expense Basic | 189 THB | `basic_monthly` | 1,890 THB | `basic_yearly` |
| Aim Expense Pro | 399 THB | `pro_monthly` | 3,990 THB | `pro_yearly` |
| Aim Expense Business | 699 THB | `business_monthly` | 6,990 THB | `business_yearly` |
| Aim Expense Max | 1,499 THB | `max_monthly` | 14,990 THB | `max_yearly` |

Plus Coupon: ID `ref-20pct-month1`, 20% off, duration "Once".

(Pro is created already — pi was on Add Product screen. Continue with Basic, Business, Max.)

### 3. Run Stripe CLI listener for local testing

```bash
# Terminal A (separate from npm run dev):
stripe listen --forward-to localhost:3000/api/stripe/webhook

# CLI prints whsec_xxx — already saved in .env.local; if it changes, update env
```

### 4. Smoke test full flow

```bash
# Terminal B:
rm -rf .next
npm run dev
```

Then in browser:
1. Login → /pricing
2. Toggle Monthly/Yearly — prices update
3. Click "เลือกแผน Pro ⭐" → redirected to `checkout.stripe.com`
4. Use test card `4242 4242 4242 4242`, any future expiry, any 3-digit CVC
5. Stripe redirects to `/account/billing?stripe=success&session_id=...`
6. CLI shows webhook events firing: `checkout.session.completed`, `customer.subscription.created`, `invoice.paid`
7. Check `Subscription` row: `plan="pro"`, `stripeSubscriptionId="sub_..."`, `currentPeriodEnd=...`, trial fields cleared
8. /account/billing → "Pro" + 399 THB + Customer Portal button works

---

## ⚠️ Known issues / Watch out

1. **🔴 Pi hasn't run prisma db push** — Stripe webhook will fail at runtime when trying to update unmigrated schema fields. Run before any Stripe test.

2. **🟡 CRON_SECRET not set** — `/api/cron/expire-trials` is open in dev (no auth). For Vercel production, set `CRON_SECRET` env var; Vercel Cron passes it automatically as Bearer token.

3. **🟡 Webhook secret rotates with `stripe listen`** — pi must update `.env.local` each CLI restart. For Vercel production, add separate `STRIPE_WEBHOOK_SECRET` env (from Dashboard endpoint).

4. **🟡 PromptPay payment** — enabled via `payment_method_types: ["card", "promptpay"]`. Need to verify Stripe Thailand account has PromptPay activated (it should after KYC).

5. **🟡 Lookup key mismatch** — if pi uses different key names (e.g. `pro-monthly` instead of `pro_monthly`), price lookup will fail. Check Stripe Dashboard → Products → Price → "Lookup key" field matches exactly.

6. **🟡 Test mode currency** — Stripe Test Mode supports THB but PromptPay may not work in test (cards work fine). Use `4242 4242 4242 4242` to test happy path.

7. **🟡 Affiliate referral month-2 trigger** — webhook uses `billing_reason === "subscription_cycle"`. Renewal happens 1 month after first invoice. To test in dev: in Stripe Dashboard, manually advance subscription, or use `stripe trigger invoice.paid` and craft the invoice metadata.

8. **🟡 Customer Portal needs configuration** — first time pi opens portal, Stripe asks to configure features (which products customers can switch to, etc.) at https://dashboard.stripe.com/test/settings/billing/portal

9. **🟡 Stripe product Tax behavior** — pi was confused, then we confirmed skip. Aim handles VAT 7% in own books. Stripe just charges face value.

---

## 🔋 Environment State (จบ S26-B)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Worktree:        .claude/worktrees/compassionate-liskov-2bc32d
Branch:          main
HEAD:            7eab138
Type check:      ✅ 0 errors (worktree + main)
DB:              ❌ Schema not migrated yet (pi must `npx prisma db push`)
Stripe:          Test mode (no KYC yet) — 3 keys saved (sk_test, pk_test, whsec_)
Stripe products: 1/4 created (Pro done, Basic/Business/Max pending)
Stripe coupon:   Not created yet (`ref-20pct-month1`)
Vercel:          Hobby — needs Pro before launch
Redis cache:     ✅ S25A live
```

### Phase status

| Phase | สถานะ |
|-------|-------|
| S25A Cache + PDPA + Monitoring | ✅ |
| S25B Tax Invoices + VAT P2 + Payment modal | ✅ |
| S26-A Plan SSOT + Trial + /pricing + /account/billing + Affiliate cookie | ✅ |
| **S26-B Stripe checkout + webhook + portal + UI wire** | ✅ |
| S27 Polish + closed beta + KYC complete | ❌ next |
| S28 Pre-launch QA + load test | ❌ |

---

## 🚀 S27 scope (next session)

### Closed beta + polish
1. Wire OCR quota enforcement into `/api/ocr/receipt` (helper exists, just call it)
2. Multi-business gate (Pro+ — currently open to all)
3. ใบสำคัญรับเงิน + e-sig canvas (Wave 2 #20)
4. Multi-step approval (Wave 2 #19)
5. Fix any S26-B bugs found in testing
6. UI polish on /pricing + /account/billing
7. Email templates for trial-expiring + receipt + welcome
8. Vercel cron `affiliate-payouts` — daily check scheduled commissions, mark ready for batch payout

### KYC + go-live prep
1. Pi finishes Stripe Thailand KYC (waiting on company registration)
2. Switch test → live keys (1 line in env)
3. Add Vercel env vars
4. Test live payment with small real charge
5. Lawyer-revised legal docs → swap into /privacy + /terms

### Defer
- Affiliate payout admin UI (S28+)
- Custom branding on PDFs (S28+, Max tier)
- API access (S28+, Max tier)
- LINE Group bot (Wave 3)

---

## 📋 First-message template for next session (S27)

```
สวัสดีค่ะเอม นี่คือ Session 27 (continue from S26-B)
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 Latest commit: 7eab138 — S26-B Stripe wire-up

✅ Pre-conditions ที่พี่ทำแล้ว:
- [ ] git push origin main
- [ ] npx prisma db push
- [ ] Stripe Dashboard: 4 products + 8 lookup keys + 1 coupon `ref-20pct-month1`
- [ ] Run stripe listen → forward to localhost
- [ ] Smoke test /pricing → checkout → webhook → /account/billing successful

🎯 S27 scope:
1. Wire OCR quota enforcement into /api/ocr/receipt
2. Multi-business gate (Pro+)
3. Email templates (trial expiring + receipt + welcome)
4. ใบสำคัญรับเงิน + e-sig canvas (Wave 2 #20)
5. Multi-step approval (Wave 2 #19)
6. Bug fixes from S26-B closed beta

อ่าน session26/handoff/HANDOFF_2026-05-09_S26B_END.md

ลุย!
```

---

*Handoff by Claude — Session 26-B end — 2026-05-09*
