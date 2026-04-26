# Session 16 → Session 17 — Handoff

> **Created:** 2026-04-26 (end of Session 16)
> **Reason:** Reports unified page (`/reports`) เสร็จ + ตั้ง SYSTEM_REQUIREMENTS.md เป็น core doc → ปิด session เพื่อเริ่มงาน Phase 4 sub-sessions ที่เหลือใน fresh context
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Type check:** ✅ 0 errors
> **Code state:** Commit + push ขึ้น `origin/main` แล้ว ✓
> **Smoke test:** ✅ /reports + LINE ทำงานปกติ (พี่ confirm 26 เม.ย.)

---

## 🔴 อ่านก่อนเริ่มทำงานทุกครั้ง

1. **`SYSTEM_REQUIREMENTS.md`** ← Single Source of Truth (Session 16 สร้างใหม่) — 4 core principles
2. **`HANDOFF.md`** ← overall project context
3. **ไฟล์นี้** ← what's next

---

## 🎯 ที่ทำใน Session 16 (สรุปสั้น)

### 1️⃣ สร้าง `SYSTEM_REQUIREMENTS.md` — เอกสารหลักของระบบ
4 core principles ที่ต้องยึดทุก session:
- **Data Sovereignty** — ข้อมูล user เก็บที่ Google Drive + Sheet ของ user เท่านั้น
- **Zero Data Retention** — Prisma เก็บแค่ infrastructure metadata (User, Org, Subscription, AuditLog)
- **Reports = Read-only Aggregation** — query สดจาก Sheet ทุกครั้ง ห้าม cache
- **Plan-Gated Features** — ทุก feature ต้องมี permission gate (role + plan)

### 2️⃣ สร้างหน้า `/reports` แบบ unified (3 tabs)

| Tab | URL | Content |
|-----|-----|---------|
| ภาพรวม | `/reports?tab=overview` | StatCards + DataTable รายการรายจ่าย (Default) |
| แยกโปรเจกต์ | `/reports?tab=by-project` | StatCards + DataTable + ProgressBar (สีตาม % การใช้งบ) |
| แยกผู้รับเงิน | `/reports?tab=by-vendor` | StatCards + DataTable เรียงยอดสูงสุดบน |

**ฟีเจอร์:**
- Default = **เดือนปัจจุบัน + ทุก project + ทุกสถานะ** (per spec ของพี่)
- Filter ร่วมกันทุก tab: DateRangePicker + Project + Status + Type
- Tab state sync กับ URL (`?tab=...`) — share link ได้
- Project filter auto-disable ใน tab "แยกโปรเจกต์" (เพราะแต่ละ row = project)
- Export CSV/XLSX/PDF ทุก tab (PDF landscape, ฟอนต์ไทย)

### 3️⃣ อัปเดต Dashboard
- Table แยกโปรเจกต์เดิม + เพิ่มปุ่ม "📊 ดูรายงานเต็ม →" → link ไป `/reports?tab=by-project`

### 4️⃣ Sidebar
- ลบ 2 menu เก่า ("สรุปค่าใช้จ่าย", "แยกโปรเจกต์")
- เพิ่ม "📊 ภาพรวมรายจ่าย" → `/reports`
- หน้าเก่า 2 อันยังอยู่ (เผื่อต้องการกลับมาใช้) แต่ไม่มี link จาก UI

### 5️⃣ tRPC Reports Router (3 procedures)
- `report.expenseSummary({from,to,eventId?,status?,expenseType?})`
- `report.byProject({from,to,status?,expenseType?,includeEmpty})`
- `report.byVendor({from,to,eventId?,status?,expenseType?})`

ทั้งหมด query สดจาก Google Sheets (Sheets API + in-memory aggregate) — ตามหลัก SYSTEM_REQUIREMENTS

---

## 📦 Commit Timeline (Session 16)

| Hash | Subject |
|------|---------|
| (ของ S16 — push แล้วก่อนปิด session) | feat(reports): unified /reports with 3 tabs + SYSTEM_REQUIREMENTS.md |

> ก่อนหน้านี้ commits ของ Session 15 อยู่ที่ `c13c0be` (handoff docs)

### ไฟล์ใหม่ (Session 16)
```
SYSTEM_REQUIREMENTS.md                                              (NEW, ~11 KB)
src/server/routers/report.router.ts                                 (NEW, 371)
src/app/(app)/reports/page.tsx                                      (NEW, 34)
src/app/(app)/reports/reports-client.tsx                            (NEW, 205)
src/app/(app)/reports/_components.tsx                               (NEW, 147)
src/app/(app)/reports/_overview-tab.tsx                             (NEW, 231)
src/app/(app)/reports/_by-project-tab.tsx                           (NEW, 326)
src/app/(app)/reports/_by-vendor-tab.tsx                            (NEW, 219)
src/app/(app)/reports/expense-summary/page.tsx                      (NEW, 24)  ← เก่า ไม่ใช้แล้วแต่เก็บไว้
src/app/(app)/reports/expense-summary/expense-summary-client.tsx    (NEW, 352) ← เก่า
src/app/(app)/reports/by-project/page.tsx                           (NEW, 24)  ← เก่า
src/app/(app)/reports/by-project/by-project-client.tsx              (NEW, 476) ← เก่า
```

### ไฟล์ที่แก้ (Session 16)
```
HANDOFF.md                                  (M, +9 บรรทัด — banner ชี้ไปที่ SYSTEM_REQUIREMENTS.md)
src/server/routers/_app.ts                  (M, +2 — เพิ่ม report router)
src/app/globals.css                         (M, +60 — เพิ่ม .app-tabs styles)
src/components/layout/sidebar.tsx           (M, ลบ 2 + เพิ่ม 1 = "ภาพรวมรายจ่าย")
src/app/(app)/dashboard/dashboard-client.tsx (M, +12 — ปุ่ม "ดูรายงานเต็ม →")
```

---

## 🔧 งาน Session 17 — Priority 1 (Quick Bug Fix)

### Timezone Bug ใน `/reports` — Date filter ผิด 1 วัน

**อาการ:**
- Default filter = "เดือนนี้" → คำนวณจาก `range.from.toISOString().slice(0, 10)`
- ใน timezone ICT (UTC+7) — `new Date(2026, 3, 1)` (1 เม.ย. 2026 ICT) → toISOString() = `"2026-03-31T17:00:00.000Z"` → slice = `"2026-03-31"` ❌
- ผลคือ filter ครอบคลุม "31 มี.ค. – 30 เม.ย." แทนที่จะเป็น "1 เม.ย. – 30 เม.ย."

**Impact:**
- รายการของวันที่ 30/31 ของเดือน อาจหายหรือถูกนับผิด
- ไม่ใช่ blocker — แต่ทำให้ตัวเลข aggregation ผิด

**Fix (ง่ายมาก ~5-10 บรรทัด):**

ใน `src/app/(app)/reports/_components.tsx` — เพิ่ม helper:
```ts
/** Format Date → YYYY-MM-DD using LOCAL timezone (not UTC). */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

ใน `src/app/(app)/reports/reports-client.tsx` — เปลี่ยน:
```ts
// ❌ เดิม
const fromIso = range.from.toISOString().slice(0, 10);
const toIso = range.to.toISOString().slice(0, 10);

// ✅ ใหม่
import { toLocalDateString } from "./_components";
const fromIso = toLocalDateString(range.from);
const toIso = toLocalDateString(range.to);
```

**ไฟล์ที่ต้องแก้:**
```
src/app/(app)/reports/_components.tsx                          (เพิ่ม helper)
src/app/(app)/reports/reports-client.tsx                       (หลัก — ใช้ helper)
src/app/(app)/reports/expense-summary/expense-summary-client.tsx (เก่า ถ้าจะคงไว้)
src/app/(app)/reports/by-project/by-project-client.tsx          (เก่า ถ้าจะคงไว้)
```

หรือใช้ `format(d, "yyyy-MM-dd")` จาก date-fns ที่ import อยู่แล้วก็ได้

---

## ✨ งาน Session 17 — Priority 2 (Feature Request — Drill-down ใน by-project)

### Feature: กดที่ Project row → ดูรายละเอียดค่าใช้จ่ายของ project นั้น

**Source:** พี่ขอเพิ่มก่อนปิด Session 16 — "ใน tab report by project ให้ user สามารถกดเข้าไปดูรายละเอียดค่าใช้จ่ายของ project ได้ โดยการกดที่รายการ Project ที่แสดง"

**ที่อยู่ของ feature:** `/reports?tab=by-project` — DataTable แสดงรายชื่อโปรเจกต์

### 💡 UX Options (Session 17 ต้องเลือก / ถามพี่)

#### Option A — Switch tab + auto filter (Recommended ⭐)
- กดที่ project row → switch ไป tab "ภาพรวม" + auto set `eventId = นั้น`
- **ข้อดี:** ใช้ infrastructure ที่มีครบ (overview tab + filter + StatCards + DataTable + Export)
- **ข้อดี:** Filter row อยู่ที่เดิม → user เห็นได้ว่ากำลังดู project ไหน + กลับมาเปลี่ยนได้ง่าย
- **ข้อดี:** URL sync ได้ — `/reports?tab=overview&eventId=EVT-xxx` (ต้องเพิ่ม URL persistence)
- **ใช้เวลา:** ~30 นาที

#### Option B — เปิด Modal แสดง payment list
- กดที่ project row → popup modal แสดง DataTable รายการ payments ของ project นั้น
- **ข้อดี:** ไม่ออกจาก tab "by-project" — กลับมาเร็ว
- **ข้อเสีย:** ต้องสร้าง modal component ใหม่ + ไม่มี shared filter
- **ใช้เวลา:** ~1 ชั่วโมง

#### Option C — Page ใหม่ `/reports/projects/[eventId]`
- กดที่ project row → navigate ไป page รายละเอียด full screen
- แสดง: project info + budget breakdown + payments table + charts
- **ข้อดี:** แสดง info ได้เยอะ + URL share ได้ + เพิ่ม chart/visualization ได้ในอนาคต
- **ข้อเสีย:** ต้องสร้าง page + router procedure ใหม่ (`report.projectDetail`)
- **ใช้เวลา:** ~2-3 ชั่วโมง

### 🛠️ Implementation Notes (สำหรับ Option A — แนะนำ)

ใน `_by-project-tab.tsx` — เพิ่ม `onRowClick` ใน DataTable:
```tsx
<DataTable<ProjectRow>
  // ... existing props
  onRowClick={(row) => onDrillDown?.(row.eventId)}
/>
```

ใน `reports-client.tsx` — เพิ่ม handler + propagate:
```tsx
function handleDrillDownToOverview(eventId: string) {
  setEventId(eventId);
  setTab("overview");
  // sync URL
  const params = new URLSearchParams(searchParams.toString());
  params.set("tab", "overview");
  params.set("eventId", eventId);
  router.replace(`/reports?${params.toString()}`, { scroll: false });
}

// pass to ByProjectTab
<ByProjectTab ... onDrillDown={handleDrillDownToOverview} />
```

แล้ว parse `eventId` จาก URL ตอน initial mount เพื่อให้ refresh + share link ทำงาน:
```tsx
const eventIdFromUrl = searchParams.get("eventId");
const [eventId, setEventId] = useState<string>(eventIdFromUrl || "all");
```

อาจเพิ่ม visual cue ที่ DataTable row — cursor pointer + hover state — ใน CSS:
```css
.app-datatable-row.clickable { cursor: pointer; }
.app-datatable-row.clickable:hover { background: #f8fafc; }
```

(เช็คว่า DataTable ปัจจุบันมี class นี้หรือยังใน `src/components/shared/DataTable.tsx`)

---

## 🚀 งาน Session 17 — Priority 3 (Continue Phase 4)

ตามแผน HANDOFF Session 11 — Phase 4 แบ่งเป็น 5 sub-sessions:

| Sub | สถานะ | งาน |
|-----|-------|-----|
| 12A Shared Components | ✅ S15 | StatCard, DataTable, DateRangePicker, ExportButton |
| 12 Reports Pages Unified | ✅ S16 | /reports รวม 3 tabs |
| **12C Weekly Payment + Bank Sheet** | ❌ | สร้างหน้า /reports/weekly-payment + Export Bank Sheet (CSV ของธนาคาร) |
| **12D Clear Budget + Search Expenses** | ❌ | หน้า /reports/clearance + advanced filter ที่ /payments/search |
| **12E Inactive Payees + Audit Logs UI** | ❌ | Reports + admin page สำหรับ AuditLog |
| **12B Dashboard role-specific** | ❌ | Dashboard แยกตาม role (admin/manager/accountant/staff) |

### ลำดับแนะนำ (เอม subjective):

1. 🔧 **แก้ Timezone bug** (Priority 1) — quick fix 5 บรรทัด ก่อนทำงานใหญ่
2. 🚀 **12D — `/reports/clearance`** (เคลียร์งบ) — มี link ใน sidebar อยู่แล้ว แต่หน้าหายไป (dead link) — fix แล้วจะดูสมบูรณ์
3. 🚀 **12C — Weekly Payment** — important สำหรับ workflow จ่ายเงินรายสัปดาห์ + Bank Sheet export
4. 🚀 **12E — Inactive Payees + Audit Logs**
5. 🚀 **12B — Dashboard role-specific** (ใหญ่สุด, ทำหลังสุด)

---

## 📋 Cleanup ค้างจาก Session 11+12+14 (ยังไม่ได้ทำ — ตกค้างมา 5 sessions)

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook
rm -rf src/app/documents/wth-cert
git add -A && git commit -m "chore: remove dead Phase 5 files" && git push
```

---

## 🧹 Cleanup ค้างจาก Session 16 (ตัดสินใจหรือยัง)

หน้าเก่า 2 อันที่ Session 16 สร้างไปก่อนรวมเป็น `/reports`:
- `src/app/(app)/reports/expense-summary/` (page.tsx + client = ~376 บรรทัด)
- `src/app/(app)/reports/by-project/` (page.tsx + client = ~500 บรรทัด)

**ตอนนี้:** ไฟล์ยังอยู่ตามคำสั่งพี่ ("ยังไม่ต้องลบ เผื่อต้องกลับมาใช้")
**ทบทวน Session 17+:** ถ้า /reports unified ใช้งานเสถียรแล้ว 1-2 สัปดาห์ → ลบทิ้งได้

---

## ⚠️ Known Issues / Watch Out

1. **🟡 Timezone shift ใน /reports** — Priority 1 (5-line fix)

2. **🟡 Workspace sandbox `git index.lock` issue** — ต้องลบ lock เองใน Terminal (เจอบ่อยมากตั้งแต่ S14):
   ```bash
   rm ~/Code/Aim\ Expense\ V2/aim-expense/.git/index.lock
   ```

3. **🟡 Multi-line commit messages** — อย่าใช้ `"` หลายบรรทัด — ใช้ single-line เสมอ

4. **🟡 PDF export = rasterized** (ไม่ใช่ selectable text) — ใช้ html2canvas เพื่อรองรับฟอนต์ไทย — ถ้าต้องการ selectable PDF → embed IBM Plex Sans Thai

5. **🟡 Vercel Hobby plan timeout = 10s** — LINE webhook cold start + Sheets API อาจใกล้ limit — เฝ้าระวัง

6. **🔴 Vercel Pro trial expires ~2026-05-06** — ⚠️ **เหลือ ~10 วัน!** ต้อง downgrade เป็น Hobby ก่อนหมด trial ไม่งั้นโดน $20/เดือน
   - ที่: Vercel → Settings (team-level) → Billing → Switch to Hobby

7. **🟡 iPhone 15 false positive ใน text parser** (เดิมจาก S14) — ยังไม่ fix — รับได้ระดับ MVP

---

## 🔋 Environment State (ณ จบ Session 16)

```
Repo path:    ~/Code/Aim Expense V2/aim-expense
Branch:       main
HEAD (local)  = (commit ของ S16 — push แล้วก่อนปิด session)
HEAD (remote) = sync แล้ว ✓
Vercel:       deploy ใหม่หลัง push (auto deploy)
Type check:   ✅ 0 errors
Smoke test:   ✅ /reports ทำงานปกติ + LINE text-expense ทำงานปกติ
```

### ✅ Phase status overall

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 1-3 (CRUD) | ✅ 100% | |
| Phase 4 Shared Components | ✅ 100% | S15 |
| Phase 4 Reports Unified | ✅ 100% | S16 — /reports |
| **Phase 4 Reports — clearance/weekly/audit** | ❌ 0% | S17+ (12C/12D/12E) |
| Phase 4 Dashboard role-specific | ❌ 0% | S17+ (12B) |
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

## 📝 Session 17 Starting Prompt — สำหรับ paste เข้า session ใหม่

```
สวัสดีค่ะเอม นี่คือ Session 17 ต่อจาก Session 16
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 Latest commit: (S16 reports + SYSTEM_REQUIREMENTS) บน main + push แล้ว
🎉 Smoke test S16: /reports + LINE ทำงานปกติ ✅

🔴 อ่านก่อนเริ่ม (ตามลำดับ):
1. SYSTEM_REQUIREMENTS.md  ← Single Source of Truth (4 core principles)
2. session16/handoff/HANDOFF_2026-04-26_END_REPORTS-DONE.md  ← handoff หลัก
3. HANDOFF.md  ← overall context

🎯 งาน Session 17 (ตามลำดับ Priority):

🔧 P1 — แก้ Timezone bug ใน /reports (Quick fix ~5-10 บรรทัด)
- ไฟล์: src/app/(app)/reports/_components.tsx + reports-client.tsx
- เพิ่ม helper toLocalDateString() แทน toISOString().slice(0,10)
- ดู section "Priority 1" ใน HANDOFF S16 สำหรับ snippet

✨ P2 — เพิ่ม drill-down ใน tab by-project (Feature request จากพี่)
- กดที่ project row → ดูรายละเอียดค่าใช้จ่ายของ project นั้น
- แนะนำ Option A: switch tab "ภาพรวม" + auto-filter eventId (~30 นาที)
- รายละเอียด UX 3 options + code snippet ดูใน HANDOFF section "Priority 2"
- ⚠️ Session 17 ควร AskUserQuestion confirm option ก่อนเริ่ม

🚀 P3 — Continue Phase 4 (เลือก 1 sub-session):
   - 12D /reports/clearance (เคลียร์งบ — มี dead link ใน sidebar)
   - 12C Weekly Payment + Bank Sheet export
   - 12E Inactive Payees + Audit Logs UI
   - 12B Dashboard role-specific

🧹 P4 (optional — ถ้า context เหลือ) — Cleanup:
- ลบ src/app/api/webhook, src/lib/ocr/pdf-to-png-server.ts, src/app/documents/wth-cert
- ค้างมา 5 sessions แล้ว

📋 ขั้นตอนแนะนำ:
1. AskUserQuestion ก่อนเริ่ม: confirm priority + เลือก sub-session ใน P2
2. แก้ P1 ก่อน (5 นาที) → type check → commit
3. ทำ P2 → type check → แจ้งพี่ commit message
4. แจ้งพี่ก่อนปิด session ถ้า context ใกล้เต็ม

⚠️ ข้อควรระวัง:
- git index.lock อาจค้าง — ใช้: rm ~/Code/Aim\ Expense\ V2/aim-expense/.git/index.lock
- single-line commit messages เท่านั้น
- ห้ามเก็บ business data ใน Prisma (ตาม SYSTEM_REQUIREMENTS principle 2)
- Vercel Pro trial หมด ~6 พ.ค. — เตือนพี่ downgrade เป็น Hobby
```

---

*Handoff by เอม — Session 16 end — 2026-04-26*
