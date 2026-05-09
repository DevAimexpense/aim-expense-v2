# Subscription Tiers — Aim Expense (S26 Implementation Plan)

> **Source of truth:** `Aim-Expense-Pricing-Roadmap.xlsx` (locked April 2026)
> **Strategy:** Hybrid — 30-day Pro Trial + Permanent Free Forever
> **This doc:** Translates the locked spreadsheet into a code shape + S26 work plan
> **Updated:** 2026-05-09

---

## 0. Locked pricing (จากไฟล์ Excel ของพี่)

### Tiers + quantitative limits

| Field | Free Forever | Trial 30d | Basic | **Pro** ⭐ | Business | Max | Enterprise |
|-------|:-----:|:----:|:----:|:-----:|:------:|:---:|:----:|
| **ราคา/เดือน (THB)** | 0 | 0 | 189 | **399** | 699 | 1,499 | Custom |
| **ราคา/ปี (THB, save 17%)** | — | — | 1,890 | 3,990 | 6,990 | 14,990 | Custom |
| Users | 1 | 5 | 2 | 5 | 10 | 20 | ∞ |
| Businesses | 1 | 2 | 1 | 2 | 3 | 5 | ∞ |
| OCR scans / เดือน | 5 | 300 | 100 | 300 | 600 | 1,500 | ∞ |
| LINE Groups | 0 | 2 | 1 | 2 | 3 | 5 | ∞ |

### Feature gates

| Feature | Free | Trial | Basic | **Pro** ⭐ | Business | Max | Enterprise |
|---------|:----:|:-----:|:----:|:----:|:--------:|:---:|:----------:|
| Project / Budget tracking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OCR ใบเสร็จ (LINE + Browser) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manual expense entry | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approval Flow (basic) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-step Approval | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| 13 Granular Permissions | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| WHT Certificate (auto) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ใบรับรองแทนใบเสร็จ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ใบสำคัญรับเงิน + e-sig | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| ใบเสนอราคา (Quotation) | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| ใบวางบิล (Billing) | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| ใบเสร็จ/ใบกำกับภาษี | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Custom branding on docs | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| เคลียร์งบ + รายสัปดาห์ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **P&L per Project** ⭐ killer | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| ภ.พ.30 + WHT Report | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Audit Log Export | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| LINE OA (1-1 chat) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| LINE Group bot | ❌ | ✅ | ✅ (1) | ✅ (2) | ✅ (3) | ✅ (5) | ∞ |
| Email scan (Gmail) | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| API access | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Email / LINE support | Community | Yes | Email | Priority | Priority | 24/7 | Dedicated |
| Onboarding session | — | — | — | — | ✅ | ✅ | ✅ |
| CPA partner consult | — | — | — | — | — | Quarterly | Monthly |

### Add-ons (override quota when needed)

- **+100 OCR scans** = 89 บาท (one-time top-up, ใช้เดือนเดียว)
- **+1 user seat** = 49 บาท/mo (recurring)
- **Custom doc template** = 1,990 บาท one-time
- **Migration จาก Paypers/Excel** = ส่วนลด 50% เดือนแรก

### Margin analysis (จาก `Cost Analysis` sheet)

| Plan | OCR Cost (0.50/scan) | Stripe (3.65%+10) | LINE push | Hosting | Total Cost | Margin THB | Margin % |
|------|---:|---:|---:|---:|---:|---:|---:|
| Free | 2.5 | 0 | 5 | 5 | 12.5 | (12.5) | loss |
| Trial | 150 | 0 | 20 | 5 | 175 | (175) | loss |
| Basic | 50 | 16.90 | 10 | 5 | 81.90 | 107.10 | **57%** |
| Pro | 150 | 24.56 | 20 | 5 | 199.56 | 199.44 | **50%** |
| Business | 300 | 35.51 | 40 | 5 | 380.51 | 318.49 | **46%** |
| Max | 750 | 64.71 | 40 | 10 | 864.71 | 634.29 | **42%** |

→ Free + Trial = acquisition loss leader. Paid tiers ทุก tier > 40% margin (healthy SaaS)

### Revenue forecast Year 1 (Realistic ⭐)

- Free Forever: 2,000 users (acquisition funnel)
- Basic: 80 paid → ~5-8% conversion ของ Free
- Pro: 30 paid (sweet spot)
- Business: 10 paid (SME teams 5-10)
- Max: 3 paid (bigger SME)
- Enterprise: 1 paid (direct sales)
- **MRR ~41,567 / ARR ~498,804 บาท**

---

## 1. Codebase reality check (พ.ค. 2026)

**Already locked-up correctly:**
- ✅ 6 plan strings ใน Prisma (`free|basic|pro|business|max|enterprise`) — match!
- ✅ ALLOWED_PLANS (`pro+`) สำหรับ Quotation/Billing/TI/Customers — match!
- ✅ Wave 2 ส่วนใหญ่ ship แล้ว (S22-S25B): Quotation, Billing, Tax Invoice, ภ.พ.30, P&L (partial)

**Discrepancies vs locked Excel:**
1. Excel says **"13 Granular Permissions"** — codebase ตอนนี้ **18 keys** (เพราะเพิ่ม revenue: customers/quotations/billings/tax-invoices ใน S22-25). ✅ ปรับขึ้นได้ — แค่ "more granular than original spec"
2. Excel says **Approval Flow basic = Basic+** — codebase ตอนนี้ approval อยู่ที่ permission level ไม่ได้ plan-gate. ⚠️ ต้อง gate Approval ที่ plan layer (S26)
3. Excel says **Multi-step Approval = Pro+** — ยังไม่ implement (Wave 2 #19, deferred)
4. Excel says **ใบสำคัญรับเงิน + e-sig = Pro+** — codebase มี receipt-voucher PDF แต่ยังไม่มี e-sig canvas (Wave 2 #20)
5. Excel says **Multi-business switcher = Pro+** — codebase มี `/select-org` แต่ไม่ plan-gate. ⚠️ Free จำกัดที่ 1 business
6. Excel says **Custom branding on docs = Max+** — codebase ไม่มี (Wave 3 #32)
7. Excel says **API access = Max+** — ไม่มี (Wave 3 #33)
8. Excel says **Audit Log Export = Max+** — ไม่มี (Wave 3 #34)
9. Excel says **Email scan (Gmail) = Pro+** — ไม่มี (Wave 3 #30)

**Quota enforcement that's MISSING:**
- ❌ OCR scans/เดือน — ไม่ count
- ❌ Users/business — `maxMembers` ใน schema แต่ไม่ enforce
- ❌ Businesses/account — ไม่ track multi-org limit
- ❌ LINE Groups — ไม่ track

---

## 2. S26 scope (Stripe + plan-gate cleanup)

**Goal:** Wire ราคา + quota + Stripe ตาม locked Excel — โดยไม่กระทบ feature ที่ ship แล้ว

### Phase A — Single source of truth (1 commit, ~1 hr)

`src/lib/plans.ts`:
```typescript
export const PLAN_TIERS = ["free","basic","pro","business","max","enterprise"] as const;
export type PlanTier = typeof PLAN_TIERS[number];

export const PLAN_PRICING_THB = {
  basic:    { monthly: 189,  yearly: 1890 },
  pro:      { monthly: 399,  yearly: 3990 },
  business: { monthly: 699,  yearly: 6990 },
  max:      { monthly: 1499, yearly: 14990 },
} as const;

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free:       { users: 1,  businesses: 1, ocrPerMonth: 5,    lineGroups: 0  },
  basic:      { users: 2,  businesses: 1, ocrPerMonth: 100,  lineGroups: 1  },
  pro:        { users: 5,  businesses: 2, ocrPerMonth: 300,  lineGroups: 2  },
  business:   { users: 10, businesses: 3, ocrPerMonth: 600,  lineGroups: 3  },
  max:        { users: 20, businesses: 5, ocrPerMonth: 1500, lineGroups: 5  },
  enterprise: { users: -1, businesses: -1, ocrPerMonth: -1,  lineGroups: -1 }, // -1 = unlimited
};

export const PLAN_FEATURES: Record<PlanTier, Set<FeatureKey>> = { ... }; // see Phase B

export function hasFeature(plan: PlanTier, key: FeatureKey): boolean { ... }
export function checkQuota(plan: PlanTier, metric: string, current: number): {ok: boolean; limit: number} { ... }
export function isInTrial(sub: SubscriptionRow): boolean { ... }
export function effectivePlan(sub: SubscriptionRow): PlanTier { ... }  // returns "pro" if active trial, else stored plan
```

12 page-level checks → ใช้ helper:
```typescript
- if (!ALLOWED_PLANS.includes(plan || "free")) redirect("/dashboard?upgrade=required");
+ if (!hasFeature(plan, "revenueModule")) redirect("/upgrade?feature=revenueModule");
```

### Phase B — Feature key catalog + gating audit (1 commit, ~2 hr)

`src/lib/plan-features.ts` — list ของ feature keys ที่มี:
```typescript
export type FeatureKey =
  | "approvalFlow" | "multiStepApproval"
  | "whtCertificate" | "substituteReceipt" | "receiptVoucherEsig"
  | "revenueModule" | "quotation" | "billing" | "taxInvoice"
  | "customBranding"
  | "weeklyReport" | "plPerProject" | "vat30Report"
  | "auditLogExport"
  | "lineOaChat" | "lineGroupBot" | "gmailScan"
  | "apiAccess";
```

แล้วทุกที่ที่ plan-gate ตอนนี้ → migrate ไปใช้ `hasFeature(plan, "...")`. ลบ `ALLOWED_PLANS` ทุกไฟล์.

### Phase C — Schema migration (1 commit, ~30 min)

```diff
model Subscription {
   plan                 String       @default("free")
+  // Trial — overrides plan ถ้า trialEndsAt > now()
+  trialPlan            String?      @map("trial_plan")           // "pro"
+  trialStartedAt       DateTime?    @map("trial_started_at")
+  trialEndsAt          DateTime?    @map("trial_ends_at")
+
+  // Stripe sync state
+  stripeCustomerId     String?      @map("stripe_customer_id")
   stripeSubscriptionId String?      @map("stripe_subscription_id")
+  stripePriceId        String?      @map("stripe_price_id")      // recurring price ที่ active
+  billingInterval      String?      @map("billing_interval")      // "monthly" | "yearly"
+  currentPeriodEnd     DateTime?    @map("current_period_end")
+  cancelAtPeriodEnd    Boolean      @default(false) @map("cancel_at_period_end")
+
   maxMembers           Int          @default(2) @map("max_members")
   maxEvents            Int          @default(3) @map("max_events")
}

+ // Add-on seats / OCR top-ups
+ model SubscriptionAddon {
+   id           String   @id @default(uuid())
+   orgId        String   @map("org_id")
+   addonType    String   @map("addon_type")  // "extra_user" | "ocr_topup_100"
+   quantity     Int      @default(1)
+   stripeItemId String?  @map("stripe_item_id")
+   activatedAt  DateTime @default(now()) @map("activated_at")
+   expiresAt    DateTime? @map("expires_at")
+
+   @@map("subscription_addons")
+ }

+ // Track monthly usage for quota enforcement
+ model UsageCounter {
+   id        String   @id @default(uuid())
+   orgId     String   @map("org_id")
+   yearMonth String   @map("year_month")  // "2026-05"
+   metric    String                       // "ocr" | "expense" — extend as needed
+   count     Int      @default(0)
+   updatedAt DateTime @updatedAt @map("updated_at")
+
+   @@unique([orgId, yearMonth, metric])
+   @@map("usage_counters")
+ }
```

### Phase D — Quota enforcement hooks (1 commit, ~1 hr)

`src/server/lib/usage.ts`:
```typescript
export async function incrementAndCheckQuota(
  orgId: string,
  plan: PlanTier,
  metric: "ocr" | "expense",
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = PLAN_LIMITS[plan][metric === "ocr" ? "ocrPerMonth" : "ignored"];
  if (limit === -1) return { allowed: true, current: 0, limit: -1 };
  // ... check + increment in single Postgres tx
}
```

Wire ใน:
- `/api/ocr/receipt` — block ถ้าเกิน OCR limit
- `payment.create` (optional — locked doc ไม่บอก records/month)
- Settings page โชว์ usage progress bar

### Phase E — Stripe checkout + webhook (2 commits, ~3-4 hr)

1. **Pricing page** `/pricing` (public, ไม่ต้อง login) — table comparison + 4 upgrade buttons (Basic/Pro/Business/Max) × 2 (monthly/yearly)
2. **Checkout** `/api/stripe/checkout` — create session → redirect to Stripe-hosted checkout
3. **Webhook** `/api/stripe/webhook`:
   - `checkout.session.completed` → upgrade plan, set `stripeSubscriptionId` + `currentPeriodEnd`
   - `customer.subscription.updated` → sync interval/price changes
   - `invoice.paid` → log audit
   - `invoice.payment_failed` → mark `cancelAtPeriodEnd` + email user
   - `customer.subscription.deleted` → downgrade to "free" + `archive` flag on revenue records
4. **Account billing page** `/account/billing` — current plan, usage bars, upgrade/downgrade, invoices, cancel

### Phase F — Trial flow (1 commit, ~1 hr)

- New org sign-up → set `trialPlan="pro"`, `trialStartedAt=now`, `trialEndsAt=+30d`
- `effectivePlan(sub)` returns `trialPlan` ถ้า active, else `plan`
- Day-25 email + in-app banner "Trial หมดใน 5 วัน"
- Day-31 cron (Vercel cron) → sweep trials → expire (downgrade to free, send email)

### Phase G — Add-on purchase (deferred — S27 candidate)

ไม่ block soft launch. ทำหลังจาก S26 ขึ้นด้วย. Stripe usage-based pricing สำหรับ +OCR และ +seat.

---

## 3. Estimated S26 effort

| Phase | What | Effort |
|------|------|--------|
| A | `plans.ts` single source of truth | 1 hr |
| B | Migrate 12 ALLOWED_PLANS → `hasFeature` + audit gates | 2 hr |
| C | Prisma schema (trial + Stripe + UsageCounter + SubscriptionAddon) | 0.5 hr |
| D | Quota enforcement (OCR + UI usage bar) | 1 hr |
| E | Stripe checkout + webhook + /pricing + /account/billing | 3-4 hr |
| F | Trial 30-day flow | 1 hr |
| **Total** | | **~9-10 hr → 1 session** |

---

## 4. ❓ Open decisions ที่ยังต้องลั่นก่อนเริ่ม code

1. **Stripe account** — มี Stripe Thailand business account ไว้แล้วหรือยัง? ต้อง KYC สักวัน
2. **Currency** — THB only (Stripe TH) confirmed?
3. **Free Forever OCR limit = 5/เดือน** — ถูกใช่ไหม? (ฟังดูน้อย — เผื่อ user ที่อยากลอง upload จะเกินทันที = upgrade prompt)
4. **Trial duration = 30 วัน** confirmed (Excel ระบุ)?
5. **Multi-business switcher** — Excel ระบุ Pro+ แต่โค้ดตอนนี้ multi-org เปิดให้ทุกคน. ต้อง gate ที่ Pro+ ใช่ไหม? (จะ break user เก่าที่มี multi-org บน Free)
6. **Annual billing UI** — แสดงทั้ง monthly + yearly ใน /pricing? (Stripe support ทั้ง 2 prices ต่อ tier)
7. **Add-on flow** — defer ถึง S27 ok ไหม? หรือ block soft launch?
8. **Migration discount 50%** — ต้องมี promo code system หรือ manual coupon ใน Stripe?

---

## 5. Roadmap fit (Wave alignment)

จาก `Roadmap` sheet:
- **Wave 1 (26d):** ส่วนใหญ่ done. ✅ ที่เหลือ = #17 Stripe + #18 Trial logic = **S26 scope**
- **Wave 2 (17.5d):** Quotation/Billing/TI/P&L/ภ.พ.30 = ✅ done (S22-S25B). #19 Multi-step approval, #20 ใบสำคัญรับเงิน + e-sig = TBD (S27?)
- **Wave 3 (18d):** LINE Group bot, Gmail scan, Multi-business switcher, Custom branding, API, Audit log export, PWA = post-launch polish

→ **S26 = Wave 1 finish line.** หลัง S26 launch ได้เลย; Wave 3 features = post-launch upsells

---

## 6. แก้ไขที่ผมพลาดใน proposal ก่อนหน้า

ผมเสนอราคาที่ค่อนข้างสูงกว่า locked: Pro 599 vs **399**, Business 1500 vs **699**. นี่ผิด — ตามที่พี่ระบุ:
- Pro 399 อยู่ใน sweet spot สำหรับ Thai SME (ต่ำกว่า FlowAccount 750)
- Margin ก็ ok ที่ 50% (199 บาท/seat/mo)
- Free Forever 0 + 5 OCR เป็น acquisition magnet — strategy ที่ดี

ผมจะใช้ locked numbers เป็น source of truth แล้วเริ่ม Phase A ทันทีถ้าพี่ confirm 8 questions ใน §4
