# Session 15 → Session 16 — Handoff

> **Created:** 2026-04-25 (end of Session 15)
> **Reason:** Phase 4 Shared Components ครบ 4/4 — ปิด session เพื่อเริ่ม Phase 4 Reports pages ใน fresh context
> **Repo:** `~/Code/Aim Expense V2/aim-expense` (อยู่นอก iCloud Desktop ตั้งแต่ Session 14)
> **Type check:** ✅ 0 errors (ทดสอบหลังทุก component)
> **Code state:** รอ commit + push ของ ExportButton (commit สุดท้าย) — ก่อนหน้า DateRangePicker + 2 ตัวแรก push ขึ้น GitHub แล้ว

---

## 🎯 ที่ทำใน Session 15 (สรุปสั้น)

ตามแผน HANDOFF.md (Session 11 / 14) — สร้าง **4 reusable shared components** ภายใต้ `src/components/shared/`:

| # | Component | ไฟล์ | บรรทัด | สรุป |
|---|-----------|------|--------|------|
| 1 | **StatCard** | `StatCard.tsx` | 145 | KPI tile — icon, color (6 สี), trend (up/down/neutral + intent override), href wrapper |
| 2 | **DataTable** | `DataTable.tsx` (197) + `DataTablePagination.tsx` (102) | 299 | Generic `<DataTable<T>>` — sort, search, pagination (ภาษาไทย), row click, loading, empty state |
| 3 | **DateRangePicker** | `DateRangePicker.tsx` | 211 | Trigger + popover (presets เดือนนี้/เดือนก่อน + calendar + actions) — พ.ศ. + ภาษาไทย |
| 4 | **ExportButton** | `ExportButton.tsx` (167) + `export-utils.ts` (167) | 334 | Dropdown CSV/XLSX/PDF — Thai font ผ่าน html2canvas + lazy imports |
| — | **index.ts** | barrel export | 30 | `import { StatCard, DataTable, ... } from "@/components/shared"` |
| — | **globals.css** | M | +175 | Add `.app-stat-card.gradient-slate`, `.app-datatable*`, `.app-table-pagination*`, `.app-input-sm/select-sm`, `.app-daterange*`, `.app-export-menu*` + import `react-day-picker/style.css` |
| — | **dashboard-client.tsx** | M | -22 / +1 | Refactor inline StatCard → `import { StatCard } from "@/components/shared"` (proves drop-in) |

**Total new code:** ~1,019 lines / 5 new files / 2 files modified

### Dependencies เพิ่ม
- `@tanstack/react-table ^8.21.0` (DataTable)
- `react-day-picker ^9.5.0` (DateRangePicker)
- `date-fns ^4.1.0` (DateRangePicker — Thai locale)

⚠️ **ก่อน `npm run dev` รอบแรกของ Session 16 ต้องรัน `npm install`** เพื่อติดตั้ง deps ใหม่

---

## 📦 Commit Timeline (Session 15)

| Hash | Subject | สรุป |
|------|---------|------|
| `a08c007` | feat(shared): add StatCard component + extract from dashboard | (รวม StatCard + DataTable + DataTablePagination + globals.css ตอนแรก เพราะ multi-line `"` ทำ git add บวก commit ก่อน — message ไม่ตรงเป๊ะ แต่ของครบ) |
| (TBD) | feat(shared): add DateRangePicker with Thai presets + Buddhist Era display | DateRangePicker + globals.css RDP styles |
| (TBD) | feat(shared): add ExportButton with CSV/XLSX/PDF + Thai font support | ExportButton + export-utils + globals.css export menu styles |

> ⚠️ Commit DateRangePicker + ExportButton อาจค้างถ้าพี่ยังไม่ได้รัน push ตอนปิด session — โปรดเช็คด้วย `git log --oneline -5` แล้ว push ก่อนเริ่ม Session 16

### ⚠️ Commit message inaccuracy (a08c007)
- Subject เขียน "add StatCard" แต่จริงๆ commit นี้รวม DataTable + Pagination ด้วย (ของพลาดจาก paste timing)
- **ไม่ amend** — ของอยู่ใน repo ครบ ไม่อยาก force-push เปลี่ยน history

---

## 🧪 Behavior หลัง Session 15 — Verified

### Type check
```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
npx tsc --noEmit --incremental false
# ---EXIT 0  ✓ 0 errors
```

### ทดสอบจริงด้วยตา (Session 16 ทำ)
- ⏳ ยังไม่ได้ test render บน dev server — แค่ type check ผ่าน + drop-in dashboard StatCard
- 📝 แนะนำ: ตอน start Session 16 รัน `npm install && npm run dev` แล้วเปิด `/dashboard` ดูว่า StatCard ยัง render เหมือนเดิม (drop-in replacement)

---

## 🚀 Action Items สำหรับ Session 16 — Phase 4 Reports Pages

ตอนนี้มี building blocks ครบแล้ว — Session 16 ใช้ shared components สร้างหน้า reports จริง:

### หน้าที่ต้องสร้าง (จาก HANDOFF Phase 4 plan)
1. **`/reports/expense-summary`** — รายงานสรุปค่าใช้จ่าย
   - StatCard row (รวม / เฉลี่ย / สูงสุด / จำนวนรายการ)
   - DateRangePicker filter
   - DataTable (date, project, category, vendor, amount, status)
   - ExportButton (PDF/Excel/CSV)
2. **`/reports/by-project`** — รายงานแยกโปรเจกต์
   - StatCard per top 3 projects + DataTable
   - DateRangePicker
   - ExportButton
3. **`/reports/by-vendor`** — รายงานแยกผู้ขาย/ผู้รับเงิน
4. **`/reports/vat`** (Pro+ feature) — รายงานภาษีซื้อ/ขายสำหรับ ภ.พ.30
5. **`/reports/profit-loss`** (Pro+ feature) — กำไร/ขาดทุนต่อโปรเจกต์

### tRPC routers ที่อาจต้องเพิ่ม
- `report.expenseSummary({ from, to, projectId? })`
- `report.byProject({ from, to })`
- `report.byVendor({ from, to })`
- `report.vat({ month })` — Pro+
- `report.profitLoss({ from, to, projectId? })` — Pro+

### Sidebar nav update
- เพิ่ม "📊 รายงาน" ใน sidebar (ดู `src/components/layout/sidebar.tsx`)
- Sub-menu: Expense Summary / By Project / By Vendor / VAT / P&L

---

## 📋 Cleanup ค้างจาก Session 11+12+14 (ยังไม่ได้ทำ — ตกค้างมา 4 sessions)

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook
rm -rf src/app/documents/wth-cert
git add -A && git commit -m "chore: remove dead Phase 5 files" && git push
```

---

## 📖 Reference: Shared Components API Cheat Sheet

### StatCard
```tsx
<StatCard color="blue" icon="💰" label="งบประมาณ" value="฿1.2M"
          sub="ทุกโปรเจกต์"
          trend={{ direction: "up", value: "+12%", label: "vs เดือนก่อน",
                   intent: "negative" /* expenses going up = bad */ }}
          href="/expenses" />
```
สี: `blue | green | amber | rose | violet | slate`

### DataTable
```tsx
import { DataTable, type ColumnDef } from "@/components/shared";

<DataTable<Payment>
  columns={[
    { accessorKey: "date", header: "วันที่" },
    { accessorKey: "amount", header: "จำนวน",
      cell: ({ getValue }) => `฿${getValue<number>().toLocaleString("th-TH")}` },
  ]}
  data={payments}
  pageSize={25}
  searchable                  // global search input
  onRowClick={(p) => router.push(`/payments/${p.id}`)}
  loading={query.isLoading}
  emptyMessage="ยังไม่มีรายการ"
/>
```

### DateRangePicker
```tsx
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/shared";

const [range, setRange] = useState<DateRange>(getPresetRange("this-month"));

<DateRangePicker value={range} onChange={setRange}
                 presets={["this-month", "last-month"]}
                 align="left" />
```

### ExportButton
```tsx
import { ExportButton, type ExportColumn } from "@/components/shared";

<ExportButton
  data={rows}
  columns={[
    { key: "date", header: "วันที่",
      format: (v) => new Date(v as string).toLocaleDateString("th-TH") },
    { key: "amount", header: "จำนวน",
      format: (v) => `฿${Number(v).toLocaleString("th-TH")}` },
  ]}
  filename="payments-2026-04"
  pdfTitle="รายงานการชำระเงิน"
  pdfOrientation="landscape"
  hideWhenEmpty
/>
```

---

## ⚠️ Known Issues / Watch Out

1. **Commit a08c007 message ไม่ตรง** — รวม 3 components แต่ subject เขียนแค่ StatCard (ของครบใน repo, แค่ message inaccurate)

2. **PDF export = rasterized** — ไม่ใช่ selectable text (ใช้ html2canvas) — ขนาดไฟล์ใหญ่กว่า text PDF, แต่แลกกับ Thai font ที่ทำงาน
   - ถ้า Session 16+ ต้องการ selectable PDF → พิจารณา `jspdf-autotable` + embed IBM Plex Sans Thai font (~200KB เพิ่ม)

3. **DateRangePicker popover overlap** — ใน narrow column อาจล้น viewport — ใช้ `align="right"` ถ้าวางใกล้ขอบขวา

4. **Workspace sandbox `git` issue (เดิมจาก Session 14)** — Cowork sandbox ลบ `.git/index.lock` + `tsconfig.tsbuildinfo` เองไม่ได้
   - **Workaround:** พี่ commit + push เองจาก Terminal (ทำงานได้)
   - Type check ใช้ `npx tsc --noEmit --incremental false` (ไม่ใช้ buildinfo)

5. **Multi-line commit message อย่าใช้** — pasted คำสั่งที่มี `"` หลายบรรทัดใน Terminal จะติด `>` continuation prompt → ใช้ single-line `git commit -m "..."` เสมอ

6. **iPhone 15 false positive ใน text parser** (เดิมจาก S14) — ยังไม่ fix — รับได้ระดับ MVP

---

## 🔋 Environment State (ณ จบ Session 15)

```
Repo path:    ~/Code/Aim Expense V2/aim-expense
Branch:       main
HEAD (local)  = a08c007 (StatCard commit) + uncommitted DateRangePicker + ExportButton
              ⚠️ พี่ต้อง commit + push ก่อนเริ่ม Session 16
HEAD (remote) = a08c007 (StatCard ขึ้นแล้ว — DateRange + Export ยัง pending)
Vercel:       commit cf5f6dc (Session 14) ยัง Ready ✓ — commit a08c007 ของ Session 15 จะ deploy เมื่อ push next
```

### ✅ Phase status overall
- **Phase 1-3:** ✅ 100%
- **Phase 4 Shared Components:** ✅ 100% (Session 15 — เพิ่งจบ)
- **Phase 4 Reports Pages:** ❌ ยัง ← **งานหลัก Session 16**
- **Phase 5 LINE:** ✅ 100% (Sessions 11-14)
- **Phase 6 Billing:** ❌ ยัง

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

## 🧹 Cowork Mode Setup สำหรับ Session 16

⚠️ Cowork mode ผูกกับ folder mount — เริ่ม session 16 เลือก folder เดิม:
```
~/Code/Aim Expense V2  (เปิดผ่าน "Open Folder" ใน Cowork)
```

---

## 📝 Session 16 Starting Prompt — สั้นๆ

```
สวัสดีค่ะเอม นี่คือ session ต่อจาก Session 15 — Phase 4 Shared Components ครบแล้ว
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 Latest commit: a08c007 (+ DateRange + Export ที่อาจค้าง — เช็ค git log ก่อน)

📖 อ่าน context ตามลำดับ:
1. session15/handoff/HANDOFF_2026-04-25_END_PHASE4-SHARED-DONE.md  ← ไฟล์นี้
2. HANDOFF.md (Session 11 — Phase 4 Reports plan)

🎯 งาน Session 16 — Phase 4 Reports Pages
ใช้ shared components ที่มีจาก Session 15 สร้างหน้า:
1. /reports/expense-summary
2. /reports/by-project
3. /reports/by-vendor
4. /reports/vat (Pro+)
5. /reports/profit-loss (Pro+)

📋 ขั้นตอนแนะนำ:
1. npm install (ถ้ายังไม่ได้รันหลัง pull deps ใหม่จาก S15)
2. npm run dev → เปิด /dashboard ดูว่า StatCard ยัง render OK
3. AskUserQuestion ก่อน: เริ่มจากหน้าไหน, tRPC procedure naming, navigation pattern
4. สร้างทีละหน้า → type check ทุกครั้ง
5. Cleanup ไฟล์ค้างจาก Session 11+12+14 (rm -rf src/app/api/webhook ฯลฯ)
```

---

*Handoff by เอม — Session 15 end — 2026-04-25*
