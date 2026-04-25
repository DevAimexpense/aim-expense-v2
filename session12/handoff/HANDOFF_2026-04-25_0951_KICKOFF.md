# Session 12 — Kickoff Handoff

> **Created:** 2026-04-25 09:51 ICT (Saturday)
> **Status:** 🟢 Session เริ่มต้น — ยังไม่เริ่มงานจริง
> **Previous:** Session 11 Round 2 (Deploy Vercel เสร็จ)
> **Session ID (Cowork):** `2a25ba21-86d3-4c1e-8e1b-e9418014be0a` / local `cded76a1`

---

## 📌 Session 12 Scope (ตามที่พี่สั่งตอน kickoff)

1. **Priority 1** — Smoke Test Production ที่ `https://aim-expense-v2.vercel.app`
2. **Priority 2** — Vercel plan downgrade (ก่อน 2026-05-06)
3. **Priority 3** — Phase 4 Reports & Dashboard (แบ่งเป็น 12A–12E)

**Working Mode (ตามคำสั่งพี่):**
- บันทึกทุก handoff/เอกสารเป็นไฟล์ใหม่ (suffix `_YYYY-MM-DD_HHMM`)
- เก็บทุกอย่างใน `aim-expense/session12/`
- เอมเช็ค context usage ทุก 5–10 turns + เตือนล่วงหน้าถ้าใกล้เต็ม (70–80%)

---

## ✅ สิ่งที่ทำเสร็จใน Session 12 Turn 1 (kickoff)

| ลำดับ | รายการ | สถานะ |
|-------|--------|-------|
| 1 | สร้าง folder `session12/` + `handoff/` + `checklists/` + `notes/` | ✅ |
| 2 | รัน `npx tsc --noEmit` — **0 errors** (code สะอาด) | ✅ |
| 3 | สร้าง `checklists/SMOKE-TEST-CHECKLIST_2026-04-25_0951.md` (7 tests, 30 นาที) | ✅ |
| 4 | สร้าง Kickoff Handoff นี้ | ✅ (กำลังทำ) |

---

## 📂 โครงสร้าง session12/ ที่ใช้ตลอด session

```
aim-expense/session12/
├── handoff/            # HANDOFF_YYYY-MM-DD_HHMM_XXX.md (ไฟล์ใหม่ทุกครั้ง)
├── checklists/         # เช็คลิสต์ทดสอบ + เอกสาร verify
└── notes/              # บันทึกย่อ / decision log / bug trace
```

**กฎ:**
- ทุกไฟล์ใหม่ suffix `_YYYY-MM-DD_HHMM` (เวลา ICT)
- HANDOFF ที่เป็น milestone เพิ่ม tag เช่น `_KICKOFF`, `_MIDPOINT`, `_FINAL`, `_BEFORE_12A`
- **ห้าม overwrite** ไฟล์เก่า — ใช้ append ไฟล์ใหม่เสมอ เพื่อ trace back ได้

---

## 🌐 Production Environment (ที่ inherit มาจาก Session 11)

```
Production URL: https://aim-expense-v2.vercel.app
GitHub:         https://github.com/DevAimexpense/aim-expense-v2 (private)
Vercel Team:    aim-expense
Vercel Project: aim-expense-v2
Plan:           Pro trial → ต้อง downgrade ก่อน 2026-05-06
Node runtime:   24.x
```

**Env vars (22 keys) ตั้งไว้แล้วใน Vercel:**
- `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL` = prod URL
- `GOOGLE_REDIRECT_URI` = prod + `/api/auth/google/callback`
- `LINE_CALLBACK_URL` = prod + `/api/auth/line/callback`
- DATABASE_URL = Supabase Session Pooler (port 5432)
- LINE Login Ch `2009801571` / Messaging Ch `2009801545` / OA `@064qycfu`

---

## 🧹 งาน cleanup ที่ยังค้าง (user ต้องลบเองใน VS Code)

```bash
cd "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2/aim-expense"
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook              # path เก่า
rm -rf src/app/documents/wth-cert       # typo t-h (ที่ถูก = wht-cert)
git add -A && git commit -m "chore: remove dead Phase 5 files" && git push
```

เอมลบให้ไม่ได้เพราะ sandbox permission — อยู่ในรายการให้พี่ทำตอนสะดวก

---

## 🔄 Git state (ณ 2026-04-25 09:51 ICT)

```
Branch: main
Uncommitted: M HANDOFF.md (จาก Session 11 — ยังไม่ commit)
Untracked:   SESSION12-PROMPT.md (prompt ของ session นี้)
Latest commit: 6b1dab8 fix: wrap /login useSearchParams in Suspense boundary
```

**ข้อเสนอแนะ:** หลัง smoke test ผ่าน → commit HANDOFF.md + prompt + session12/ เป็น 1 commit เดียว

---

## 🎯 Next Action (รอพี่)

1. เปิดไฟล์ checklist → [SMOKE-TEST-CHECKLIST_2026-04-25_0951.md](../checklists/SMOKE-TEST-CHECKLIST_2026-04-25_0951.md)
2. ทดสอบ 7 หมวด (~30 นาที)
3. กลับมาคุยกับเอม พร้อมสรุปผล
4. ถ้ามี bug → เอมเปิดไฟล์ใหม่ `session12/notes/BUGS_YYYY-MM-DD_HHMM.md` + วางแผนแก้
5. ถ้าผ่านหมด → เริ่ม Session 12A (Shared Components)

---

## 📊 Session 12 Context Tracker (เอมอัปเดตทุก 5–10 turns)

| Turn | Action | Context Est. | Note |
|------|--------|--------------|------|
| 1 | Kickoff + checklist + handoff | ~15–20% | HANDOFF.md เดิมใหญ่ 36k tokens แต่เอมไม่โหลดทั้งไฟล์ |

**Threshold:** เตือนพี่ที่ **70%** → เตรียม FINAL handoff ที่ **80%**

---

*Handoff created by Aim — 2026-04-25 09:51 ICT*
