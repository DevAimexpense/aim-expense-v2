# Session 11 — Prompt สำหรับเริ่ม session ใหม่

Copy prompt ด้านล่างนี้ทั้งก้อนไปวางใน session ใหม่ของ Claude ค่ะ

---

สวัสดีค่ะเอม นี่คือ session ต่อจาก Session 10 ของ Aim Expense V2

## 📖 อ่าน context ก่อนเริ่มงาน

โปรดอ่านไฟล์เหล่านี้ตามลำดับ (อยู่ใน folder `aim-expense/`):

1. **HANDOFF.md** — สถานะโปรเจกต์ล่าสุด + สิ่งที่ทำเสร็จทุก session + แผน Session 11
2. **AimExpense-Architecture-Spec-v2.md** (อยู่ใน workspace folder) — ส่วน Phase 4 โดยเฉพาะ

## 📊 สถานะปัจจุบัน (สิ้น Session 10)

| Phase | สถานะ |
|-------|-------|
| 1. Foundation | ✅ 100% |
| 2. Core Data CRUD | ✅ 100% |
| 3. Payment System | ✅ 100% (Auto-save PDF ทำงานครบ Session 10) |
| 4. **Reports & Dashboard** | ❌ **ยังไม่เริ่ม — งานของ Session 11** |
| 5. LINE Integration | ✅ ~80% (เหลือ cleanup เล็กน้อย) |
| 6. Billing & Launch | ❌ ยังไม่เริ่ม |

## 🎯 งาน Session 11 — Phase 4: Reports & Dashboard

**ลำดับความสำคัญ (ทำตามนี้):**

### 1. Dashboard แยก role (สำคัญสุด)
- `/dashboard` page — แสดง stat cards ตาม permission/role:
  - **admin/manager**: รวมทุก event (งบใช้/คงเหลือ, รอเบิก, รออนุมัติ, เคลียร์แล้ว)
  - **accountant**: รออนุมัติ, กำลังจ่าย, ขาดใบเสร็จ, WHT ค้างส่ง
  - **staff**: event ของฉัน, งบของฉัน, รายการรอแนบใบเสร็จ
- Quick actions แยก role
- Chart: งบใช้ vs คงเหลือ ต่อ event (bar chart)

### 2. Weekly Payment report + Bank Sheet export
- `/reports/weekly-payment` — สรุป payment ที่ต้องจ่ายสัปดาห์นี้
- Group by bank → export Excel (1 sheet ต่อ bank) สำหรับ upload เข้า internet banking
- Include: ชื่อบัญชี, เลขบัญชี, จำนวน, reference

### 3. รายงานเคลียร์งบ (team expense reconciliation)
- `/reports/clear-budget` — แสดง event ที่ใช้งบแบบ team (ยืมจ่ายก่อน แล้วเคลียร์ภายหลัง)
- Summary: เบิกไป vs ใช้จริง vs ต้องคืน/เพิ่ม
- Export Excel

### 4. ค้นหารายจ่าย (advanced filter)
- `/reports/search-expenses` — filter ได้หลายเงื่อนไข:
  - date range, event, payee, expense type, status, amount range
  - with/without receipt, WHT yes/no
- Export Excel + PDF summary

### 5. Inactive Payees report
- `/reports/inactive-payees` — payee ที่ไม่มี payment ใน N เดือนที่ผ่านมา
- Option: archive/restore

### 6. Audit logs UI
- `/admin/audit-logs` — ตาราง audit_log พร้อม filter (date, user, action, entity)
- Pagination

## 🛠️ Tech Stack เดิม
- Next.js 14.2 App Router + tRPC 11.16 + Prisma/Supabase + Tailwind v4
- Google Sheets (data) + Google Drive (files)
- Chart: ใช้ Recharts (มีแล้วในโปรเจกต์? ถ้าไม่ติดตั้ง → `npm i recharts`)
- Excel export: ใช้ `xlsx` library (มีแล้ว)

## 📝 สิ่งที่ต้องระวัง
- **Permission scoping** — แต่ละ report ต้อง check permission ก่อน query (`permissionProcedure` ใน tRPC)
- **Event scope** — staff เห็นเฉพาะ event ที่ถูก assign (via `OrgMember.eventScope`)
- **Performance** — `sheets.getPayments()` โหลดทั้ง sheet → cache ผ่าน tRPC query (React Query)

## 🧹 งาน cleanup เล็กๆ ระหว่างทำ Phase 4 (ถ้ามีเวลา)
- ลบ folder dead route: `src/app/documents/wth-cert/` (สะกดผิด — แทนที่ด้วย `wht-cert` ถูกแล้ว)
- ลบไฟล์เก่า: `src/app/api/webhook/line/route.ts`, `src/lib/ocr/pdf-to-png-server.ts`

## 🎨 UI Consistency
ใช้ class เดิมจาก globals.css:
- `app-btn`, `app-btn-primary`, `app-btn-secondary`
- `app-table`, `app-badge`, `app-modal`, `app-modal-backdrop`
- SearchableSelect จาก `@/components/searchable-select`

---

## ⚡ คำสั่งเริ่มงาน

```bash
cd aim-expense
cat HANDOFF.md | less   # อ่านสถานะก่อน
npm run dev              # start dev server
npx tsc --noEmit         # ตรวจ type check
```

เริ่มจาก **Dashboard (ข้อ 1)** ก่อนค่ะ — เป็นฐานให้ report อื่นๆ มี pattern เดียวกัน

ขอบคุณค่ะ 🙏
