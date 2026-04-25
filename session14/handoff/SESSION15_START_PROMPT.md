# Session 15 — Starting Prompt

> Copy ข้อความใน code block ด้านล่างไปวางใน chat ของ session ใหม่
> ⚠️ **อย่าลืม:** เลือก folder `~/Code/Aim Expense V2` ผ่าน "Open Folder" ใน Cowork ก่อน

---

```
สวัสดีค่ะเอม นี่คือ session ต่อจาก Session 14 — งาน LINE OA สำเร็จครบแล้ว
📂 Folder: ~/Code/Aim Expense V2/aim-expense (ออกจาก iCloud Desktop)
📦 Latest commit: cf5f6dc — fix(line): await text-expense flow + show typing-dots animation

📖 อ่าน context ตามลำดับ:
1. aim-expense/session14/handoff/HANDOFF_2026-04-25_1600_TEXT-ENTRY-DONE.md
2. aim-expense/session14/notes/PATCH_2026-04-25_1530_text_quick_entry.md
3. aim-expense/session14/notes/PATCH_2026-04-25_1545_loading_animation_void_fix.md
4. aim-expense/HANDOFF.md (Session 11 — overall context, ดู Phase 4 plan)

🎯 สถานะ ณ จบ Session 14:
- Phase 1-3: ✅ 100%
- Phase 4 Reports: ❌ ยังไม่เริ่ม ← งานหลัก Session 15
- Phase 5 LINE: ✅ 100% (image + text flow + loading animation)
- Phase 6 Billing: ❌ ยัง

🚀 งาน Session 15 — Phase 4: Shared Components
ตามแผน HANDOFF.md (Session 11) เดิม สร้าง 4 reusable components:

1. StatCard — KPI tile (label, value, unit, trend, icon, color)
2. DataTable — pagination + sort + filter (ใช้ tanstack/react-table)
3. DateRangePicker — start/end + presets (Today/Week/Month/Custom; ใช้ react-day-picker)
4. ExportButton — dropdown PDF/Excel/CSV (xlsx ใช้ exceljs ที่มีอยู่ — pdf เลือก lib ใน session นี้)

📋 ขั้นตอนแนะนำ:
1. อ่าน src/app/dashboard/* + src/app/(app)/* เพื่อเข้าใจ design system + tailwind tokens ปัจจุบัน
2. ดู package.json ว่ามี dep อะไร available
3. ออกแบบ folder structure (เสนอ src/components/shared/* หรือ src/components/ui/*)
4. AskUserQuestion ก่อน — confirm location + naming + PDF lib choice
5. สร้างทีละ component พร้อม Storybook-like demo page (ถ้ามี)
6. Type check ทุกครั้งหลัง implement
7. ระยะ session 14 commit ไม่ค่อยมีปัญหา git lock ใน sandbox — แต่ถ้าเจอ ให้พี่ commit + push เองจาก Terminal

📋 Cleanup ค้างจาก Session 11+12 (ทำตอน time allows):
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook
rm -rf src/app/documents/wth-cert

⚠️ Known issues
- text parser มี false positive "iPhone 15" → amount=15 (รับได้ระดับ MVP)
- workspace sandbox ลบ .git/index.lock ไม่ได้ (Operation not permitted) → fallback: พี่ commit + push เองจาก Terminal
- Vercel Hobby plan function timeout 10s — ระวัง chunk งาน OCR/Drive อย่าให้เกิน

📋 Reference user/org info — ใน HANDOFF_2026-04-25_1600
```

---

## 📁 ไฟล์ทั้งหมดใน session14/ ที่ต้อง commit ก่อนปิด session

```
session14/
├── handoff/
│   ├── HANDOFF_2026-04-25_1600_TEXT-ENTRY-DONE.md
│   └── SESSION15_START_PROMPT.md           ← ไฟล์นี้
└── notes/
    ├── PATCH_2026-04-25_1530_text_quick_entry.md
    └── PATCH_2026-04-25_1545_loading_animation_void_fix.md
```

---

*Prompt template by Aim — 2026-04-25 16:00 ICT*
