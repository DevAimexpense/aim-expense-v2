# Session 12 — Prompt สำหรับเริ่ม session ใหม่

> Copy prompt ด้านล่างนี้ทั้งก้อนไปวางใน session ใหม่ของ Claude ค่ะ

---

สวัสดีค่ะเอม นี่คือ session ต่อจาก Session 11 ของ Aim Expense V2

## 📖 อ่าน context ก่อนเริ่มงาน

โปรดอ่านไฟล์เหล่านี้ตามลำดับ (อยู่ใน folder `aim-expense/`):
1. **HANDOFF.md** — สถานะล่าสุด (Session 11 Round 2) + Vercel deployment info + แผน Session 12
2. **DEPLOYMENT-GUIDE.md** — อ้างอิงถ้ามีปัญหา deploy เพิ่มเติม
3. **AimExpense-Architecture-Spec-v2.md** (ใน workspace folder) — โดยเฉพาะส่วน Phase 4

## 🎯 สถานะปัจจุบัน (สิ้น Session 11)

| Phase | สถานะ |
|-------|-------|
| 1. Foundation | ✅ 100% |
| 2. Core Data CRUD | ✅ 100% |
| 3. Payment System | ✅ 100% |
| 4. Reports & Dashboard | ❌ ยังไม่เริ่ม — **งาน Session 12** |
| 5. LINE Integration | ✅ 95% (code เสร็จ, deploy เสร็จ) |
| 6. Billing & Launch | ❌ ยังไม่เริ่ม |

## 🌐 Deploy แล้ว

- **Production URL**: `https://aim-expense-v2.vercel.app`
- **GitHub**: `https://github.com/DevAimexpense/aim-expense-v2` (private)
- **Vercel Team**: `aim-expense`
- **Plan**: Pro trial → ⚠️ **ต้อง downgrade เป็น Hobby ก่อน ~2026-05-06**

## 🚀 งาน Session 12 (ลำดับ)

### 1. Smoke Test Production (สำคัญสุด — 30 นาที)
- LINE Login + Google OAuth
- LINE OA: ส่งรูปใบเสร็จ → ตรวจ Flex card ตอบภายใน 15s
- สร้าง payment บนเว็บ + upload receipt
- ตรวจ Google Sheets + Drive มี data ใหม่
- ดู Vercel Logs: มี error 4xx/5xx ไหม

### 2. Phase 4 — Reports & Dashboard
ตามที่คุยไว้ — **แบ่งเป็น 5 sessions ย่อย** เพื่อป้องกัน context ระเบิด:

- **12A** — Shared components ก่อน (StatCard, DataTable, DateRangePicker, ExportButton)
- **12B** — Dashboard แยก role (admin/manager/accountant/staff)
- **12C** — Weekly Payment + Bank Sheet Export
- **12D** — Clear Budget + Search Expenses
- **12E** — Inactive Payees + Audit Logs UI

**เริ่มจาก 12A ก่อน** (shared components) เพื่อให้ 12B-E ใช้ร่วมกันได้

## 🛠️ Tech Stack เดิม
- Next.js 14.2 App Router + tRPC 11.16 + Prisma/Supabase + Tailwind v4
- Google Sheets + Drive API
- Chart: ใช้ Recharts (ติดตั้งถ้ายังไม่มี: `npm i recharts`)
- Excel export: `xlsx` (มีแล้ว)

## 🧹 งาน cleanup ค้างจาก Session 11

User (พี่) ยังต้องลบไฟล์เหล่านี้เองใน VS Code (sandbox ลบไม่ได้):
```bash
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook
rm -rf src/app/documents/wth-cert
```

## ⚠️ Known Issues (อ่านก่อนลงมือ)

1. **Function timeout** — Hobby plan = 10s, LINE webhook cold start อาจใกล้ limit
2. **Login page Suspense** — ทุก page ใหม่ที่ใช้ `useSearchParams()` ต้องห่อ `<Suspense>` + แยกเป็น Server + Client component
3. **Supabase** — ถ้าเจอ "too many connections" → เปลี่ยน DATABASE_URL เป็น Transaction Pooler (port 6543)

## 🎨 UI Consistency

ใช้ class จาก globals.css:
- `app-btn`, `app-btn-primary`, `app-btn-secondary`
- `app-table`, `app-badge`, `app-modal`, `app-modal-backdrop`
- SearchableSelect จาก `@/components/searchable-select`

## ⚡ คำสั่งเริ่มงาน

```bash
cd aim-expense
cat HANDOFF.md | less   # อ่านสถานะ
npm run dev              # dev server
npx tsc --noEmit         # type check
```

## 🔄 Deploy workflow

Session นี้ project deploy แล้ว — ทุก push ไป main = Vercel auto-redeploy ภายใน 2-4 นาที
```bash
git add .
git commit -m "feat: xxx"
git push   # → Vercel auto-build
```

---

ให้เริ่มจาก **Priority 1 — Smoke Test Production** ก่อน เพื่อตรวจว่า deploy จริงๆ ใช้งานได้ ก่อนเข้า Phase 4 ค่ะ

ขอบคุณค่ะ 🙏
