# Correction — Buyer Name: อาร์โต (not อาร์โด)

> **Created:** 2026-04-25 11:40 ICT
> **Supersedes (in part):** BUG-FIX_2026-04-25_1045_buyer_ocr_misread.md ground truth field
> **Action needed:** ใช้ "อาร์โต" ใน Config sheet (ไม่ใช่ "อาร์โด" ที่เอกสารเก่าเขียน)

---

## ✏️ สิ่งที่ต้องแก้

ใน [HANDOFF_2026-04-25_1130_OCR-FIX-READY.md](../handoff/HANDOFF_2026-04-25_1130_OCR-FIX-READY.md)
และ [BUG-FIX_2026-04-25_1045_buyer_ocr_misread.md](BUG-FIX_2026-04-25_1045_buyer_ocr_misread.md)

ทุกที่ที่เขียน **"อาร์โด"** → ที่ถูกคือ **"อาร์โต"**

ตัวสุดท้ายเป็น **ต** (มีตะขอด้านบน) ไม่ใช่ **ด** (หางเรียบ)

---

## 🔄 ผลกระทบ

| ไฟล์ | ต้องแก้? |
|------|----------|
| Code (text-similarity / handlers / openai-provider) | ❌ ไม่ต้อง — ไม่ได้ hard-code ชื่อ |
| Config sheet (Google Sheets) | ✅ ใช้ "อาร์โต" ตอนตั้งค่า |
| Bug-fix doc 1045 | 📝 reference เก่า — เก็บไว้เพื่อ trace back |
| Handoff 1130 | 📝 reference เก่า — เก็บไว้เพื่อ trace back |

---

## 📋 Config Values ที่ถูกต้อง

| Key | Value |
|-----|-------|
| `BUYER_NAME` | `บริษัท อาร์โต จำกัด` |
| `BUYER_TAX_ID` | `0105546106467` |
| `BUYER_BRANCH` | `สำนักงานใหญ่` |
| `BUYER_ADDRESS` | `902 ถนนศรีนครินทร์ แขวงพัฒนาการ เขตสวนหลวง กรุงเทพมหานคร 10250` |

---

## 🧠 Lesson Learned

**Thai OCR confusion pairs ใหม่ที่เพิ่งเจอ:**
- ต ↔ อ (ทั้งคู่มี loop/หางด้านบน — ต มีตะขอ, อ ไม่มี)
- เพิ่มเข้า list เดิม: ร↔ซ, ด↔อ, ต↔อ

**สำหรับ AI assistant (Aim/เอม):**
- ตอน reference ชื่อจากรูป — ขยาย image / zoom in ก่อน
- ถ้าตัวอักษรเล็กในภาพ → ขอ confirm กับ user เสมอ ก่อน assume

---

*Correction by Aim — 2026-04-25 11:40 ICT*
