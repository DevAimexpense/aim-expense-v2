# Session 20 → Session 21 — Handoff

> **Created:** 2026-04-26 (end of Session 20)
> **Reason:** WHT Phase 2 (PDF ใบแนบ + ใบสรุป ภงด.3/53) implement เสร็จ + แก้ runtime bugs (DB cache, hydration, tax-id overflow). ยังเหลือ polish ใบสรุปที่พี่ขอ adjust ใน S21
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Type check:** ✅ 0 errors (final state)
> **Smoke test:** 🟡 partial — ใบแนบ ภงด.3 ทำงาน + เลขแก้ไขไม่ล้นช่องแล้ว / ใบแนบ ภงด.53 + ใบสรุปทั้ง 2 ยังไม่ได้ test full

---

## 🔴 อ่านก่อนเริ่มทำงานทุกครั้ง

1. **`SYSTEM_REQUIREMENTS.md`** ← Single Source of Truth
2. **ไฟล์นี้** ← what's next (Session 21)
3. **`session19/handoff/HANDOFF_2026-04-26_END_WHT-PHASE1.md`** ← S19 context

---

## 🎯 ที่ทำใน Session 20

### ✅ 1. WHT Phase 2 — PDF 4 ฟอร์มตามฟอร์มสรรพากร 100%

**สร้างไฟล์ใหม่ 9 ไฟล์ (~2,500 บรรทัด):**

| ไฟล์ | หน้าที่ |
|------|---------|
| `src/lib/wht-form-utils.ts` | Shared utils — period parser, tax-id splitter, formatters, address parser, branch label, vendor type |
| `src/app/documents/pnd3-attach/[period]/page.tsx` | Server entry — ใบแนบ ภงด.3 |
| `src/app/documents/pnd3-attach/[period]/document.tsx` | Client doc — A4 landscape, 6/sheet, multi-page |
| `src/app/documents/pnd53-attach/[period]/page.tsx` | Server entry — ใบแนบ ภงด.53 |
| `src/app/documents/pnd53-attach/[period]/document.tsx` | Client doc — เหมือน ภงด.3 + ชื่อ/ที่อยู่รวมกล่องเดียว + เงื่อนไข 2 options |
| `src/app/documents/pnd3/[period]/page.tsx` | Server entry — ใบสรุป ภงด.3 |
| `src/app/documents/pnd3/[period]/document.tsx` | Client doc — A4 portrait, 1 หน้า |
| `src/app/documents/pnd53/[period]/page.tsx` | Server entry — ใบสรุป ภงด.53 |
| `src/app/documents/pnd53/[period]/document.tsx` | Client doc — A4 portrait + กฎหมายต่างจาก ภงด.3 (3 เตรส + 69 ทวิ + 65 จัตวา) |

**ไฟล์แก้ไข:**
- `src/app/(app)/reports/wht/wht-client.tsx` — แทนที่ "S20 deliverable" banner → 2 ปุ่ม "📄 PDF ใบแนบ" + "📋 PDF ใบสรุป" (active เมื่อ filter เดือนเดียว)

### 🔧 2. Bug fixes (3 รอบหลัง initial implement)

#### Bug 1: DB Connection Error (false alarm — Prisma cache stale)
- Error: "Can't reach database server at aws-1-ap-southeast-1.pooler.supabase.com"
- Root cause: Prisma Client cache ค้างจาก older schema
- Fix: `npx prisma generate` + `rm -rf .next` + restart dev server

#### Bug 2: React Hydration Error (3 layers fix)
- Error: "Text content does not match server-rendered HTML"
- Root causes (compound):
  1. **`@import url(Sarabun)` ใน `<style>` block** — CSS load timing ต่างกัน server/client
  2. **`Intl.NumberFormat("th-TH")`** — Node.js (full-icu) อาจ insert hidden Unicode chars (LRM/RLM) ต่างจาก browser
  3. **`<style>` plain tag** — content whitespace mismatch ระหว่าง SSR/CSR
- Fixes:
  1. ลบ `@import url()` ออก — ใช้ font จาก root layout (`IBM Plex Sans Thai`)
  2. แทนที่ `Intl.NumberFormat` → pure JS regex format (`formatMoney`/`formatMoneyAlways` ใน `wht-form-utils.ts`)
  3. เปลี่ยน `<style>` → `<style jsx global>` (Next.js styled-jsx — handle hydration เอง — pattern เดียวกับ wht-cert)

#### Bug 3: เลขผู้เสียภาษีในใบแนบล้นช่อง
- Symptom: กล่อง box 13 หลักใน row table เล็กเกินไป → ตัวเลขล้นไปทับ column ชื่อ-ที่อยู่
- Fix:
  - **Row-level**: ใช้ text format inline (`0-1055-46106-46-7`) — font monospace
  - **Header-level (บริษัทเรา)**: คง box format ตามฟอร์มราชการ (กล่องใหญ่ ไม่ล้นช่อง)
- ใช้ `formatTaxIdText()` helper (defined ในแต่ละ document.tsx)

### 📐 URL Pattern + Period

period = `YYYY-MM` (เช่น `2026-04`)

| Route | Use case |
|-------|----------|
| `/documents/pnd3-attach/2026-04` | ใบแนบ ภงด.3 (รายการ 6/แผ่น, multi-page) |
| `/documents/pnd53-attach/2026-04` | ใบแนบ ภงด.53 |
| `/documents/pnd3/2026-04` | ใบสรุป ภงด.3 (1 หน้า portrait) |
| `/documents/pnd53/2026-04` | ใบสรุป ภงด.53 |

### 🎨 Design decisions

1. **Org metadata: ใช้ Prisma `Organization` model** (เดิมมี `taxId`, `branchType`, `branchNumber`, `address`) — ไม่ต้องเพิ่ม Sheets `Config` tab. ผ่าน SYSTEM_REQUIREMENTS principle 2 ✅
2. **Signer: ปล่อยว่างให้เซ็นด้วยปากกา** — เหมือน wht-cert. ไม่ต้องเก็บ signerName/title
3. **Address: best-effort regex parse** — ดึง ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ออก, fallback raw string
4. **PDF generation: window.print() vector PDF** — ไม่ใช้ html2canvas raster (เพราะ raster blur ตอนพิมพ์)
5. **Font: IBM Plex Sans Thai** (จาก root layout) — Sarabun เป็น fallback

---

## ⚠️ ยังไม่จบใน S20 — ต้องทำต่อใน S21

### 🟡 1. ใบสรุป ภงด.3 + 53 — "ยังไม่สมบูรณ์ ต้องปรับนิดหน่อย"
**สถานะ:** พี่บอกว่า render ไม่ error แล้ว แต่ยังต้อง polish (ยังไม่ระบุ detail ตอนปิด S20 — context เต็ม)

**ต้องการใน S21:**
- พี่ส่ง screenshot + บอกว่า issue คืออะไร (CSS spacing? alignment? typography? layout?)
- เปรียบเทียบกับ spec PDF (`ภงด.3.pdf`, `ภงด.53.pdf`)
- Fix CSS ใน `pnd3/[period]/document.tsx` + `pnd53/[period]/document.tsx`

### 🟡 2. Smoke test เต็มรูปแบบ
**ยังไม่ test:**
- ใบแนบ ภงด.53 — fix เลขล้นช่องเดียวกันแต่ยังไม่ confirm
- ใบสรุป ภงด.3 — render OK แต่ layout ต้อง verify
- ใบสรุป ภงด.53 — render OK แต่ layout ต้อง verify

**Test checklist:**
1. เปิดทั้ง 4 routes — ดูว่า render ครบไม่มี hydration error
2. ตรวจ tax id row-level ไม่ล้นช่อง (pnd53-attach)
3. ตรวจฟอนต์ + เลข + Thai date format ตรงกับ spec
4. กดปุ่ม "🖨️ พิมพ์/บันทึกเป็น PDF" — preview ตรวจ A4 layout

### 🟡 3. Address parsing improvement (optional)
- Prisma `address` เป็น string เดียว → `parseAddressFields()` regex ดึงได้แค่ ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์
- ใบสรุป fields "อาคาร/ห้อง/ชั้น/หมู่บ้าน/เลขที่/หมู่ที่/แยก/ถนน" ขึ้นว่างเป็นส่วนใหญ่
- **TODO S22+:** เพิ่ม UI `/settings/org` แยก fields ให้ user กรอก

---

## 📦 Working tree (ก่อน commit)

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

## 🚀 Commands พี่ทำก่อนปิด S20

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense

# 1. Type check (ต้องผ่าน 0 errors)
npx tsc --noEmit

# 2. Commit
rm -f .git/index.lock
git add -A
git commit -m 'feat(reports): WHT Phase 2 - PDF ใบแนบ+ใบสรุป ภงด.3/53 + fix hydration & tax-id overflow (S20)'

# 3. Push
git push
```

---

## ⚠️ Known Issues / Watch Out

1. **🔴 Vercel Pro trial expires ~2026-05-06** — เหลือ ~10 วัน! ไป downgrade Hobby

2. **🟡 Prisma 5.22 → 7.8 update prompt** — **อย่า upgrade ตอนนี้** (major jump ข้าม v6, breaking changes เยอะ). เก็บเป็น tech debt task ใน S25+

3. **🟡 Address parsing แม่นยำกลาง** — regex best-effort, fields อาจว่าง ใน PDF — ต้อง /settings/org UI เพิ่ม

4. **🟡 Signer + ตำแหน่ง + ยื่นวันที่ = ปล่อยว่าง** ให้เซ็นปากกา (เหมือน wht-cert)

5. **🟡 PDF download = browser print dialog** — ไม่มี auto-save to Drive

6. **🟡 Vendor type detection = TaxID prefix** — edge cases: TaxID ผิด format → fall back ภงด.3

7. **🟡 Condition (เงื่อนไขการหักภาษี) hardcoded = 1** — ระบบยังไม่ capture 2/3 — TODO S22+ เพิ่ม dropdown

8. **🟡 ฟอนต์ IBM Plex Sans Thai โหลดจาก Google CDN** — offline fallback system font

9. **🟡 git index.lock อาจค้าง** — `rm -f .git/index.lock`

10. **🟡 Cowork sandbox** — ลบ files / push เองไม่ได้ → พี่ทำ Terminal

11. **🟡 Single-line commit messages** — ห้ามใช้ multi-line `"`

---

## 🔋 Environment State (จบ S20)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Branch:          main
HEAD (local):    ก่อน commit S20 — รอพี่ commit + push
Vercel:          deploy ใหม่ทุกครั้งที่ push
Type check:      ✅ 0 errors
Smoke test:      🟡 ใบแนบ ภงด.3 OK / อื่นๆ รอ test
DB connection:   ✅ Healthy (Supabase Singapore)
```

### Phase status

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 4 Reports WHT — Phase 1 | ✅ 100% | S19 |
| **Phase 4 Reports WHT — Phase 2 (PDF 4 forms)** | 🟡 95% | **S20 — รอ polish ใบสรุป + smoke test full ใน S21** |
| Phase 4 Reports VAT (ภพ.30) | ❌ 0% | S22+ — sidebar dead link |
| Phase 4 Reports Inactive Payees + Audit | ❌ 0% | S23+ |
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

## 🎯 งาน Session 21 — Priority

### 🚀 ลำดับงาน:

1. **Polish ใบสรุป ภงด.3 + 53** (ต่อจาก S20) — พี่ส่ง screenshot + ระบุ issue → fix CSS
2. **Smoke test เต็มรูปแบบ** — ทดสอบ 4 PDFs ครบ (open, layout check, print preview)
3. **VAT report (ภพ.30)** — ถ้า WHT จบสมบูรณ์ — sidebar dead link เก่า
4. **Inactive Payees + Audit Logs UI** — admin tools (ปานกลาง)

---

*Handoff by เอม — Session 20 end — 2026-04-26*
