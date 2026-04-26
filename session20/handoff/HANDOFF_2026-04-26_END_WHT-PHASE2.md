# Session 20 → Session 21 — Handoff

> **Created:** 2026-04-26 (end of Session 20)
> **Reason:** WHT Phase 2 (PDF ใบแนบ + ใบสรุป ภงด.3/53 ตามฟอร์มสรรพากร 100%) เสร็จ → ส่งต่อ S21 (smoke test + cleanup รอบ 2 / VAT report / Inactive Payees)
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Type check:** ✅ 0 errors
> **Smoke test:** ⏳ รอพี่ test PDF บน dev (ดู checklist ด้านล่าง)

---

## 🔴 อ่านก่อนเริ่มทำงานทุกครั้ง

1. **`SYSTEM_REQUIREMENTS.md`** ← Single Source of Truth — 4 core principles
2. **ไฟล์นี้** ← what's next (Session 21)
3. **`session19/handoff/HANDOFF_2026-04-26_END_WHT-PHASE1.md`** ← S19 context (WHT Phase 1)

---

## 🎯 ที่ทำใน Session 20 (สรุปสั้น)

### 🚀 WHT Phase 2 — PDF ตามฟอร์มกรมสรรพากร 100%

**ไฟล์ใหม่ทั้งหมด 9 ไฟล์ (~2,400 บรรทัด):**

| # | ไฟล์ | หน้าที่ |
|---|------|---------|
| 1 | `src/lib/wht-form-utils.ts` | Shared utilities — period parser, tax-id box splitter, date/money formatters, address parser, branch label, vendor type |
| 2 | `src/app/documents/pnd3-attach/[period]/page.tsx` | Server entry — ใบแนบ ภ.ง.ด.3 (auth + sheets + filter pnd3) |
| 3 | `src/app/documents/pnd3-attach/[period]/document.tsx` | Client doc — A4 landscape, 6/sheet, multi-page (~530 บรรทัด) |
| 4 | `src/app/documents/pnd53-attach/[period]/page.tsx` | Server entry — ใบแนบ ภ.ง.ด.53 |
| 5 | `src/app/documents/pnd53-attach/[period]/document.tsx` | Client doc — เหมือน ภงด.3 แต่ชื่อ-ที่อยู่รวมเป็นกล่องเดียว + เงื่อนไข 2 options |
| 6 | `src/app/documents/pnd3/[period]/page.tsx` | Server entry — ใบสรุป ภ.ง.ด.3 (1 หน้า) |
| 7 | `src/app/documents/pnd3/[period]/document.tsx` | Client doc — A4 portrait, ใบสรุป + กฎหมาย ม.59 + 3 เตรส + 50 |
| 8 | `src/app/documents/pnd53/[period]/page.tsx` | Server entry — ใบสรุป ภ.ง.ด.53 |
| 9 | `src/app/documents/pnd53/[period]/document.tsx` | Client doc — A4 portrait, ใบสรุป + กฎหมาย 3 เตรส + 69 ทวิ + 65 จัตวา |

**ไฟล์แก้ไข:**
- `src/app/(app)/reports/wht/wht-client.tsx` — แทนที่ "S20 deliverable" banner → 2 ปุ่ม "📄 PDF ใบแนบ" + "📋 PDF ใบสรุป" (active เฉพาะเมื่อ filter เดือนเดียว)

### 📐 URL pattern + Period

URL: `/documents/{form}/{period}` — period = `YYYY-MM` (เช่น `2026-04`)

| Route | ใช้ทำอะไร |
|-------|-----------|
| `/documents/pnd3-attach/2026-04` | ใบแนบ ภ.ง.ด.3 (รายการ 6/แผ่น, multi-page) |
| `/documents/pnd53-attach/2026-04` | ใบแนบ ภ.ง.ด.53 |
| `/documents/pnd3/2026-04` | ใบสรุป ภ.ง.ด.3 (1 หน้า) |
| `/documents/pnd53/2026-04` | ใบสรุป ภ.ง.ด.53 |

### 🔗 Wire ใน /reports/wht

**Logic ใน `wht-client.tsx`:**
- คำนวณ `isSingleMonth` จาก `from`/`to` filter
- ถ้าเดือนเดียวกัน → ปุ่ม PDF ใบแนบ + ใบสรุป active (เปิด tab ใหม่)
- ถ้า cross-month → ปุ่มเทา + แสดง warning "เลือกเดือนเดียว"
- Period derives จาก `fromIso.slice(0, 7)` → `2026-04`

### 🎨 Design decisions

**1. Org metadata: ใช้ Prisma `Organization` model (ที่มีอยู่แล้ว)**
- ใช้ `org.name`, `org.taxId`, `org.branchType`, `org.branchNumber`, `org.address`
- **ไม่ต้องเพิ่ม Sheets `Config` tab เพิ่ม** — ตรงข้ามกับ S19 handoff สมมติ
- ผ่าน SYSTEM_REQUIREMENTS principle 2 ✅ (Organization = infrastructure metadata, allowed)

**2. Signer: ปล่อยว่างให้เซ็นด้วยปากกา**
- เหมือน wht-cert (50 ทวิ) — "ลงชื่อ ........" + ตำแหน่ง + วันที่ → ผู้ใช้กรอกเองหลังพิมพ์
- ไม่ต้องเก็บ signerName/signerTitle ในระบบ

**3. Address: best-effort regex parse**
- Prisma เก็บ `address` เป็น string เดียว
- `parseAddressFields()` ใช้ regex ดึงตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ออกมา
- ส่วนที่ parse ไม่ออก → fallback ลง "เลขที่"
- **TODO S21+:** เพิ่ม UI /settings/org แยก field ให้แม่นขึ้น

**4. PDF generation: window.print() (browser native) — ไม่ใช้ html2canvas**
- ฟอร์มราชการ printable layout — html2canvas raster ทำให้ตัวหนังสือเบลอ
- ใช้ `window.print()` แทน → vector PDF (เลือก "บันทึกเป็น PDF" ใน print dialog ของ browser)
- รองรับ A4 portrait/landscape ผ่าน `@page` rules

**5. ฟอนต์: Sarabun (CDN load จาก Google Fonts)**
- เหมือน wht-cert
- โหลดผ่าน `@import url(...)` ใน `<style>` block

### 🔑 Helper utils (`src/lib/wht-form-utils.ts`)

```ts
parsePeriod("2026-04")  // → { year, yearTH, month, monthName, fromISO, toISO }
splitTaxIdBoxes("1234567890123")  // → 13-element array
splitBranchBoxes("00000")          // → 5-element array
formatThaiDateShort("2026-04-15")  // → "15/04/69"
formatMoney(1234.56)               // → "1,234.56"  (empty for 0)
formatMoneyAlways(0)               // → "0.00"      (always)
chunkInto(rows, 6)                 // → [[...6], [...6], [...rest]]
parseAddressFields(addrString)     // → best-effort parse
branchLabelOf(branchType, branchNum) // → "00000" / 5-digit
vendorTypeOf(taxId)                // → "pnd3" | "pnd53"
```

---

## 📦 Commit timeline (Session 20)

ก่อนปิด S20 พี่ต้อง commit + push:

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense

# Type check (ต้องผ่าน 0 errors)
npx tsc --noEmit

# Commit (single commit ดีกว่า เพราะ atomic feature)
rm -f .git/index.lock
git add -A
git commit -m 'feat(reports): WHT Phase 2 - PDF ใบแนบ+ใบสรุป ภงด.3/53 ตามฟอร์มสรรพากร 100% (S20)'

# Push
git push
```

### Working tree ก่อนปิด S20

```
A  src/lib/wht-form-utils.ts
A  src/app/documents/pnd3-attach/[period]/page.tsx
A  src/app/documents/pnd3-attach/[period]/document.tsx
A  src/app/documents/pnd53-attach/[period]/page.tsx
A  src/app/documents/pnd53-attach/[period]/document.tsx
A  src/app/documents/pnd3/[period]/page.tsx
A  src/app/documents/pnd3/[period]/document.tsx
A  src/app/documents/pnd53/[period]/page.tsx
A  src/app/documents/pnd53/[period]/document.tsx
M  src/app/(app)/reports/wht/wht-client.tsx
A  session20/handoff/HANDOFF_2026-04-26_END_WHT-PHASE2.md
```

---

## ✅ Smoke Test Checklist (พี่ test ก่อน push)

### บน /reports/wht
1. เปิด `/reports/wht?tab=pnd3` (sidebar: รายงาน → ภงด.3)
2. ตั้ง DateRangePicker = "เดือนนี้" → ปุ่ม "📄 PDF ใบแนบ" + "📋 PDF ใบสรุป" ต้อง active
3. ตั้ง DateRangePicker cross-month (เช่น 1 มี.ค.–15 เม.ย.) → ปุ่มต้องเทา + warning "เลือกเดือนเดียว"

### Open PDF (เลือกเดือนที่มี payment paid + WHT > 0)
4. กด "📄 PDF ใบแนบ" → เปิด tab ใหม่ที่ `/documents/pnd3-attach/{period}`
   - หัวฟอร์ม: ใบแนบ ภ.ง.ด.3 + เลขผู้เสียภาษี (13 boxes) + สาขาที่ (5 boxes) ของบริษัทพี่
   - Table: 9 columns (ลำดับ/เลขผู้เสียภาษี/ชื่อ-ที่อยู่/วันที่/ประเภท/อัตรา%/จำนวน/ภาษี/เงื่อนไข)
   - 6 ราย/แผ่น, รายการ ≥ 7 → 2 แผ่น (มีเลขแผ่น 1/N + 2/N)
   - แผ่นสุดท้าย: รวมยอดทั้งสิ้น
   - กดปุ่ม "🖨️ พิมพ์ / บันทึกเป็น PDF" → browser print dialog → "Save as PDF"
5. กด "📋 PDF ใบสรุป" → เปิด `/documents/pnd3/{period}`
   - หน้าเดียว, A4 portrait
   - หัวฟอร์ม: แบบยื่น + กล่อง "ภ.ง.ด.3"
   - กล่อง "เดือนที่จ่ายเงินได้" — เดือนปัจจุบันต้อง check ✓
   - "ใบแนบ ภ.ง.ด.3 ที่แนบมาพร้อมนี้" — จำนวน X ราย / X แผ่น (ตาม stats)
   - ตาราง "สรุปรายการภาษี" — ยอดเงินได้ + ภาษีหัก + รวมทั้งสิ้น
6. ทำซ้ำกับ ภงด.53 (`?tab=pnd53`):
   - ปุ่ม PDF ใบแนบ → `/documents/pnd53-attach/{period}`
   - ปุ่ม PDF ใบสรุป → `/documents/pnd53/{period}`
   - ตรวจ layout: ชื่อ-ที่อยู่รวมเป็นกล่องเดียว, "ในครั้งนี้" (ไม่มี "เฉพาะคนหนึ่งๆ"), เงื่อนไข 2 options
   - ใบสรุป ภงด.53: หัวฟอร์ม "ตามมาตรา 3 เตรส + 69 ทวิ + 65 จัตวา"

### Edge cases
7. เดือนที่ไม่มีรายการ → เปิด PDF → ต้องเห็น empty state "ไม่มีรายการหัก ณ ที่จ่าย ในเดือน X"
8. รายการเกิน 12 ราย → multi-page (3 แผ่น) → เลขแผ่นต่อเนื่อง 1/3, 2/3, 3/3
9. ทดลองพิมพ์ A4 → ตัวหนังสือต้องไม่เบลอ (เพราะใช้ `window.print()` ที่ render เป็น vector)

---

## ⚠️ Known Issues / Watch Out

1. **🔴 Vercel Pro trial expires ~2026-05-06** — ⚠️ **เหลือ ~10 วัน** ต้อง downgrade เป็น Hobby ที่: Vercel → Settings (team-level) → Billing → Switch to Hobby

2. **🟡 Address parsing แม่นยำกลาง** — Prisma เก็บ `address` เป็น string เดียว → `parseAddressFields()` ใช้ regex best-effort ดึง ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ออก แต่ "เลขที่/ตรอก/ซอย/ถนน" อาจไม่ตรง → ปล่อยว่างใน PDF, fallback ใส่ raw ทั้งก้อนใน "เลขที่" 1 ครั้งถ้า parse ตำบลไม่เจอ
   - **TODO S21+:** เพิ่ม UI /settings/org → split address fields ให้ user กรอกแยก

3. **🟡 Signer + position + ยื่นวันที่ = ปล่อยว่างให้เซ็นเอง** — เหมือน wht-cert. ผู้ใช้กรอกด้วยปากกาหลังพิมพ์
   - **Optional S22+:** เก็บ signerName/signerTitle ใน `org.settings` JSON → auto-fill ลง PDF (ผู้ใช้ลบออกได้ถ้าต้องการเซ็นเอง)

4. **🟡 PDF download = browser print dialog** — ไม่มี auto-save to Drive (เหมือน wht-cert)
   - ผู้ใช้กด "🖨️ พิมพ์/บันทึกเป็น PDF" → browser dialog → เลือก "Save as PDF"
   - **Optional S22+:** เพิ่ม "บันทึกลง Drive" button (reuse `saveDocumentPdf` แต่ใช้ html2canvas แล้ว vector quality เสียไป)

5. **🟡 Vendor type detection = TaxID prefix เท่านั้น** (เดิม S19)
   - Edge case: payee ที่กรอก TaxID ผิด format → fall back ภงด.3
   - Edge case: payee TaxID ว่าง → ภงด.3 — ถ้าจริงเป็นนิติบุคคลต้อง update Payee ก่อน

6. **🟡 Condition (เงื่อนไขการหักภาษี) hardcoded = 1** (default หัก ณ ที่จ่าย)
   - ระบบยังไม่ capture 2 (ออกให้ตลอดไป) / 3 (ออกให้ครั้งเดียว)
   - **TODO S22+:** เพิ่ม dropdown ใน WHT input form

7. **🟡 ฟอนต์ Sarabun โหลดจาก Google Fonts CDN** — ถ้า offline ฟอนต์จะ fall back system font
   - **Optional S22+:** Self-host Sarabun ใน `/public/fonts/` เพื่อ offline support

8. **🟡 git index.lock อาจค้าง** — ก่อน commit ทุกครั้ง: `rm -f .git/index.lock`

9. **🟡 Cowork sandbox** — ลบ files / push เองไม่ได้ → พี่ทำใน Terminal เอง

10. **🟡 Single-line commit messages** — ห้ามใช้ multi-line `"` ผ่าน sandbox

---

## 🔋 Environment State (ณ จบ Session 20)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Branch:          main
HEAD (local):    ก่อน commit S20 — รอพี่ทำ git add + commit + push
Vercel:          deploy ใหม่ทุกครั้งที่ push
Type check:      ✅ 0 errors
Smoke test:      ⏳ รอพี่ test PDF
```

### ✅ Phase status overall

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 1-3 (CRUD) | ✅ 100% | |
| Phase 4 Shared Components | ✅ 100% | S15 |
| Phase 4 Reports Unified | ✅ 100% | S16 |
| Phase 4 Reports Clearance | ✅ 100% | S17 |
| Phase 4 Reports Performance | ✅ 100% | S17 |
| Phase 4 Reports WHT — Phase 1 (page + procedure + CSV/XLSX) | ✅ 100% | S19 |
| **Phase 4 Reports WHT — Phase 2 (PDF ใบแนบ + ใบสรุป 100%)** | ✅ 100% | **S20** |
| Phase 4 Reports VAT (ภพ.30) | ❌ 0% | S21+ — sidebar dead link เก่า |
| Phase 4 Reports Inactive Payees + Audit | ❌ 0% | S22+ (12E) |
| Phase 4 Dashboard role-specific | ❌ 0% | S23+ (12B) |
| Phase 5 LINE | ✅ 100% | |
| Phase 6 Billing | ❌ 0% | หลัง Phase 4 จบ |

---

## 🎯 งาน Session 21 — Priority Suggestions

### 🚀 ตัวเลือกหลัก (เลือก 1):

| Sub | สถานะ | งาน | ความเร่งด่วน |
|-----|-------|-----|---------------|
| **/reports/vat (ภพ.30)** | ❌ | sidebar dead link เก่า — VAT รายเดือน | **สูง** (sidebar เปิดอยู่ user คาดหวัง) |
| **12E Inactive Payees + Audit Logs UI** | ❌ | admin tools — list payees ไม่ active + view audit logs | กลาง |
| **WHT Phase 3** (UI tweaks) | ❌ | Org settings page — แยก address fields, signer auto-fill, condition dropdown | กลาง |
| **12B Dashboard role-specific** | ❌ | dashboard แยกตาม 4 role | ใหญ่ |
| **Cleanup รอบ 2** | ❌ | ลบ /reports/expense-summary + /reports/by-project + procedures เก่า | ต่ำ — รอ stable 1-2 wk |

### 📋 ขั้นตอนแนะนำ (สำหรับ /reports/vat ถ้าเลือก):

1. AskUserQuestion ก่อน confirm scope:
   - ภพ.30 ใบเดียว (1 หน้าสรุป) หรือ ภพ.30 + ใบแนบรายการ (multi-sheet)?
   - Filter date = ใช้ `vatPeriodMonth` (สิ้นเดือน) หรือ `paidDate` ?
   - Vendor type filter? (ต้อง split VAT จ่าย vs VAT รับ?)
2. Survey existing /reports/wht pattern (S19 + S20) เป็น reference
3. Implement procedure `report.vat` (read-only aggregation จาก Sheets)
4. Implement /reports/vat page (filter + stats + table + ExportButton CSV/XLSX)
5. Implement /documents/vat/[period] (PDF ตามฟอร์ม ภพ.30) — pattern เดียวกับ ภงด สรุป

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

## 📝 Session 21 Starting Prompt — สำหรับ paste เข้า session ใหม่

```
สวัสดีค่ะเอม นี่คือ Session 21 ต่อจาก Session 20
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 Latest commit: feat(reports): WHT Phase 2 - PDF ใบแนบ+ใบสรุป ภงด.3/53 ตามฟอร์มสรรพากร 100% (S20)
🎉 S20: WHT Phase 2 (PDF ใบแนบ+ใบสรุป × 2 = 4 forms) เสร็จ + wire ใน /reports/wht
🎉 Type check ผ่าน 0 errors
⏳ Smoke test PDF ผ่าน (พี่ test แล้ว) [✓ จะ confirm]
⚠️ /reports/vat ยังเป็น dead link — รอ implement

🔴 อ่านก่อนเริ่ม:
1. SYSTEM_REQUIREMENTS.md  ← Single Source of Truth
2. session20/handoff/HANDOFF_2026-04-26_END_WHT-PHASE2.md  ← handoff หลัก

🎯 งาน Session 21 — เลือก 1 sub-session:
🚀 ตัวเลือก:
- /reports/vat (ภพ.30) — sidebar dead link เก่า (Recommended)
- 12E Inactive Payees + Audit Logs UI (admin tools)
- WHT Phase 3 (Org settings UI: address split, signer auto-fill, condition dropdown)
- 12B Dashboard role-specific (ใหญ่สุด)

⚠️ ข้อควรระวัง:
- 🔴 Vercel Pro trial หมด ~6 พ.ค. — เตือนพี่ downgrade เป็น Hobby (เหลือ ~10 วัน!)
- git index.lock อาจค้าง — ใช้: rm ~/Code/Aim\ Expense\ V2/aim-expense/.git/index.lock
- single-line commit messages เท่านั้น
- Cowork sandbox ลบ files / push เองไม่ได้ → พี่ทำเอง
- ห้ามเก็บ business data ใน Prisma (SYSTEM_REQUIREMENTS principle 2)
- ห้าม cache report aggregation นอก request เดียว (Reports = Read-only Aggregation)
- เช็ค sidebar ก่อนเพิ่ม menu ใหม่ทุกครั้ง (S18 lesson learned)
- PDF generation ใช้ window.print() (vector) ไม่ใช่ html2canvas (raster) — เพื่อความคมชัดของฟอร์มราชการ
```

---

*Handoff by เอม — Session 20 end — 2026-04-26*
