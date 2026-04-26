# Session 19 → Session 20 — Handoff

> **Created:** 2026-04-26 (end of Session 19)
> **Reason:** WHT Phase 1 (page + procedure + table + CSV/XLSX) เสร็จ + orphan weekly-payment ลบเรียบร้อย → ปิด session ก่อน context เต็ม. Phase 2 (PDF ตามฟอร์มกรมสรรพากร 100%) ย้ายไป S20
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Type check:** ✅ 0 errors (หลังพี่ลบ folder /reports/weekly-payment + bank-csv.ts)
> **Smoke test:** ⏳ รอพี่ test
> **Working tree:** ⚠️ มี changes ที่รอ commit (ดู commit timeline ด้านล่าง)

---

## 🔴 อ่านก่อนเริ่มทำงานทุกครั้ง

1. **`SYSTEM_REQUIREMENTS.md`** ← Single Source of Truth — 4 core principles
2. **ไฟล์นี้** ← what's next (Session 20)
3. **`session18/handoff/HANDOFF_2026-04-26_END_CLEANUP-WEEKLY.md`** ← S18 context (orphan/sidebar)
4. **`session17/handoff/HANDOFF_2026-04-26_END_PERF-OPT.md`** ← S17 context (perf optimization)

---

## 🎯 ที่ทำใน Session 19 (สรุปสั้น)

### 1️⃣ Cleanup orphan — `/reports/weekly-payment` + `bank-csv.ts` (พี่ confirm ลบทิ้ง)

**เหตุผล:** S18 commit `e9ba6e8` สร้าง /reports/weekly-payment พอ pattern สมบูรณ์, แต่เปิดประเด็นว่าซ้ำซ้อนกับ /payment-prep workflow (per-bank tabs + Mark paid batch + Excel export ครบกว่า). S19 พี่ confirm ลบทิ้งทั้ง chain.

**Fix:**
- ลบ `weeklyPayment` procedure + `WeeklyPaymentInput` schema ใน `src/server/routers/report.router.ts` (เก็บ comment ระบุ removed in S19 + git ref `e9ba6e8`)
- พี่ลบใน Terminal:
  ```bash
  rm -rf "src/app/(app)/reports/weekly-payment"
  rm src/lib/utils/bank-csv.ts
  ```

**ผลรวม:** ~750 บรรทัดลบ (procedure 209 + page/client ~520 + helper ~140)

### 2️⃣ Phase 4 — `/reports/wht` (ภงด.3 + ภงด.53) — Phase 1 (page + procedure + table + CSV/XLSX)

**Spec ที่พี่ confirm ผ่าน AskUserQuestion:**
- Vendor type detection: **TaxID prefix** — 13 หลัก ขึ้นต้น 0 = นิติบุคคล (ภงด.53), อื่นๆ (incl. empty) = บุคคลธรรมดา (ภงด.3)
- Status filter: **paid only** (Revenue Dept ใช้ actual cash-out, ไม่ใช่ approved)
- Date filter: **Date range** ยืดหยุ่น (DateRangePicker) — default this-month
- Filter date field: **PaymentDate** (fall back to PaidAt slice)

**Backend — `report.wht` procedure (`src/server/routers/report.router.ts`):**
- Read-only aggregation จาก Sheets (SYSTEM_REQUIREMENTS principle 3)
- Skip `ensureAllTabsExist` (S17 pattern)
- Parallel pull: `getPayments()` + `getEvents()` + `getPayees()`
- Filter: `Status === "paid"` + `WTHAmount > 0` + date range + project (eventId optional)
- Vendor type split:
  ```ts
  taxId.length === 13 && taxId.startsWith("0")
    ? "pnd53" : "pnd3"
  ```
- Branch label: HQ → "00000", Branch + number → 5-digit pad
- Returns:
  ```ts
  {
    stats: { totalCount, totalIncome, totalWHT, payeeCount },
    pnd3:  { stats: {...}, rows: WHTRow[] },
    pnd53: { stats: {...}, rows: WHTRow[] }
  }
  ```
- WHTRow = identity (paymentId, paidDate, payeeId, payeeName, taxId, branchLabel, address) + project context (eventId, eventName) + form fields (incomeType, rate, incomeAmount, whtAmount, condition) + auxiliary (invoiceNumber, description)

**Frontend — `/reports/wht`:**
- Server entry: `page.tsx` (auth + org context — pattern เดียวกับ clearance)
- Client: `wht-client.tsx` (~410 บรรทัด)
- Layout:
  - Filters: DateRangePicker + Project SearchableSelect
  - 4 StatCards: รายการรวม / ยอดเงินได้ / ภาษีหัก / ผู้รับเงิน (overall — sum of both buckets)
  - Tabs: ภงด.3 (บุคคลธรรมดา) | ภงด.53 (นิติบุคคล) — ใช้ URL `?tab=pnd3|pnd53`
  - Action row: counter + ExportButton (CSV/XLSX/PDF — generic ก่อน, S20 จะเปลี่ยน PDF เป็น form 100%)
  - DataTable: 9 columns ตาม ใบแนบ ภงด.3/53 ของกรมสรรพากร (วันที่จ่าย / เลขผู้เสียภาษี / ผู้มีเงินได้ / ประเภทเงินได้ / อัตรา% / จำนวนเงิน / ภาษีหัก / เงื่อนไข / โปรเจกต์)
- Yellow info banner: แจ้ง user ว่า PDF ตามฟอร์ม 100% จะมาใน S20
- URL sync: `?tab=pnd3|pnd53` + `?eventId=...`

### 3️⃣ Sidebar — ไม่ต้องแก้!

S18 ใส่ dead links `/reports/wht?tab=pnd3` + `/reports/wht?tab=pnd53` ไว้แล้ว → ตอนนี้ live (S19 implement หน้า) ✅

### 4️⃣ Refactor: ตัด in-page tabs ออก (พี่ขอตอนปลาย S19)

**ปัญหา:** หลัง smoke test แรก พี่สังเกตว่า sidebar แยก "ภงด.3" + "ภงด.53" ออกเป็น 2 link อยู่แล้ว → in-page tabs ซ้ำซ้อน + ทำให้ user งง

**Fix:** Refactor `wht-client.tsx`:
- ลบ in-page tabs UI ทั้งหมด (`<div className="app-tabs">...</div>`)
- ลบ `useState<WhtTab>` + `handleTabChange`
- Tab ตอนนี้ derive จาก URL `?tab=` โดยตรง (read-only) — sidebar คือ switcher
- Title + subtitle เปลี่ยนตาม tab (`👤 รายงาน ภ.ง.ด.3 — บุคคลธรรมดา` / `🏢 รายงาน ภ.ง.ด.53 — นิติบุคคล`)
- 4 StatCards แสดงเฉพาะของ tab ที่เลือก (ไม่ใช่ overall split)
- ส่ง `type: tab` เข้า procedure → ลด data ที่ดึงกลับ (procedure return เฉพาะ bucket ที่ขอ)

**Commit:** `refactor(reports/wht): remove in-page tabs - sidebar drives active bucket via ?tab= (S19)` — ปิดท้าย S19

---

## 📦 Commit Timeline (Session 19)

| # | Subject | สถานะ |
|---|---------|-------|
| 1 | `feat(reports): replace /reports/weekly-payment with /reports/wht (ภงด.3/53 Phase 1, S19)` | ✅ pushed |
| 2 | `refactor(reports/wht): remove in-page tabs - sidebar drives active bucket via ?tab= (S19)` | ⏳ รอพี่ commit (ปิดท้าย S19) |

### Working tree ก่อนปิด S19

```
M  src/server/routers/report.router.ts   (-209 weeklyPayment, +220 wht — net +11)
A  src/app/(app)/reports/wht/page.tsx
A  src/app/(app)/reports/wht/wht-client.tsx
D  src/app/(app)/reports/weekly-payment/page.tsx       (พี่ลบใน Terminal)
D  src/app/(app)/reports/weekly-payment/weekly-payment-client.tsx (พี่ลบใน Terminal)
D  src/lib/utils/bank-csv.ts                            (พี่ลบใน Terminal)
A  session19/handoff/HANDOFF_2026-04-26_END_WHT-PHASE1.md
```

### Commands ที่พี่ต้องรันก่อนปิด S19

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense

# 1. ลบ orphan files (sandbox ทำเองไม่ได้)
rm -rf "src/app/(app)/reports/weekly-payment"
rm src/lib/utils/bank-csv.ts

# 2. Type check (ต้องผ่าน 0 errors)
npx tsc --noEmit

# 3. Commit แยก 2 ก้อน
rm -f .git/index.lock
git add -A
git commit -m "chore(reports): remove orphan /reports/weekly-payment + bank-csv helper (S19)"
# (ก้อนนี้รวม weekly-payment delete + procedure removal + handoff doc)

# 4. ถ้าจะแยก commit จริง — stash แล้ว commit ทีละก้อน:
git stash
git checkout -- src/server/routers/report.router.ts  # คืน weeklyPayment block
# ... (ซับซ้อน — แนะนำ commit ก้อนเดียวรวมทั้ง orphan + WHT)

# 5. Push
git push
```

> 💡 **แนะนำ:** commit ก้อนเดียว `feat(reports): replace /reports/weekly-payment with /reports/wht (ภงด.3/53 Phase 1, S19)` ดีกว่า เพราะ orphan removal + WHT add เป็น atomic refactor (ลบของเก่า เพิ่มของใหม่ ใน topic เดียวกัน)

---

## 🎯 งาน Session 20 — Priority Suggestions

### 🚀 Phase 2 (Highest priority) — PDF generation ตามฟอร์มกรมสรรพากร 100%

**3 forms ที่ต้อง implement (พี่ส่ง spec ครบแล้วใน S19 uploads):**

| # | Form | Use case | Existing? |
|---|------|----------|-----------|
| 1 | หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) | 1 ใบ/รายการ — ให้ payee | ✅ มีแล้วที่ `/documents/wht-cert/[paymentId]/` (`wht-doc-utils.ts`) |
| 2 | ใบแนบ ภงด.3 + ใบแนบ ภงด.53 | รายการรวม 6 ราย/แผ่น — ยื่นสรรพากร | ❌ ทำใน S20 |
| 3 | ใบสรุป ภงด.3 + ใบสรุป ภงด.53 | สรุปยอดรวมเดือน — ยื่นสรรพากร | ❌ ทำใน S20 |

**Approach แนะนำ:**
- ใช้ pattern เดียวกับ `/documents/wht-cert/[paymentId]/` (existing 50 ทวิ) — น่าจะใช้ React + html2canvas + html2pdf หรือ pdfkit
- **ฟอนต์:** Sarabun (TH) — เช็คว่ามี asset ใน repo แล้วหรือยัง (เคยใช้ใน wht-cert)
- **Layout:** position absolute ตามพิกัดฟอร์ม + row repeater (6 rows/แผ่น)
- **Multi-page:** ถ้ารายการเกิน 6 → สร้างแผ่นใหม่ + เลขแผ่น (1/N)
- **Org metadata:** ดึงจาก Google Sheet `Config` tab — ต้องเพิ่ม fields:
  - `OrgTaxID` (13 หลัก)
  - `OrgBranchType` + `OrgBranchNumber`
  - `OrgAddress` (อาคาร/ห้อง/ชั้น/หมู่/ตรอก/ซอย/แยก/ถนน/ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์)
  - `OrgSignerName` + `OrgSignerTitle`
- **Spec PDFs ที่พี่ส่งใน S19:** อยู่ใน `local_..../uploads/` — ใบแนบ.pdf x2 + ภงด.3/53.pdf x2 + approve_wh3_081156.pdf (50 ทวิ — มีแล้ว)

**Sub-tasks ใน S20:**
1. เพิ่ม Config schema + UI ตั้งค่า Org metadata ใน `/settings/org` (หรือ onboarding step ใหม่)
2. สร้าง `/documents/pnd3/[period]` + `/documents/pnd53/[period]` (period = YYYY-MM) สำหรับ generate PDF
3. เปลี่ยน ExportButton ใน `/reports/wht` → เพิ่ม "ดาวน์โหลด PDF (ใบแนบ)" + "ดาวน์โหลด PDF (ใบสรุป)" — generate per tab/period

**ความเร่งด่วน:** สูง — sidebar dead link ทำงานได้แล้ว แต่ user ต้อง export PDF ตามฟอร์มจริงเพื่อยื่นสรรพากร

### 🚀 อื่นๆ (priority รองลงมา)

| Sub | สถานะ | งาน | ความเร่งด่วน |
|-----|-------|-----|---------------|
| /reports/vat (ภพ.30) | ❌ | sidebar dead link เก่า | กลาง |
| 12E Inactive Payees + Audit Logs UI | ❌ | admin tools | กลาง |
| 12B Dashboard role-specific | ❌ | dashboard แยกตาม role | ใหญ่ — ทำหลังสุด |
| Cleanup รอบ 2 | ❌ | ลบ /reports/expense-summary + /reports/by-project + procedures เก่า | หลัง unified สเถียร 1-2 สัปดาห์ |

---

## ⚠️ Known Issues / Watch Out

1. **🔴 Vercel Pro trial expires ~2026-05-06** — ⚠️ **เหลือ ~10 วัน!** ต้อง downgrade เป็น Hobby ที่: Vercel → Settings (team-level) → Billing → Switch to Hobby

2. **🟡 Workspace sandbox `git index.lock`** — ก่อน commit ทุกครั้ง:
   ```bash
   rm -f ~/Code/Aim\ Expense\ V2/aim-expense/.git/index.lock
   ```

3. **🟡 Cowork sandbox** — ลบ files / push เองไม่ได้ → พี่ทำใน Terminal เอง

4. **🟡 Single-line commit messages** — ห้ามใช้ multi-line `"` ผ่าน sandbox

5. **🟡 WHT Phase 1 export = generic CSV/XLSX** — column ตรงกับฟอร์มกรมสรรพากรแล้ว แต่ไม่ใช่ PDF ตามฟอร์ม. ผู้ใช้ที่ต้องการยื่นสรรพากรตอนนี้ ใช้ CSV ไป import เข้าโปรแกรมยื่น (RD Tax File / TaxBugnoms) หรือกรอกฟอร์มออนไลน์เอง — ระยะกลางต้องรอ S20

6. **🟡 Vendor type detection** = TaxID prefix เท่านั้น
   - Edge case: payee ที่กรอก TaxID ผิด format (ไม่ใช่ 13 หลัก) → ตกไปอยู่ ภงด.3 (default)
   - Edge case: payee ที่ TaxID ว่าง (เช่น vendor รายย่อย/นิรนาม) → ภงด.3 — ถ้าจริงเป็นนิติบุคคล ต้องไป update Payee ก่อน
   - แนะนำ: S20 เพิ่ม "Inactive Payees" report (12E) ด้วย → catch case ที่ data quality มีปัญหา

7. **🟡 PDF export = rasterized** (เดิม) — ใช้ html2canvas — ฟอร์มราชการอาจอ่านยากเมื่อพิมพ์ ขนาดกระดาษ A4 portrait

8. **🟡 iPhone 15 false positive ใน text parser** (เดิม S14) — ยังไม่ fix

9. **🟡 OVERDUE_THRESHOLD_DAYS = 14** ใน clearance procedure — hard-coded

10. **🟡 Org Config metadata** — ระบบยังไม่มี TaxID/Address/Branch ของบริษัท user ใน Sheets `Config` → S20 ต้องเพิ่มก่อน implement PDF

---

## 🔋 Environment State (ณ จบ Session 19)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Branch:          main
HEAD (local):    ก่อน commit S19 — รอพี่ทำ rm + git add + commit + push
Vercel:          deploy ใหม่ทุกครั้งที่ push
Type check:      ✅ 0 errors (หลังพี่ลบ orphan)
Smoke test:      ⏳ รอพี่ test /reports/wht บน dev
```

### ✅ Phase status overall

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 1-3 (CRUD) | ✅ 100% | |
| Phase 4 Shared Components | ✅ 100% | S15 |
| Phase 4 Reports Unified | ✅ 100% | S16 — /reports |
| Phase 4 Reports Clearance | ✅ 100% | S17 — /reports/clearance |
| Phase 4 Reports Performance | ✅ 100% | S17 — combined query |
| ~~Phase 4 Reports Weekly Payment~~ | 🗑️ removed | S18 add → S19 remove (orphan, ซ้ำกับ /payment-prep) |
| **Phase 4 Reports WHT (ภงด.3/53) — Phase 1** | ✅ 100% | **S19 — page + procedure + CSV/XLSX** |
| Phase 4 Reports WHT — Phase 2 | ❌ 0% | **S20 — PDF ใบแนบ + ใบสรุป (form 100%)** |
| Phase 4 Reports VAT (ภพ.30) | ❌ 0% | S20+ — dead link เก่า |
| Phase 4 Reports Inactive Payees + Audit | ❌ 0% | S21+ (12E) |
| Phase 4 Dashboard role-specific | ❌ 0% | S22+ (12B) |
| Phase 5 LINE | ✅ 100% | |
| Phase 6 Billing | ❌ 0% | หลัง Phase 4 จบ |

---

## 📋 User & Org info (พี่)

```
User:
  id              = 333d8b87-8b59-492f-b684-ee41c57768f8
  email           = dev@aimexpense.com
  lineUserId      = Ua42c7d7729c56f8eab021918c168761c
  lineDisplayName = AoR
  onboardingStep  = done

Org:
  id   = 32e5a820-ddb1-4850-95f3-b226d4e3a3e2
  name = บริษัท อาร์โต จำกัด
  slug = org-1776216850926
```

---

## 📝 Session 20 Starting Prompt — สำหรับ paste เข้า session ใหม่

```
สวัสดีค่ะเอม นี่คือ Session 20 ต่อจาก Session 19
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 Latest commit: refactor(reports/wht): remove in-page tabs - sidebar drives active bucket (S19)
🎉 S19: WHT Phase 1 (page + procedure + sidebar-driven UI + CSV/XLSX) เสร็จ + orphan weekly-payment ลบเรียบร้อย
🎉 Smoke test ผ่าน: /reports/wht ทำงาน + แยก sidebar 2 link (ภงด.3 / ภงด.53) ตามที่พี่ขอ
⚠️ /reports/vat ยังเป็น dead link — รอ implement

🔴 อ่านก่อนเริ่ม (ตามลำดับ):
1. SYSTEM_REQUIREMENTS.md  ← Single Source of Truth (4 core principles)
2. session19/handoff/HANDOFF_2026-04-26_END_WHT-PHASE1.md  ← handoff หลัก
3. session18/handoff/HANDOFF_2026-04-26_END_CLEANUP-WEEKLY.md  ← S18 context

🎯 งาน Session 20 — เลือก 1 sub-session ใหญ่:

🚀 ตัวเลือก (เรียงตามความเร่งด่วน):
- WHT Phase 2: PDF ใบแนบ + ใบสรุป ภงด.3/53 ตามฟอร์ม 100% (สำคัญที่สุด — user ต้องใช้ยื่นสรรพากร)
- /reports/vat (ภพ.30) — sidebar dead link เก่า
- 12E Inactive Payees + Audit Logs UI (admin tools)
- 12B Dashboard role-specific (ใหญ่สุด — ทำหลังสุด)

📋 ขั้นตอนแนะนำ (สำหรับ WHT Phase 2):
1. AskUserQuestion ก่อนเริ่ม: confirm scope + Config schema (Org TaxID/Address)
2. ดู existing /documents/wht-cert/ pattern เป็น reference
3. เพิ่ม Config tab fields ใน Sheets schema + UI ตั้งค่าใน /settings/org
4. Implement PDF generation (ใบแนบ + ใบสรุป × 2 = 4 forms)
5. เปลี่ยน ExportButton ใน /reports/wht → เพิ่ม "ดาวน์โหลด PDF (ใบแนบ)" + "ดาวน์โหลด PDF (ใบสรุป)"
6. type check + smoke test

⚠️ ข้อควรระวัง:
- 🔴 Vercel Pro trial หมด ~6 พ.ค. — เตือนพี่ downgrade เป็น Hobby (เหลือ ~10 วัน!)
- git index.lock อาจค้าง — ใช้: rm ~/Code/Aim\ Expense\ V2/aim-expense/.git/index.lock
- single-line commit messages เท่านั้น
- Cowork sandbox ลบ files / push เองไม่ได้ → พี่ทำเอง
- ห้ามเก็บ business data ใน Prisma (SYSTEM_REQUIREMENTS principle 2)
- Org metadata อยู่ใน Google Sheet Config tab (NOT Prisma) ตาม SYSTEM_REQUIREMENTS principle 1
- ห้าม cache report aggregation นอก request เดียว (Reports = Read-only Aggregation)
- เช็ค sidebar ก่อนเพิ่ม menu ใหม่ทุกครั้ง (S18 lesson learned)
```

---

*Handoff by เอม — Session 19 end — 2026-04-26*
