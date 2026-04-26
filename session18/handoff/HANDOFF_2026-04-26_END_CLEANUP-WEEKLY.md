# Session 18 → Session 19 — Handoff

> **Created:** 2026-04-26 (end of Session 18)
> **Reason:** Cleanup + 12C Weekly Payment + Sidebar restructure (Section รายจ่าย + รายงาน) เสร็จ + type check ผ่าน + smoke test ผ่าน → ปิด session
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Type check:** ✅ 0 errors
> **Smoke test:** ✅ พี่ test ผ่าน 26 เม.ย. (sidebar restructure + 12C + cleanup ทั้งหมด)
> **Working tree:** ✅ clean (ทุกอย่าง pushed แล้ว)
> **Commits ใน S18:**
>   - `117fede` — perf(reports): combined query + defensive fallback + skip ensureAllTabsExist (S17 ที่ค้าง — push ต้น S18) ✅
>   - `c79f254` — chore(cleanup): remove dead files webhook/line + pdf-to-png-server + wth-cert (stale 6 sessions, S18) ✅
>   - `e9ba6e8` — feat(reports): /reports/weekly-payment + Bank CSV export (12C, S18) ✅
>   - `039e423` — chore(sidebar): restructure to Section รายจ่าย + ภงด.3/53 + remove duplicate weekly-payment menu (S18) ✅
>
> **🔴 IMPORTANT — Sidebar restructure ใน S18 รอบ 2:**
> หลัง commit `e9ba6e8` พี่ point ออกว่า "ชำระรายสัปดาห์" ที่เพิ่งเพิ่มใน sidebar **ซ้ำซ้อนกับ `/payment-prep` เดิม** (ซึ่งเป็น workflow page ที่ครบกว่ามาก: per-bank tabs + Mark paid batch + Excel export). เอม:
> - ลบเมนู "ชำระรายสัปดาห์" ออกจาก sidebar
> - **เก็บไฟล์ /reports/weekly-payment + bank-csv.ts ไว้** เป็น orphan code (สามารถใช้เป็น report view-only ในอนาคต — ไม่มี sidebar link แต่ accessible ผ่าน URL)
> - Restructure sidebar ใหม่ (รายละเอียดด้านล่าง)

---

## 🔴 อ่านก่อนเริ่มทำงานทุกครั้ง

1. **`SYSTEM_REQUIREMENTS.md`** ← Single Source of Truth — 4 core principles
2. **ไฟล์นี้** ← what's next (Session 19)
3. **`session17/handoff/HANDOFF_2026-04-26_END_PERF-OPT.md`** ← S17 context (perf optimization, drill-down, clearance)
4. **`session16/handoff/HANDOFF_2026-04-26_END_REPORTS-DONE.md`** ← S16 context (Reports unified)
5. **`HANDOFF.md`** ← overall project context (ถ้าจำเป็น)

---

## 🎯 ที่ทำใน Session 18 (สรุปสั้น)

### 1️⃣ Cleanup — ลบไฟล์ค้าง 6 sessions (Sub-session ที่พี่เลือกผ่าน AskUserQuestion)

**ปัญหา:** 3 paths ตกค้างมาตั้งแต่ Session 11+12+14 — แสดงใน HANDOFF ทุกครั้งแต่ยังไม่ได้ลบเพราะ Cowork sandbox ลบ files บน mount ไม่ได้

**Fix:** พี่ลบเองใน Terminal:
- `src/lib/ocr/pdf-to-png-server.ts` (-64 บรรทัด) — server-side PDF→PNG ที่ไม่ใช้แล้ว
- `src/app/api/webhook/line/` (-124 บรรทัด) — old LINE webhook (ปัจจุบันใช้ `/api/line/webhook`)
- `src/app/documents/wth-cert/` (-910 บรรทัด รวม 2 ไฟล์) — typo folder (t-h ผิด, ที่ถูก = `wht-cert` h-t)

**ผลรวม:** 4 files changed, 1,098 deletions(-)

**Commit:** `chore(cleanup): remove dead files webhook/line + pdf-to-png-server + wth-cert (stale 6 sessions, S18)` ✅ pushed

### 2️⃣ 12C — Weekly Payment + Bank CSV (Phase 4 sub-session)

**Spec ที่พี่ confirm ผ่าน AskUserQuestion:**
- Date filter: **toggle 2 มุมมอง** (DueDate "ตามกำหนดจ่าย" + PaymentDate "ตามวันที่จ่ายจริง")
- Status filter: **approved only** (paid จะแสดงเฉพาะ mode "paid" สำหรับ audit)
- Week boundary: **จันทร์-อาทิตย์** (ISO 8601 — ไทยนิยม)
- Bank CSV: **generic format** ก่อน (รอพี่ส่ง spec จริงของ KBank/SCB)

**Backend — `report.weeklyPayment` procedure:**
- Read-only aggregation จาก Sheets (ตาม SYSTEM_REQUIREMENTS principle 3)
- Skip `ensureAllTabsExist` (ตาม pattern S17)
- Parallel pull: `getPayments()` + `getEvents()` + `getPayees()`
- Filter: status === approved (mode=due) หรือ approved + paid (mode=paid)
- Date filter ตาม mode: DueDate vs PaymentDate
- Group by ISO week — `isoWeekStart()` helper คำนวณ Monday จาก YYYY-MM-DD
- Returns: `{ stats: { totalCount, totalAmount, weekCount, payeeCount }, weeks: [...], rows: [...] }`

**Frontend — `/reports/weekly-payment`:**
- Server entry: `page.tsx` (auth + org context)
- Client: `weekly-payment-client.tsx` (~515 บรรทัด)
- Layout:
  - Mode toggle (segmented tabs): "ตามกำหนดจ่าย" | "ตามวันที่จ่ายจริง"
  - Filters: DateRangePicker + Project SearchableSelect
  - 4 StatCards: รายการทั้งหมด / ยอดรวม / จำนวนสัปดาห์ / ผู้รับเงิน (unique)
  - Action row: Bank CSV button + ExportButton (CSV/XLSX/PDF)
  - Per-week sections (collapsible card style) — แต่ละ section มี header (week label + subtotal) + DataTable ของรายการในสัปดาห์นั้น
- URL sync: `?mode=due|paid` + `?eventId=...`

**Bank CSV Helper — `src/lib/utils/bank-csv.ts`:**
- Generic format (7 columns): Bank Name / Account Number / Account Name / Amount / Reference / Description / Tax ID
- UTF-8 with BOM (Excel + bank portals open Thai correctly)
- RFC 4180 escaping (handle `,` `"` newlines)
- Skip rows ที่ไม่มี bank info (warn user ก่อน download)
- Filename: `bank-batch-YYYY-MM-DD_to_YYYY-MM-DD.csv`

**Sidebar:** เพิ่ม nav item "ชำระรายสัปดาห์" → `/reports/weekly-payment` (icon 💰, permission `viewReports`)

### 3️⃣ Sidebar Restructure (รอบ 2 — หลัง 12C commit) — พี่ขอแก้

**Section "รายจ่าย" (เปลี่ยนชื่อจาก "ค่าใช้จ่าย"):**
1. ตั้งเบิก → /payments
2. บันทึกค่าใช้จ่าย → /expenses
3. อนุมัติรายการ → /approvals
4. **เตรียมการจ่าย** → /payment-prep (เปลี่ยน label จาก "การเตรียมจ่าย")
5. **เคลียร์งบ** → /reports/clearance ✨ (ย้ายมาจาก Section "รายงาน")
6. เอกสาร / ใบเสร็จ → /documents

**Section "รายงาน":**
1. ภาพรวมรายจ่าย → /reports
2. **รายงาน ภพ.30** → /reports/vat (เดิม "รายงานภาษี (ภ.พ.30)" — เปลี่ยน label)
3. **รายงาน ภงด.3** ✨ → /reports/wht?tab=pnd3 (NEW dead link — รอ S19+ implement)
4. **รายงาน ภงด.53** ✨ → /reports/wht?tab=pnd53 (NEW dead link — รอ S19+ implement)
- ~~เคลียร์งบ~~ → ย้ายไป Section "รายจ่าย"
- ~~ชำระรายสัปดาห์~~ → ลบ (ซ้ำซ้อนกับ /payment-prep)
- ~~รายงานหัก ณ ที่จ่าย~~ → ลบ (split เป็น ภงด.3 + ภงด.53)

### 4️⃣ ที่ยังไม่ได้ทำใน S18 (เก็บไว้ S19+)

- ❌ ลบหน้าเก่า `/reports/expense-summary` + `/reports/by-project` + procedures `expenseSummary/byProject/byVendor`
  - **เหตุผล:** S17 handoff แนะนำว่า "ถ้า unified ใช้สเถียรแล้ว 1-2 สัปดาห์" — ตอนนี้เพิ่ง deploy 0 วัน
  - **ทำใน S20+** หลัง unified เสถียร 1-2 สัปดาห์
- ❌ Implement `/reports/wht` page + tabs (pnd3, pnd53) — **NEW priority** ตามที่พี่ขอ
- ❌ Implement `/reports/vat` page (ภ.พ.30) — dead link มาตั้งแต่ก่อน S18
- ❌ Optimize เพิ่ม: light `event.list` (ไม่โหลด payments) — optional ถ้า test แล้วช้า
- ❌ Smoke test 12C + sidebar restructure บน dev/Vercel — รอพี่ test
- ❌ ตัดสินใจอนาคตของ `/reports/weekly-payment` (orphan page):
  - **Option A:** ใช้เป็น "report view-only" คู่กับ `/payment-prep` (workflow) — กลับมาเปิด sidebar ภายหลัง
  - **Option B:** ลบทิ้ง (page + procedure + bank-csv.ts) — ถ้าตัดสินใจไม่ใช้
  - **Option C:** Merge feature เด่น (ISO week grouping) เข้า `/payment-prep`

---

## 📦 Commit Timeline (Session 18)

| Hash | Subject | Pushed |
|------|---------|--------|
| `117fede` | perf(reports): combined query + defensive fallback + skip ensureAllTabsExist (S17) | ✅ pushed (ต้น S18) |
| `c79f254` | chore(cleanup): remove dead files webhook/line + pdf-to-png-server + wth-cert (stale 6 sessions, S18) | ✅ pushed |
| `e9ba6e8` | feat(reports): /reports/weekly-payment + Bank CSV export (12C, S18) | ✅ pushed |
| `039e423` | chore(sidebar): restructure to Section รายจ่าย + ภงด.3/53 + remove duplicate weekly-payment menu (S18) | ✅ pushed |
| TBD | docs(session18): finalize handoff after smoke test | ⚠️ พี่กำลังจะ commit |

### Working tree ก่อนปิด S18
```
M  session18/handoff/HANDOFF_2026-04-26_END_CLEANUP-WEEKLY.md  (final update — sidebar pushed + smoke test ผ่าน)
```

### Commands ที่พี่ต้องรันก่อนปิด S18 (commit handoff สุดท้าย):
```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm -f .git/index.lock
git add -A
git commit -m "docs(session18): finalize handoff after smoke test passed (S18)"
git push
```

---

## 🎯 งาน Session 19 — Priority Suggestions

ตามแผน HANDOFF Session 11/16/17 — Phase 4 ที่ยังเหลือ:

| Sub | สถานะ | งาน | ความเร่งด่วน |
|-----|-------|-----|---------------|
| 12A Shared Components | ✅ S15 | StatCard, DataTable, DateRangePicker, ExportButton | — |
| 12 Reports Unified | ✅ S16 | /reports รวม 3 tabs | — |
| 12D Clearance | ✅ S17 | /reports/clearance | — |
| **12C Weekly Payment + Bank CSV** | ✅ **S18** | /reports/weekly-payment + generic Bank CSV | — |
| **12E Inactive Payees + Audit Logs UI** | ❌ | Reports payees ไม่ active + admin page audit log | กลาง |
| **12B Dashboard role-specific** | ❌ | Dashboard แยกตาม role | ใหญ่สุด |

### ลำดับแนะนำ (เอม subjective):

1. 🚀 **/reports/wht (ภงด.3 + ภงด.53)** — สำคัญที่สุด — sidebar dead link 2 อันรอ implement (พี่ขอใหม่ S18)
   - หน้า /reports/wht + 2 tabs (pnd3 + pnd53) — ต่างกันที่ vendor type (บุคคลธรรมดา vs นิติบุคคล)
   - Procedure ใน `report.router.ts`: `report.wht` (filter by WTH > 0 + group by vendor type จาก Payee.TaxID length หรือ Payee.IsVAT?)
   - Export CSV/XLSX ตาม spec ภงด.3/53 (รอพี่ confirm spec)
2. 🚀 **/reports/vat (ภพ.30)** — sidebar dead link เก่า — implement หลัง wth
3. 🚀 **12E — Inactive Payees + Audit Logs UI** — admin tools, ขนาดกลาง
4. 🚀 **Bank CSV — KBank/SCB specific format** — ถ้าพี่ส่ง spec/sample มา → เปลี่ยน generic format เป็น bank-specific (เก็บไว้ใน /reports/weekly-payment ที่เป็น orphan ตอนนี้ หรือย้ายไป /payment-prep)
5. 🚀 **12B — Dashboard role-specific** (ใหญ่สุด — ทำหลังสุด)
6. 🧹 **Cleanup รอบที่ 2** (~Session 20-21):
   - ลบ `/reports/expense-summary` + `/reports/by-project` (page + client)
   - ลบ procedures `expenseSummary` + `byProject` + `byVendor` ใน `report.router.ts`
   - เงื่อนไข: หลัง unified สเถียร 1-2 สัปดาห์ + พี่ confirm
7. 🤔 **ตัดสินใจอนาคตของ /reports/weekly-payment** (orphan) — ใช้ต่อ / ลบ / merge เข้า /payment-prep

---

## ⚠️ Known Issues / Watch Out

1. **🟡 Workspace sandbox `git index.lock` issue** — ทุก session — ก่อน commit:
   ```bash
   rm -f ~/Code/Aim\ Expense\ V2/aim-expense/.git/index.lock
   ```

2. **🟡 Cowork sandbox push เองไม่ได้ + ลบ files เองไม่ได้** — sandbox ไม่มี permission unlink บน mount → พี่ต้องรันใน Terminal เอง

3. **🟡 Single-line commit messages** — ห้ามใช้ multi-line `"` ผ่าน sandbox

4. **🟡 Bank CSV = generic format** — column headers/order ตอนนี้เป็น guess ไม่ตรงกับ KBank/SCB จริง 100%
   - ถ้า upload เข้า bank portal แล้ว reject → พี่ถ่ายภาพ error message + sample CSV ของ bank ส่งให้ S19 จะ implement bank-specific format ให้
   - Bank Name อยู่ใน column 1 — บางธนาคารใช้ Bank Code (3-digit) แทน — ต้อง map BankName → Code ตาม BOT spec

5. **🟡 Bank CSV Skip rows ที่ไม่มีบัญชี** — ถ้า payee บันทึก BankAccount ว่างใน Sheet จะถูกข้าม + warn user — admin ควรไป update payee data

6. **🟡 Reports = read-only aggregation** — `weeklyPayment` ไม่เก็บ cache (ตาม SYSTEM_REQUIREMENTS principle 3) — ทุก request load Sheets ใหม่หมด

7. **🔴 Vercel Pro trial expires ~2026-05-06** — ⚠️ **เหลือ ~10 วัน!** ต้อง downgrade เป็น Hobby ที่: Vercel → Settings (team-level) → Billing → Switch to Hobby

8. **🟡 PDF export = rasterized** (เดิม) — ใช้ html2canvas

9. **🟡 iPhone 15 false positive ใน text parser** (เดิม S14) — ยังไม่ fix

10. **🟡 OVERDUE_THRESHOLD_DAYS = 14** ใน clearance procedure — hard-coded

---

## 🔋 Environment State (ณ จบ Session 18)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Branch:          main
HEAD (local):    039e423 (sidebar restructure) + handoff finalize (รอ commit)
HEAD (remote):   039e423 (sync แล้ว ✓)
ก่อนปิด S18:     commit handoff finalize (1 commit เล็กๆ)
Vercel:          deploy ใหม่ทุกครั้งที่ push
Type check:      ✅ 0 errors
Smoke test:      ✅ พี่ test ผ่าน 26 เม.ย. (sidebar restructure + 12C orphan + cleanup)
```

### ✅ Phase status overall

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 1-3 (CRUD) | ✅ 100% | |
| Phase 4 Shared Components | ✅ 100% | S15 |
| Phase 4 Reports Unified | ✅ 100% | S16 — /reports |
| Phase 4 Reports Clearance | ✅ 100% | S17 — /reports/clearance |
| Phase 4 Reports Performance | ✅ 100% | S17 — combined query + skip ensureAllTabsExist |
| **Phase 4 Reports Weekly Payment + Bank CSV** | ✅ 100% | **S18 — /reports/weekly-payment + generic Bank CSV** |
| Phase 4 Reports Inactive Payees + Audit | ❌ 0% | S19+ (12E) |
| Phase 4 Dashboard role-specific | ❌ 0% | S19+ (12B) |
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

## 📝 Session 19 Starting Prompt — สำหรับ paste เข้า session ใหม่

```
สวัสดีค่ะเอม นี่คือ Session 19 ต่อจาก Session 18
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 Latest commit: chore(sidebar): restructure to Section รายจ่าย + ภงด.3/53 (S18) บน main + push แล้ว
🎉 Smoke test S18: cleanup + 12C orphan + sidebar restructure ทำงานปกติ ✅
⚠️ /reports/weekly-payment เป็น orphan page (code อยู่บน main แต่ไม่มี sidebar link) — รอตัดสินใจ
⚠️ Sidebar dead links รอ implement: /reports/vat + /reports/wht?tab=pnd3 + /reports/wht?tab=pnd53

🔴 อ่านก่อนเริ่ม (ตามลำดับ):
1. SYSTEM_REQUIREMENTS.md  ← Single Source of Truth (4 core principles)
2. session18/handoff/HANDOFF_2026-04-26_END_CLEANUP-WEEKLY.md  ← handoff หลัก
3. session17/handoff/HANDOFF_2026-04-26_END_PERF-OPT.md  ← S17 context (ถ้าจำเป็น)

🎯 งาน Session 19 — เลือก 1 sub-session ใหญ่:

🚀 ตัวเลือก (เรียงตามความเร่งด่วน):
- /reports/wht (ภงด.3 + ภงด.53) — สำคัญที่สุด — sidebar dead link รอ implement (พี่ขอใหม่)
- /reports/vat (ภพ.30) — dead link เก่า
- 12E Inactive Payees + Audit Logs UI (admin tools)
- Bank CSV bank-specific KBank/SCB (ถ้าพี่ส่ง spec)
- 12B Dashboard role-specific (ใหญ่สุด — ทำหลังสุด)

🤔 ตัดสินใจ:
- /reports/weekly-payment orphan — ใช้ต่อ / ลบ / merge เข้า /payment-prep?

🧹 Optional (ถ้า context เหลือ):
- Cleanup รอบ 2: ลบ /reports/expense-summary + /reports/by-project + procedures เก่า (ถ้า unified สเถียรแล้ว 1-2 สัปดาห์)

📋 ขั้นตอนแนะนำ:
1. AskUserQuestion ก่อนเริ่ม: confirm sub-session + scope + decision เรื่อง weekly-payment
2. ทำตาม priority + type check ทุกครั้ง
3. แจ้งพี่ commit message → พี่ push เอง

⚠️ ข้อควรระวัง:
- git index.lock อาจค้าง — ใช้: rm ~/Code/Aim\ Expense\ V2/aim-expense/.git/index.lock
- single-line commit messages เท่านั้น
- Cowork sandbox ลบ files / push เองไม่ได้ → พี่ทำเอง
- ห้ามเก็บ business data ใน Prisma (SYSTEM_REQUIREMENTS principle 2)
- ห้าม cache report aggregation นอก request เดียว (Reports = Read-only Aggregation)
- เช็ค sidebar ก่อนเพิ่ม menu ใหม่ทุกครั้ง (S18 lesson learned!)
- 🔴 Vercel Pro trial หมด ~6 พ.ค. — เตือนพี่ downgrade เป็น Hobby (เหลือ ~10 วัน!)
```

---

*Handoff by เอม — Session 18 end — 2026-04-26*
