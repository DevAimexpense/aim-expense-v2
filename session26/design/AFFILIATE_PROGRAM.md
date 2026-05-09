# Affiliate / Referral Program — Aim Expense

> **Status:** Draft for พี่ review (2026-05-09)
> **Inputs:** Locked pricing (Aim-Expense-Pricing-Roadmap.xlsx) + Cost Analysis sheet
> **Goal:** Lock down code structure + commission rate + user incentive ก่อน S26 (จะ build พร้อม Stripe)

---

## 0. Margin baseline (จาก Excel ของพี่)

ก่อนคำนวณ affiliate ต้องดู margin ที่มีอยู่:

| Plan | ราคา/mo | Cost/mo* | Margin บาท | Margin % |
|------|---:|---:|---:|---:|
| Basic | 189 | 81.90 | 107.10 | 57% |
| **Pro** ⭐ | **399** | **199.56** | **199.44** | **50%** |
| Business | 699 | 380.51 | 318.49 | 46% |
| Max | 1,499 | 864.71 | 634.29 | 42% |

\* รวม OCR (worst case full quota) + Stripe fee + LINE push + hosting

**Sample LTV (assume 24-month retention, no churn):**
- Basic: 189 × 24 = 4,536฿ revenue / 1,966฿ cost / **2,570฿ profit**
- Pro: 399 × 24 = 9,576฿ revenue / 4,789฿ cost / **4,787฿ profit** ← target
- Business: 699 × 24 = 16,776฿ revenue / 9,132฿ cost / **7,644฿ profit**

→ Affiliate budget should be a fraction of profit, not revenue

---

## 1. ส่วนลดที่ดึงดูดให้ user ใช้ code (4 options)

### Option I: ส่วนลดเงินสด — เดือนแรก
| Discount | User pays Pro 399 | Aim margin month 1 | Margin Δ |
|---|---:|---:|---:|
| 10% off | 359 | 159.44 | −40.00 |
| 20% off ⭐ recommended | 319 | 119.44 | −80.00 |
| 30% off | 279 | 79.44 | −120.00 |
| 50% off | 199 | 0.56 | almost break-even |

⭐ **20% off เดือนแรก** = sweet spot — user รู้สึกได้ส่วนลดชัด, Aim ยังมี margin บาง

### Option II: เดือนแรกฟรี
- User: pay 0฿ เดือนแรก, full Pro feature
- Aim cost: ~199.56฿ (lose 1 month margin = 199.44)
- Pro: similar to extending Trial 30→60 days
- ⚠️ **risk:** abuse — user สมัคร, ใช้ฟรีเดือนแรก, แล้ว cancel ก่อนเดือน 2

### Option III: Bonus OCR scans
- User: ยังจ่ายราคาเต็ม แต่ได้ +200 OCR ฟรีเดือนแรก
- Aim cost: 200 × 0.50 = 100฿ (ครึ่งของส่วนลด 20%)
- ใช้ได้ดีกับ partner-affiliate ที่ส่ง user OCR-heavy
- ❌ ไม่ดึงดูดเท่าเงินสด — user มองไม่ออกว่ามูลค่าเท่าไร

### Option IV: ขยาย Trial
- User: Trial 30→60 วัน (Pro features)
- Aim cost: 175฿ (ตามที่ Excel คำนวณ)
- ❌ ไม่กระตุ้นการใช้ code (Trial มีฟรีอยู่แล้ว — user ลังเลใช้ code)

### 🎯 แนะนำ: **Option I 20% off + Option III bonus 100 OCR** (combo)
- User pays Pro 319฿ (instead of 399) เดือนแรก + ได้ +100 OCR ฟรี
- Aim cost: discount 80฿ + OCR 50฿ = **130฿** (vs profit 199.44 = 35% margin remaining month 1)
- **เทียบกับ Migration discount 50%** ที่พี่มีอยู่: ของผมเบากว่าครึ่ง แต่ดึงดูดได้พอ
- **User mental hook:** "ใส่ code = ลดเงิน + ได้ OCR เพิ่ม"

---

## 2. ค่า affiliate commission (4 structures)

### Structure A: One-time, % ของเดือนแรก
```
Pro: 399 × 25% = 99.75฿ ต่อ conversion
```
- ✅ เรียบง่าย, predict ง่าย, ไม่มี recurring obligation
- ✅ จ่ายครั้งเดียว → ปิด case
- ❌ ไม่จูงใจ affiliate ให้ส่งคนคุณภาพ (เก็บเงิน + หาย)

### Structure B: Recurring 10-15% lifetime
```
Pro: 399 × 12% = 47.88฿/mo ตลอดอายุที่ user จ่าย
12-month LTV per affiliate: 574.56฿
```
- ✅ จูงใจ affiliate ให้ส่ง user ที่อยู่นาน (ลด churn risk)
- ✅ มาตรฐาน SaaS (Mailerlite 30%, Sendinblue 5% lifetime)
- ❌ Aim cost permanent — eats margin forever
- ❌ Tracking ซับซ้อน (refund / pause / upgrade ต้อง re-calc)

### Structure C: Front-loaded 3 เดือน ⭐ recommended
```
Pro 3-month commission:
  Month 1: 30% × 399 = 119.70฿
  Month 2: 20% × 399 = 79.80฿
  Month 3: 10% × 399 = 39.90฿
  Total per conversion: 239.40฿
```
- ✅ Affiliate ได้เยอะ (60% ของเดือนแรก) → จูงใจสูง
- ✅ Aim cap exposure ที่ 3 เดือน → predictable
- ✅ Anti-churn: Affiliate รู้ว่าได้แค่ user ที่อยู่ครบ 3 เดือน → ไม่อยากส่งคนสุ่ม
- LTV impact: 4,787฿ profit → 4,547.60฿ (≈5% reduction) — ยอมรับได้

### Structure D: Hybrid — One-time + small recurring
```
Pro:
  Bonus first month: 20% × 399 = 79.80฿
  Recurring: 5% × 399 = 19.95฿/mo สำหรับ 12 เดือน
  Total per conversion: 79.80 + (19.95 × 12) = 319.20฿
```
- Balance ระหว่าง simplicity + long-term incentive
- ⚠️ ซับซ้อนกว่า A/C

### 📊 เปรียบเทียบ commission options ที่ Pro tier (399฿/mo, retention 12 mo)

| Structure | Affiliate ได้ | Aim ลด profit | % ของ Year 1 profit |
|---|---:|---:|---:|
| A: 25% one-time | 99.75 | 99.75 | 4.2% |
| B: 12% recurring lifetime (12mo) | 574.56 | 574.56 | 24.0% |
| **C: 30/20/10 declining 3mo** ⭐ | **239.40** | **239.40** | **10.0%** |
| D: 20% one-time + 5% recurring 12mo | 319.20 | 319.20 | 13.3% |

⭐ **Recommend C (30/20/10 declining 3 เดือน)** — best balance

---

## 3. รวมส่วนลด + commission — full math (Pro tier example)

ใช้ **Combo I+III (20% off + 100 OCR bonus) + Structure C (30/20/10)**:

```
Month 1:
  User pays:        399 × 0.80 = 319.20฿
  Aim revenue:      319.20฿
  Stripe fee:       319.20 × 0.0365 + 10 = 21.65฿
  OCR cost:         (300 + 100 bonus) × 0.50 = 200฿
  LINE + Hosting:   25฿
  Total cost:       246.65฿
  Gross margin:     72.55฿
  Affiliate (30%):  319.20 × 0.30 = 95.76฿  ⚠️ exceeds margin
  Aim NET:          (23.21)฿  → loss month 1!

Month 2:
  User pays:        399 (full price)
  Aim revenue:      399
  Total cost:       199.56
  Gross margin:     199.44
  Affiliate (20%):  399 × 0.20 = 79.80
  Aim NET:          119.64

Month 3:
  Aim revenue:      399
  Gross margin:     199.44
  Affiliate (10%):  39.90
  Aim NET:          159.54

Month 4-12 (no commission):
  Aim NET:          199.44/mo × 9 = 1,795฿

YEAR 1 TOTAL Aim profit per acquired user:
  −23.21 + 119.64 + 159.54 + 1,795 = 2,051฿
  
Compare to organic (no affiliate):
  199.44 × 12 = 2,393฿
  
Affiliate cost per acquired user: 342฿ (~14% of Year 1 profit)
```

⚠️ Month 1 ขาดทุน — แต่ recovered ใน Month 2+. ถ้า user churn ก่อน 2 เดือน = real loss.

### Mitigation — กฎจ่าย commission

1. **Hold 30 วันก่อนจ่าย** — รอ refund window ผ่าน
2. **Min commitment 60 วัน** — ถ้า user cancel ก่อน 60 วัน → claw back commission
3. **Min user retention check** — pay only after user paid month 2 invoice (skip C month 1, give 0/30/30/20 over months 2-4 instead)

### 🔄 Adjusted recommendation — pay AFTER month 1 confirmed

```
  Month 1: 0% (validate user is real first, no payout)
  Month 2: 40% × 399 = 159.60฿ (paid at end of month 2)
  Month 3: 25% × 399 = 99.75฿
  Month 4: 15% × 399 = 59.85฿
  Total: 319.20฿ per CONFIRMED conversion (= ~80% of first month revenue)
```

ผลลัพธ์:
- Aim Year 1 profit per acquired user: 2,393 − 319.20 = **2,073฿** (~13% reduction)
- Affiliate ได้: 319.20฿ ต่อ confirmed conversion
- Risk: zero claw-back complications (จ่ายหลังยืนยัน)

---

## 4. แนะนำให้แบ่ง 2 program

### Program A: **Customer Referral** (peer-to-peer)
**คนใช้:** ลูกค้าปัจจุบันแนะนำเพื่อน

- **Code:** `เอม-XXXX` (4-char สุ่ม) per user
- **Friend gets:** 20% off เดือนแรก + 100 OCR bonus (ตาม §1 combo)
- **Existing customer gets:** 1 เดือน Pro ฟรี (credit applied to next bill, max 6 free months ต่อปี)
- **Mutual benefit, NO CASH** — simple, viral, zero outlay

ตัวเลข:
- Reward = 1 month Pro × cost 199.56 = 199.56฿ ต่อ successful referral
- ROI: ถ้า new user retain 6 เดือน → 6 × 199.44 − 199.56 = 996.6฿ profit per referral
- Risk minimal (ไม่มีเงินสดออก)

### Program B: **Partner Affiliate** (cash, professional)
**คนใช้:** บัญชี/ที่ปรึกษาธุรกิจ/influencer การเงิน

- **Code:** `XXXX-YYYY` (8-char) per partner — partner login portal เห็น stats
- **New user gets:** 20% off เดือนแรก + 100 OCR bonus (เหมือน Program A)
- **Partner gets:** 80% ของเดือนแรก revenue, distributed ตาม Structure C adjusted (0/40/25/15 declining months 2-4)
- **Tier-aware:** % เท่ากันทุก plan, ตัวเงินต่างกัน (Pro = 319, Business = 559, Max = 1,199)
- **Min payout threshold:** 500฿ (รวมก่อนโอน — ลด transfer fee)
- **Payout via:** PromptPay (Thai partner) หรือ Stripe Connect (international)

ตัวเลข:
- Pro conversion = Aim ลด profit ~13% Year 1, แต่กำไร remaining 2,073฿
- Partner ส่ง 10 conversions/mo = ได้ 3,192฿/mo recurring × few months

---

## 5. Fraud prevention

| Risk | Mitigation |
|---|---|
| Self-referral (user ใส่ code ตัวเอง) | Block ถ้า email/IP/device match กับ partner account |
| Sub-account farming (1 partner สร้าง 100 accounts ใส่ code ตัวเอง) | Manual review > 5 referrals/day; Stripe payment method dedup |
| Card-test then cancel เพื่อเก็บ commission | Pay-after-month-2 rule (above) |
| Partner ขโมย code คนอื่น | Code unique + ผูกกับ partner account |
| Multi-attribution (user เห็นโฆษณา 2 partner) | Last-click 30 วัน, cookie-based |

---

## 6. Tracking & implementation

### Schema
```prisma
model AffiliatePartner {
  id              String   @id @default(uuid())
  userId          String   @unique @map("user_id")  // partner ต้องเป็น user
  code            String   @unique                  // "ARTO-X9KQ"
  programType     String   @map("program_type")     // "customer_referral" | "partner_affiliate"
  isActive        Boolean  @default(true) @map("is_active")
  payoutMethod    String?  @map("payout_method")    // "promptpay" | "stripe_connect"
  payoutAccount   String?  @map("payout_account")   // PromptPay ID หรือ Stripe Connect ID
  totalReferrals  Int      @default(0) @map("total_referrals")
  totalCommission Decimal  @default(0) @db.Decimal(12, 2) @map("total_commission")
  createdAt       DateTime @default(now()) @map("created_at")

  user            User     @relation(fields: [userId], references: [id])
  referrals       Referral[]
  commissions     Commission[]

  @@map("affiliate_partners")
}

model Referral {
  id                  String   @id @default(uuid())
  partnerId           String   @map("partner_id")
  referredOrgId       String   @unique @map("referred_org_id")  // org ที่ใช้ code
  code                String                                     // copy ของ AffiliatePartner.code ตอนใช้
  status              String   @default("pending")              // pending | confirmed | refunded | invalid
  signedUpAt          DateTime @default(now()) @map("signed_up_at")
  firstPaymentAt      DateTime? @map("first_payment_at")
  confirmedAt         DateTime? @map("confirmed_at")            // = firstPaymentAt + 30d hold
  discountApplied     String   @default("20pct_first_month_plus_100ocr") @map("discount_applied")
  
  partner             AffiliatePartner @relation(fields: [partnerId], references: [id])

  @@map("referrals")
}

model Commission {
  id           String   @id @default(uuid())
  partnerId    String   @map("partner_id")
  referralId   String   @map("referral_id")
  monthIndex   Int      @map("month_index")  // 2 | 3 | 4 (no commission month 1)
  amountTHB    Decimal  @db.Decimal(10, 2) @map("amount_thb")
  status       String   @default("scheduled") // scheduled | paid | held | clawed_back
  scheduledFor DateTime @map("scheduled_for")
  paidAt       DateTime? @map("paid_at")
  payoutBatchId String? @map("payout_batch_id")

  partner      AffiliatePartner @relation(fields: [partnerId], references: [id])

  @@map("commissions")
}
```

### Code application flow
1. Partner ได้ link `https://aimexpense.com/?ref=ARTO-X9KQ` หรือเข้าหน้าใส่ code
2. Click link → set cookie `aim_ref=ARTO-X9KQ` (30-day TTL) + LocalStorage
3. ผู้ใช้ sign up:
   - ถ้ามี cookie → auto-fill ในหน้า /pricing หรือ /upgrade
   - ถ้า manual paste → validate format + fetch partner
4. Stripe checkout:
   - Apply Stripe Coupon `ref-20pct-month1` (20% off first invoice)
   - Bonus OCR = mark `subscription.metadata.bonus_ocr=100` → server-side adds quota
5. `checkout.session.completed` webhook:
   - Create `Referral` row (status=pending)
   - Schedule 3 `Commission` rows for months 2/3/4 (status=scheduled)
6. `invoice.paid` webhook (month 2):
   - Mark referral=confirmed
   - Trigger pending commission scheduled_for=now → status=paid (manual payout next batch)
7. Refund within 30 days:
   - Mark referral=refunded
   - Cancel scheduled commissions

### UI components (S26 scope)
- `/refer` page — partner สร้าง code + ดู stats + referral history
- `/pricing?ref=CODE` — pre-fill code field
- `/account/billing` — แสดง code field + apply discount preview
- Sign-up form — code field (optional)
- Email — "ใส่ code = ส่วนลด 20% + 100 OCR ฟรี"

### Effort estimate (S26 add-on)
- Schema + migration: 0.5 hr
- Code apply + validation API: 1 hr
- Stripe coupon integration: 1 hr
- Webhook → referral/commission lifecycle: 1.5 hr
- /refer partner portal: 2 hr
- Payout batch UI (admin): 1 hr (defer to S27 ok)
- **Total: ~5-6 hr addition to S26** (or split S27)

---

## 7. ❓ Open decisions ขอพี่ลั่น

### ส่วนลดที่ user ได้เมื่อใช้ code

1. **เลือก discount option ใด?** (จาก §1)
   - ⭐ Combo I+III: 20% off + 100 OCR bonus (เสนอ)
   - I 20% off only (เบาสุด)
   - II 1 month free (ดึงดูดสุด แต่เสี่ยง abuse)
   - I+II 20% off + bonus 7-day extension

### Affiliate commission

2. **เลือก commission structure ใด?** (จาก §2)
   - A 25% one-time (เรียบง่าย, affiliate ได้น้อย)
   - **B 12% lifetime recurring** (sustainable affiliate, Aim cost ตลอด)
   - ⭐ **C 30/20/10 declining 3 เดือน** (เสนอ — balanced)
   - D 20% + 5% recurring 12mo (mid-complexity)

3. **One-time vs lifetime** — ตอบโดยตรง:
   - One-time = ง่าย จบที่ 1 จ่าย
   - Lifetime = motivated affiliate + viral แต่ Aim eat margin permanent
   - ⭐ **My pick: 3-month declining (semi-lifetime)** — best of both

### Program scope

4. **Program 1 (Customer referral)** + **Program 2 (Partner affiliate)** — เปิดทั้ง 2 หรือ 1?
   - 1 = peer-to-peer mutual (no cash, viral)
   - 2 = paid (CPA firms, business consultants)
   - ⭐ **เสนอเปิดทั้ง 2** — different audiences, ไม่ทับกัน

5. **Payout method partner** — PromptPay (Thai only) / Stripe Connect (global) / both?
6. **Min payout threshold** — 500฿ ok หรืออยากต่ำกว่า?

### Implementation

7. **Build ใน S26 พร้อม Stripe** — ใช่ไหม? (~5-6 hr เพิ่มจาก ~9-10 hr ของ S26)
   - หรือ defer แยกเป็น S27 (Stripe ก่อน → Affiliate ทีหลัง)

ตอบ 7 questions นี้ → ผมเขียน schema + checkout integration พร้อมกับ Stripe ใน S26 ได้เลย
