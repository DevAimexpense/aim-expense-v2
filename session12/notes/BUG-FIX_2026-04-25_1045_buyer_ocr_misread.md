# Bug Fix Log — Buyer Name OCR Misread

> **Created:** 2026-04-25 10:45 ICT
> **Test:** Smoke Test — Test 4 (LINE OA Receipt) Round 2
> **Severity:** 🟡 MEDIUM (ไม่ block flow แต่กระทบ data quality)
> **Status:** 🛠 รอตัดสินใจวิธีแก้

---

## 🐛 Bug Report

**Trigger:** ส่งใบเสร็จ Grande Centre Point Pattaya ไป LINE OA → Flex card อ่าน buyer ผิด

**Ground Truth (จากใบเสร็จ):**
```
Vendor:  Grande Centre Point Space Pattaya / L&H Hotel Management Co.,Ltd
         Tax ID 0105555019474
Buyer:   บริษัท อาร์โด จำกัด (สำนักงานใหญ่)
         Tax ID 0105546106467
         Address: 902 ถนนศรีนครินทร์ แขวงพัฒนาการ เขตสวนหลวง กรุงเทพมหานคร 10250
Amount:  42,025.00 (Vatable 39,275.70 + VAT 7% 2,749.30)
Date:    18/07/2024
Doc No:  DP126291
```

**OCR ผลลัพธ์:** buyer = "บริษัท **อาซิโอ** จำกัด" ❌

---

## 🔍 Root Cause Analysis

**Char-by-char comparison:**
```
Expected:  อ า ร  โ ด        (4 chars after อา)
OCR got:   อ า ซิ โ อ        (5 chars; ด→อ + insert ิ)
```

**Confusion pairs ในภาษาไทย:**
| Pair | สาเหตุ |
|------|--------|
| ร ↔ ซิ | "ร" ตัวเล็กใน font บางแบบเหมือน "ซ" + พิมพ์มี ิ ใต้ |
| ด ↔ อ | ทั้งคู่มี loop ด้านบน — "ด" มีตัวขีดล่าง แต่ถ้ารูปเบลอ/ตัวเล็กจะหาย |

**Pipeline ที่น่าจะใช้:**
- `OpenAIOcrProvider.parseImage()` → `callVisionDirect()` (single-pass)
- ใช้ `detail: "auto"` (line 530) → GPT ลด resolution ลงอัตโนมัติ → ตัวอักษรเล็กในใบเสร็จเสียรายละเอียด

**สรุป:** Vision OCR misread ตั้งแต่ Pass 1 (transcribe) ไม่ใช่ prompt issue

---

## 🛠 Fix Strategy (3 ชั้น)

### Layer 1 — Image Quality Quick Win (~15 min)

**File:** `src/lib/ocr/openai-provider.ts`

1. **เปลี่ยน `detail` parameter** (line 530):
   ```diff
   - { type: "image_url", image_url: { url: imageDataUrl, detail: "auto" } }
   + { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
   ```

2. **เพิ่ม sharpening + contrast** ใน `prepareImageForGpt`:
   ```ts
   const optimized = await sharpLib(imageBuffer)
     .normalize()                    // auto contrast
     .sharpen({ sigma: 0.8 })       // edge sharpening
     .jpeg({ quality: 90 })         // 85 → 90
     .toBuffer();
   ```

3. **เพิ่ม MAX_DIM** เพื่อไม่ลดความคม:
   ```diff
   - const MAX_DIM = 1200;
   + const MAX_DIM = 1600;  // GPT-4o รองรับได้ดีกว่าที่ 1568px (high mode)
   ```

**Impact:** Token cost เพิ่ม ~30% แต่ accuracy ไทย ดีขึ้นชัดเจน

---

### Layer 2 — Payee DB Fuzzy Match (recommended, ~30-45 min)

**ไอเดีย:** หลัง OCR เสร็จ → เอา `buyerName` ไป match กับ list บริษัทใน org's Payees

**Flow:**
```
1. OCR ได้ buyerName = "อาซิโอ"
2. Query payees ของ org → list [อาร์โด, อาทิตย์, อันดามัน, ...]
3. Fuzzy match (Levenshtein / Trigram) → "อาร์โด" similarity 75%
4. ถ้า ≥ 70% → suggest แทน + แสดง "OCR: อาซิโอ → ระบบแนะนำ: อาร์โด"
5. ใน Flex card → ปุ่ม [✓ ใช่ อาร์โด] / [✗ ไม่ใช่ ใช้ตามอ่าน]
```

**Pros:** ใช้ data ที่มีอยู่แล้ว, ไม่ต้องเทรน, แม่นยำมากสำหรับ repeat customers
**Cons:** ใช้ครั้งแรกของ buyer ใหม่ไม่ช่วย

---

### Layer 3 — Pre-fill Buyer จาก Org Settings (long-term, Phase 5+)

**Insight:** ในระบบ expense management — `buyer` = บริษัทเรา/ลูกค้าที่ติดต่อ มัก fix อยู่ไม่กี่ตัว

**Proposal:**
- Org settings → field `companyName`, `companyTaxId`, `companyAddress`
- ตอน OCR → ถ้าเลขภาษีตรงกับของ org → ใช้ข้อมูลจาก org แทน OCR (more reliable)
- ถ้าไม่ตรง → ใช้ payee fuzzy match (Layer 2)

---

## 📋 Decision Matrix

| Option | เวลา | Effort | Accuracy gain | Recommend |
|--------|------|--------|---------------|-----------|
| Layer 1 only | 15 min | XS | ~10-15% | ✅ ถ้าเร่ง |
| Layer 1 + 2 | 45 min | S | ~30-40% | 🌟 best ROI |
| All 3 | 2-3 hr | M | ~50-60% | ถ้ามีเวลา |

---

## 📋 Action Items

- [ ] **พี่:** ตัดสินใจเลือก Layer
- [ ] **เอม:** Implement Layer ที่เลือก
- [ ] **พี่:** Re-test ด้วยใบเสร็จเดิม (Grande Centre Point) → verify อ่านได้ "อาร์โด"
- [ ] **พี่:** Re-test ด้วยใบเสร็จอื่น 2-3 ใบ → ดู accuracy ทั่วไป
- [ ] **เอม:** ปิด bug + เริ่ม Session 12A (Phase 4)

---

## 📎 References

- Receipt sample: Grande Centre Point Space Pattaya (Tax Invoice DP126291)
- Affected file: `src/lib/ocr/openai-provider.ts` line 322-370 (parseImage), 187-216 (prepareImageForGpt), 509-557 (callVisionDirect)
- Related: `src/lib/ocr/types.ts` — `OcrParsedReceipt.buyerName`

---

*Bug fix log by Aim — 2026-04-25 10:45 ICT*
