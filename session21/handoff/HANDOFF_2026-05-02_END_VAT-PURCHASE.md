# Session 21 → Session 22 — Handoff

> **Created:** 2026-05-02 (end of Session 21)
> **Reason:** /reports/vat (sidebar dead link เก่า) implement เสร็จแล้วในส่วน "รายงานภาษีซื้อ" (Input VAT) — ฝั่งภาษีขายเก็บไว้ทำคู่กับ sales/quotation module ในอนาคต
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Type check:** ✅ 0 errors
> **Smoke test:** 🟡 ยังไม่ได้ test browser (ผม sandbox start dev server ไม่ได้) — พี่ทำตอนเปิดเครื่อง

---

## 🔴 อ่านก่อนเริ่มทำงานทุกครั้ง

1. **`SYSTEM_REQUIREMENTS.md`** ← Single Source of Truth (4 principles)
2. **ไฟล์นี้** ← what's next (Session 22)
3. **`session20/handoff/HANDOFF_2026-04-26_END_WHT-PHASE2.md`** ← S20 context (WHT polish ที่ค้าง)

---

## 🎯 ที่ทำใน Session 21

### ✅ 1. รายงานภาษีซื้อ (Input VAT — `/reports/vat`)

**Scope decision:** Aim Expense เป็น **expense system** ฝั่งเดียว → /reports/vat แสดงเฉพาะ "รายงานภาษีซื้อ" (Input VAT) ที่ใช้แนบ ภ.พ.30 ตอนยื่น. ฝั่งภาษีขาย (Output VAT) จะมาเมื่อ quotation/invoice module เปิดใช้งาน — ตอนนั้น ภ.พ.30 ทั้งใบจะ generate ได้

**สร้างไฟล์ใหม่ 2 ไฟล์:**

| ไฟล์ | หน้าที่ |
|------|---------|
| `src/app/(app)/reports/vat/page.tsx` | Server entry — auth + org context (no plan-gate, ตรงกับ /reports/wht pattern) |
| `src/app/(app)/reports/vat/vat-client.tsx` | Client — filters + stats + DataTable + ExportButton |

**ไฟล์แก้ไข:**

- `src/server/routers/report.router.ts` — เพิ่ม:
  - `VatInput` schema: `{ from, to, eventId?, dateField: "receiptDate" | "paymentDate" (default receiptDate) }`
  - `vat` orgProcedure: filter `status=paid` + `DocumentType=tax_invoice` + `VATAmount > 0` + date in range, return `{ stats, rows[] }`

### 📐 Filter rules (ตามคำตอบพี่ตอนต้น session)

- `status === "paid"` (ตรงกับ WHT — ใช้ "actual cash-out" view)
- `DocumentType === "tax_invoice"` (ใบเสร็จธรรมดาขอเครดิตภาษีไม่ได้)
- `VATAmount > 0`
- Date filter: ReceiptDate (default — ตามสรรพากร) หรือ PaymentDate (toggle ใน UI)
- Optional project filter

### 🎨 UI

- **Header:** "📈 รายงานภาษีซื้อ (ภ.พ.30)" + scope notice แจ้ง user ว่าแสดงเฉพาะ Input VAT
- **Filters:** DateRangePicker + Project SearchableSelect + DateField dropdown ("วันที่ใบกำกับภาษี" / "วันที่จ่ายเงิน") + clear button
- **Stats (4 cards):** จำนวนใบกำกับ / ฐานภาษีรวม / ภาษีซื้อรวม / ผู้ขาย unique
- **Table columns:** วันที่ / เลขที่ใบกำกับ + เลขที่ใบเสร็จ / เลขผู้เสียภาษี + branch / ผู้ขาย + ที่อยู่ / รายการ + ประเภท (สินค้า/บริการ) / ฐานภาษี / ภาษีซื้อ / โปรเจกต์
- **Export:** CSV/XLSX/PDF (generic landscape) ผ่าน ExportButton
- **❌ ไม่มี PDF form-specific** — รอ spec จากพี่

### 📐 URL params

- `/reports/vat?eventId=<id>&dateField=paymentDate` — query params persist ผ่าน `router.replace`
- `dateField=receiptDate` ไม่เขียนลง URL (default state)

---

## ⚠️ ยังไม่จบ — ต้องทำต่อใน S22

### 🟡 1. Smoke test เต็มรูปแบบของ /reports/vat

**ยังไม่ test:**
- เปิด `/reports/vat` ใน browser — ดูว่า render ครบไม่มี error
- ทดสอบ DateField dropdown สลับ receiptDate ↔ paymentDate
- ทดสอบ Export CSV/XLSX/PDF
- ทดสอบ filter เดือนเดียว vs ข้ามเดือน
- ตรวจ stats ตรงกับยอดจริงใน Sheet

### 🟡 2. WHT Phase 2 polish (ค้างจาก S20)

ใบสรุป ภงด.3/53 (`/documents/pnd3/[period]` + `/documents/pnd53/[period]`) — render OK แต่ยัง **ต้องการ polish CSS** ตามที่พี่ระบุใน screenshot. ยังไม่ได้รับ screenshot ของพี่ใน S21 → เก็บต่อ S22

### 🟡 3. PDF form-specific สำหรับรายงานภาษีซื้อ (Phase 2)

ตอนนี้ใช้ generic landscape PDF table จาก ExportButton. ถ้าพี่อยากได้ฟอร์ม "รายงานภาษีซื้อ" ตามรูปแบบกรมสรรพากร 100% (เหมือน ภงด.3/53) → ส่ง spec PDF มาก่อน → ทำ `/documents/vat-purchase/[period]` ใน S22+ pattern เดียวกับ pnd3-attach

### 🟡 4. ฝั่งภาษีขาย (Output VAT) + ภ.พ.30 ทั้งใบ

ต้องรอ sales/quotation module:
- Sheets tab ใหม่: `Quotations`, `SalesInvoices` (หรือชื่ออื่น)
- procedure `report.vatOutput` สำหรับฝั่งขาย
- procedure `report.vatPP30` รวม input + output → คำนวณภาษีต้องชำระ/ขอคืน
- PDF ภ.พ.30 form-specific

---

## 📦 Working tree (ก่อน commit)

```
A  src/app/(app)/reports/vat/page.tsx
A  src/app/(app)/reports/vat/vat-client.tsx
M  src/server/routers/report.router.ts
A  session21/handoff/HANDOFF_2026-05-02_END_VAT-PURCHASE.md
```

---

## 🚀 Commands พี่ทำก่อนปิด S21

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense

# 1. Type check (ต้องผ่าน 0 errors)
npx tsc --noEmit

# 2. Smoke test (พี่ทำเอง)
npm run dev
# เปิด /reports/vat → ทดสอบ filter + export

# 3. Commit
rm -f .git/index.lock
git add -A
git commit -m 'feat(reports): VAT Phase 1 - รายงานภาษีซื้อ /reports/vat (S21)'

# 4. Push
git push
```

---

## ⚠️ Known Issues / Watch Out (carry-over จาก S20)

1. **🔴 Vercel Pro trial expires ~2026-05-06** — เหลือ ~4 วัน! ไป downgrade Hobby

2. **🟡 Prisma 5.22 → 7.8 update prompt** — **อย่า upgrade** (major jump ข้าม v6, breaking changes). เก็บเป็น tech debt task ใน S25+

3. **🟡 Sidebar label "รายงาน ภพ.30"** — strictly ตอนนี้แสดงแค่ Input VAT เท่านั้น. ถ้าจะ accurate ควร rename เป็น "รายงานภาษีซื้อ (ภ.พ.30)" หรือ "ภพ.30 — ภาษีซื้อ" ใน sidebar (ทำพร้อม S22 ตอนทำ Phase 2 ฝั่งขาย)

4. **🟡 Single-line commit messages** — ห้ามใช้ multi-line `"`

5. **🟡 Cowork sandbox** — ลบ files / push เองไม่ได้ → พี่ทำ Terminal

6. **🟡 git index.lock อาจค้าง** — `rm -f .git/index.lock`

---

## 🔋 Environment State (จบ S21)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Branch:          main (S20 commit b9a3c80 already pushed)
HEAD (local):    S21 changes uncommitted — รอพี่ commit + push
Vercel:          deploy ใหม่ทุกครั้งที่ push (Pro trial ~4 days remaining)
Type check:      ✅ 0 errors
Smoke test:      🟡 ยังไม่ test browser
DB connection:   ✅ Healthy (Supabase Singapore)
```

### Phase status

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 4 Reports WHT — Phase 1 | ✅ 100% | S19 |
| Phase 4 Reports WHT — Phase 2 (PDF 4 forms) | 🟡 95% | S20 — รอ polish ใบสรุป |
| **Phase 4 Reports VAT — Phase 1 (ภาษีซื้อ)** | ✅ 100% | **S21 — สรุปการ implement เสร็จ + smoke test ค้าง** |
| Phase 4 Reports VAT — Phase 2 (ภาษีขาย + ภ.พ.30 ทั้งใบ) | ❌ 0% | รอ quotation/invoice module |
| Phase 4 Reports Inactive Payees + Audit | ❌ 0% | S22+ |
| Phase 4 Dashboard role-specific | ❌ 0% | S24+ |
| Phase 6 Billing | ❌ 0% | หลัง Phase 4 |

---

## 📋 User & Org info (พี่)

```
User:
  id              = 333d8b87-8b59-492f-b684-ee41c57768f8
  email           = dev@aimexpense.com
  lineUserId      = Ua42c7d7729c56f8eab021918c168761c
  lineDisplayName = AoR

Org:
  id   = 32e5a820-ddb1-4850-95f3-b226d4e3a3e2
  name = บริษัท อาร์โต จำกัด
  slug = org-1776216850926
```

---

## 🎯 งาน Session 22 — Priority

### 🚀 ลำดับงาน:

1. **Smoke test /reports/vat** — เปิดในเครื่องพี่ + test filter + export
2. **WHT Phase 2 polish** — รับ screenshot จากพี่ → fix CSS ใบสรุป
3. **Inactive Payees + Audit Logs UI** — admin tools (ถ้า WHT จบ)
4. **Vercel downgrade Hobby** — ก่อน 6 พ.ค.

---

*Handoff by เอม — Session 21 end — 2026-05-02*
