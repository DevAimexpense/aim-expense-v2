# Session 18 → Session 19 — Handoff

> **Created:** 2026-04-26 (end of Session 18)
> **Reason:** Cleanup ไฟล์ค้าง 6 sessions + 12C Weekly Payment + Bank CSV (Phase 4 sub-session) เสร็จ + type check ผ่าน → ปิด session ก่อน context หมด เพื่อเริ่ม sub-session ที่เหลือ (12E / 12B) ใน fresh context
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Type check:** ✅ 0 errors
> **Smoke test:** ⏳ ยังไม่ได้ test บน dev/Vercel — รอพี่ confirm
> **Commits ใน S18:**
>   - `117fede` — perf(reports): combined query + defensive fallback + skip ensureAllTabsExist (S17 ที่ค้าง — push ต้น S18)
>   - `(TBD)` — chore(cleanup): remove dead files webhook/line + pdf-to-png-server + wth-cert (stale 6 sessions, S18) ✅ pushed แล้ว
>   - `(TBD)` — feat(reports): /reports/weekly-payment + Bank CSV export (12C, S18) ⚠️ พี่กำลังจะ commit

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

### 3️⃣ ที่ยังไม่ได้ทำใน S18 (เก็บไว้ S19+)

- ❌ ลบหน้าเก่า `/reports/expense-summary` + `/reports/by-project` + procedures `expenseSummary/byProject/byVendor`
  - **เหตุผล:** S17 handoff แนะนำว่า "ถ้า unified ใช้สเถียรแล้ว 1-2 สัปดาห์" — ตอนนี้เพิ่ง deploy 0 วัน
  - **ทำใน S20+** หลัง unified เสถียร 1-2 สัปดาห์
- ❌ Optimize เพิ่ม: light `event.list` (ไม่โหลด payments) — optional ถ้า test แล้วช้า
- ❌ Smoke test 12C บน dev/Vercel — รอพี่ test

---

## 📦 Commit Timeline (Session 18)

| Hash | Subject | Pushed |
|------|---------|--------|
| `117fede` | perf(reports): combined query + defensive fallback + skip ensureAllTabsExist (S17) | ✅ pushed (ต้น S18) |
| TBD | chore(cleanup): remove dead files webhook/line + pdf-to-png-server + wth-cert (stale 6 sessions, S18) | ✅ pushed |
| TBD | feat(reports): /reports/weekly-payment + Bank CSV export (12C, S18) | ⚠️ พี่กำลังจะ commit |

### Working tree ค้างใน Session 18 (ก่อน commit)
```
M  src/components/layout/sidebar.tsx                              (+ "ชำระรายสัปดาห์" nav)
M  src/server/routers/report.router.ts                            (+ weeklyPayment procedure ~250 lines)
?? src/app/(app)/reports/weekly-payment/page.tsx                  (NEW server entry)
?? src/app/(app)/reports/weekly-payment/weekly-payment-client.tsx (NEW client ~515 lines)
?? src/lib/utils/bank-csv.ts                                      (NEW helper ~140 lines)
?? session18/handoff/HANDOFF_2026-04-26_END_CLEANUP-WEEKLY.md     (NEW this file)
```

### Commands ที่พี่ต้องรันก่อนปิด S18:
```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm -f .git/index.lock
git add -A
git commit -m "feat(reports): /reports/weekly-payment + Bank CSV export (12C, S18)"
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

1. 🚀 **12E — Inactive Payees + Audit Logs UI** — admin tools, ขนาดกลาง — ทำต่อจาก S18 ได้
2. 🚀 **Bank CSV — KBank/SCB specific format** — ถ้าพี่ส่ง spec/sample ของ KBank Bulk Payment + SCB Business Net Cash Management มา → เปลี่ยน generic format เป็น bank-specific
3. 🚀 **12B — Dashboard role-specific** (ใหญ่สุด — ทำหลังสุด)
4. 🧹 **Cleanup รอบที่ 2** (~Session 20-21):
   - ลบ `/reports/expense-summary` + `/reports/by-project` (page + client)
   - ลบ procedures `expenseSummary` + `byProject` + `byVendor` ใน `report.router.ts`
   - เงื่อนไข: หลัง unified สเถียร 1-2 สัปดาห์ + พี่ confirm

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
HEAD (local):    117fede + cleanup commit + working tree (12C ค้าง)
HEAD (remote):   117fede + cleanup commit (sync แล้ว ✓)
ก่อนปิด S18:     ต้อง commit + push 12C feature ที่ค้าง
Vercel:          deploy ใหม่ทุกครั้งที่ push
Type check:      ✅ 0 errors (ทั้ง backend + frontend ของ 12C)
Smoke test:      ⏳ พี่จะ test หลัง push (12C)
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
📦 Latest commit: feat(reports): /reports/weekly-payment + Bank CSV export (12C, S18) บน main + push แล้ว
🎉 ผลงาน S18: Cleanup 4 ไฟล์ค้าง 6 sessions (-1098 บรรทัด) + 12C Weekly Payment + Bank CSV ✅
⏳ ยังไม่ได้ test 12C — พี่จะ test ก่อน

🔴 อ่านก่อนเริ่ม (ตามลำดับ):
1. SYSTEM_REQUIREMENTS.md  ← Single Source of Truth (4 core principles)
2. session18/handoff/HANDOFF_2026-04-26_END_CLEANUP-WEEKLY.md  ← handoff หลัก
3. session17/handoff/HANDOFF_2026-04-26_END_PERF-OPT.md  ← S17 context (ถ้าจำเป็น)

🎯 งาน Session 19 (เลือก 1 sub-session ใหญ่):

🚀 ตัวเลือก:
- 12E Inactive Payees + Audit Logs UI (กลาง — admin tools)
- Bank CSV bank-specific (เล็ก — ถ้าพี่ส่ง KBank/SCB spec มา)
- 12B Dashboard role-specific (ใหญ่สุด — ทำทีหลังดีกว่า)

🧹 Optional (ถ้า context เหลือ):
- ลบหน้า/procedures /reports เก่า (เงื่อนไข: หลัง unified สเถียร 1-2 สัปดาห์)
- Optimize: light event.list (ไม่โหลด payments)

📋 ขั้นตอนแนะนำ:
1. AskUserQuestion ก่อนเริ่ม: confirm sub-session + scope
2. ทำตาม priority + type check ทุกครั้ง
3. แจ้งพี่ commit message → พี่ push เอง

⚠️ ข้อควรระวัง:
- git index.lock อาจค้าง — ใช้: rm ~/Code/Aim\ Expense\ V2/aim-expense/.git/index.lock
- single-line commit messages เท่านั้น
- Cowork sandbox ลบ files / push เองไม่ได้ → พี่ทำเอง
- ห้ามเก็บ business data ใน Prisma (SYSTEM_REQUIREMENTS principle 2)
- 🔴 Vercel Pro trial หมด ~6 พ.ค. — เตือนพี่ downgrade เป็น Hobby (เหลือ ~10 วัน)
```

---

*Handoff by เอม — Session 18 end — 2026-04-26*
