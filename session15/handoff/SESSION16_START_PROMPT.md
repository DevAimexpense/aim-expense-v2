# Session 16 — Starting Prompt

**Paste นี้ใน Cowork mode ตอนเริ่ม Session 16:**

---

สวัสดีค่ะเอม นี่คือ session ต่อจาก Session 15 — Phase 4 Shared Components ครบ 4/4 แล้ว ✅
📂 Folder: ~/Code/Aim Expense V2/aim-expense
📦 Latest commit: a08c007 + DateRangePicker + ExportButton commits (เช็ค `git log --oneline -5` ยืนยัน push ครบก่อนเริ่ม)

📖 อ่าน context ตามลำดับ:
1. `aim-expense/session15/handoff/HANDOFF_2026-04-25_END_PHASE4-SHARED-DONE.md`  ← handoff หลัก
2. `aim-expense/HANDOFF.md` (Session 11 — Phase 4 Reports plan + overall context)

🎯 สถานะ ณ จบ Session 15:
- Phase 1-3: ✅ 100%
- Phase 4 Shared Components: ✅ 100% (StatCard / DataTable / DateRangePicker / ExportButton)
- Phase 4 Reports Pages: ❌ ยังไม่เริ่ม ← **งานหลัก Session 16**
- Phase 5 LINE: ✅ 100%
- Phase 6 Billing: ❌ ยัง

🚀 งาน Session 16 — Phase 4 Reports Pages

ใช้ shared components ที่มีจาก Session 15 สร้างหน้า:
1. `/reports/expense-summary` — รายงานสรุปค่าใช้จ่าย (StatCard + DataTable + DateRangePicker + ExportButton)
2. `/reports/by-project` — รายงานแยกโปรเจกต์
3. `/reports/by-vendor` — รายงานแยกผู้ขาย/ผู้รับเงิน
4. `/reports/vat` (Pro+) — รายงานภาษีซื้อ/ขาย ภ.พ.30
5. `/reports/profit-loss` (Pro+) — กำไร/ขาดทุน

📋 ขั้นตอนแนะนำ:
1. รัน `npm install` (ถ้ายังไม่ได้รันหลัง pull deps ใหม่จาก S15: @tanstack/react-table, react-day-picker, date-fns)
2. รัน `npm run dev` → เปิด `/dashboard` ดูว่า StatCard ยัง render OK (drop-in replacement test)
3. AskUserQuestion ก่อน — confirm: เริ่มจากหน้าไหน / tRPC procedure naming / sidebar nav pattern
4. สร้างทีละหน้า → type check ทุกครั้ง → 1 page / 1 commit (single-line message เท่านั้น)
5. Cleanup ไฟล์ค้างจาก Session 11+12+14:
   ```
   rm src/lib/ocr/pdf-to-png-server.ts
   rm -rf src/app/api/webhook
   rm -rf src/app/documents/wth-cert
   ```
6. เพิ่ม "📊 รายงาน" ใน sidebar (`src/components/layout/sidebar.tsx`) พร้อม sub-menu

⚠️ Known issues / watch out
- Commit `a08c007` รวม StatCard + DataTable + Pagination ในก้อนเดียว (message ไม่ตรง — ของอยู่ครบ ไม่ amend)
- Multi-line commit message **อย่าใช้** — ติด `>` continuation prompt — ใช้ single-line `git commit -m "..."` เสมอ
- Workspace sandbox ลบ `.git/index.lock` + `tsconfig.tsbuildinfo` เองไม่ได้ — พี่ commit + push เองจาก Terminal
- PDF export = rasterized (html2canvas) — ถ้าต้องการ selectable text ต้อง embed Thai font หรือใช้ jspdf-autotable
- iPhone 15 false positive ใน text parser (เดิมจาก S14) — ยังไม่ fix

📋 User & Org info (พี่)
User: id=333d8b87-8b59-492f-b684-ee41c57768f8 / email=dev@aimexpense.com / lineUserId=Ua42c7d7729c56f8eab021918c168761c / lineDisplayName=AoR
Org: id=32e5a820-ddb1-4850-95f3-b226d4e3a3e2 / name="บริษัท อาร์โต จำกัด" / slug=org-1776216850926

⚠️ ก่อนเริ่ม: ถ้า Cowork ยังผูก path เก่า ให้เลือก folder ใหม่ ~/Code/Aim Expense V2 ผ่าน "Open Folder"

พี่ต้องการให้น้องตรวจสอบ session ที่เราคุยทุกครั้งว่าใกล้เต็มหรือยัง ถ้าใกล้เต็มให้เตือนพี่ และทำการเตรียมข้อมูลและไฟล์ทั้งหมดที่ต้องใช้ในการย้ายไปเริ่ม session ใหม่ให้เรียบร้อย
