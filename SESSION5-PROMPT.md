# Session 5 — Prompt สำหรับเริ่ม session ใหม่

ใช้ prompt ด้านล่างนี้ copy ทั้งก้อนไปวางใน session ใหม่:

---

สวัสดีค่ะ นี่คือ session ต่อจาก session 4 ของ Aim Expense V2

อ่าน HANDOFF.md ก่อนเลยค่ะ:
```
cat aim-expense/HANDOFF.md
```

## ปัญหาเร่งด่วนที่ต้องแก้:

### 1. ระบบ OCR อ่านใบเสร็จช้าเกินไป (> 2 นาที) — ใช้งานไม่ได้จริง

**สาเหตุ**: Session 4 เปลี่ยนจาก GPT-4o Vision มาใช้ Tesseract.js เพราะ GPT-4o hallucinate ข้อมูลภาษาไทย (ชื่อบริษัท/Tax ID/ที่อยู่ผิดหมด) แต่ Tesseract.js ช้ามาก (> 2 นาที)

**ข้อเท็จจริง**:
- GPT-4o Vision: เร็ว (5-15 วินาที) แต่อ่านข้อมูลไทยผิด (hallucinate)
- Tesseract.js: ช้า (> 2 นาที) แต่อ่านข้อมูลถูกต้อง
- Tesseract CLI (system): เร็ว + อ่านถูกต้อง แต่ต้อง install บน server

**ทางเลือกที่ควรพิจารณา**:
1. **แก้ Tesseract.js ให้เร็วขึ้น** — pre-load worker, cache language model, resize image ให้เล็กลงก่อน OCR
2. **ใช้ Google Cloud Vision API** — เร็ว + แม่นยำ (ต้องเพิ่ม API key)
3. **Hybrid: GPT-4o Vision + prompt ที่เข้มงวดขึ้น** — บังคับ GPT อ่าน EXACT text ห้าม hallucinate, ใช้ 2-pass (pass 1: transcribe all text, pass 2: parse to JSON)

**ไฟล์สำคัญ**:
- `src/lib/ocr/openai-provider.ts` — OCR pipeline หลัก (Tesseract → GPT)
- `src/lib/ocr/tesseract-helper.ts` — Tesseract.js wrapper
- `src/lib/ocr/pdf-helper.ts` — PDF text extraction (unpdf)
- `src/app/api/ocr/receipt/route.ts` — API endpoint

**PDF ทดสอบ** (อยู่ใน folder เดิมที่ user เปิด):
- ใบเสร็จ PDF ที่เป็น scanned image (ไม่มี text layer)
- ผู้ซื้อจริง: บริษัท อาร์โอ จำกัด, Tax ID: 0105546106467

ช่วยแก้ปัญหานี้ให้ OCR ทำงานได้ทั้งเร็ว (< 15 วินาที) และถูกต้อง (ไม่ hallucinate) ด้วยค่ะ
