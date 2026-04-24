# 🎯 REQUIREMENTS — Receipt Capture & Tax Compliance (สำคัญ! อ่านทุก session)

> **Created:** 2026-04-16 08:06
> **By:** Session `practical-elegant-knuth` (เอม) ตามคำขอของพี่
> **Status:** Requirements ที่ตกลงกันแล้ว — ใช้เป็นแม่แบบสำหรับ implement Phase 2+
>
> **อย่าลบไฟล์นี้** — ใช้อ้างอิงทุก session

---

## 🎯 บริบท (Why)

ระบบ Aim Expense ต้องเก็บข้อมูลใบเสร็จ/ใบกำกับภาษี **ครบถ้วนพอที่จะยื่น ภพ.30 กับกรมสรรพากรได้** ทั้งจากช่องทาง:
- LINE OA (ส่งรูป/PDF)
- Web upload page

ปัจจุบัน (2026-04-16) ระบบยัง **ไม่ครบ** — มีแค่เลขที่ + วันที่ ต้องขยายให้ครบตาม spec ด้านล่าง

---

## 📋 REQUIREMENT 1 — LINE Bot: เลือก Project ทุกครั้งก่อนบันทึก

**Current behavior:** ใช้ default event "LINE Quick Capture" auto-create

**ต้องการ:**
- ทุกครั้งที่ user ส่งบิล/ใบเสร็จเข้ามาใน LINE
- หลัง OCR เสร็จ → **แสดง list ของ Event/Project ที่:**
  - Status = `active` (ยังเปิดอยู่)
  - User คนนั้น **ได้รับ assign** ให้เข้าถึง (ตาม `OrgMember.eventScope[]` หรือ EventAssignments sheet)
- User เลือก project → จากนั้นค่อยถาม confirm
- ถ้า user ไม่มี event ใด ๆ → fall back ไป default หรือแจ้ง "กรุณาสร้าง project ในเว็บก่อน"

**Implementation hint:**
- ใช้ Flex carousel (multiple bubbles) หรือ Quick Reply buttons
- เก็บ event selection ใน LineDraft (เพิ่ม column `selectedEventId`)
- Postback flow: image → OCR → Flex "เลือก project" → user เลือก → Flex "ยืนยันรายละเอียด" → save

---

## 📋 REQUIREMENT 2 — รายละเอียดที่ต้องตรวจสอบ (Validation)

### 2.1 ข้อมูลองค์กรของเรา (Buyer side)
ต้องเทียบกับข้อมูลที่ตั้งค่าไว้ใน Organization:
- ชื่อบริษัท ตรงกับ Org.name
- เลขประจำตัวผู้เสียภาษี ตรงกับ Org.taxId
- ที่อยู่ ตรงกับ Org.address
- **สำนักงานใหญ่/สาขา** (ดู Requirement 7)

ถ้าไม่ตรง → **เตือน user** ก่อนบันทึก (อาจเป็นใบเสร็จที่ออกผิด หรือ user แนบผิดบริษัท)

### 2.2 ข้อมูลผู้ขาย/ผู้ให้บริการ (Vendor side) — ครบถ้วน
ต้องมีครบ 3 อย่าง:
- ชื่อบริษัท หรือชื่อบุคคล
- ที่อยู่
- **เลขประจำตัวผู้เสียภาษี (13 หลัก)**

ถ้าขาด → **แสดงเตือนสีแดง** บน Flex/หน้า review ให้ user รู้ว่า "ใบนี้ไม่ครบสำหรับยื่นภาษี" — แต่ยัง save ได้ (เป็น warning ไม่ใช่ block)

---

## 📋 REQUIREMENT 3 — AI Suggest หมวดหมู่ (Category)

หลัง OCR เสร็จ ระบบต้อง **suggest หมวดหมู่ + หมวดหมู่ย่อยอัตโนมัติ** จากเนื้อหารายการ

**หมวดหมู่หลัก** (ตามที่กรมสรรพากรยอมรับ — ตัวอย่าง):
1. ค่าใช้จ่ายสำนักงาน
2. ไอที & Software
3. การตลาด & การโฆษณา
4. ค่าเดินทาง
5. ค่ารับรอง
6. ค่าสาธารณูปโภค (ค่าน้ำ ค่าไฟ ค่าโทรศัพท์)
7. ค่าเช่า
8. ค่าฝึกอบรม
9. ค่าซ่อมแซม
10. วัตถุดิบ/สินค้า
11. อื่น ๆ

> Note: ตอน implement ให้ research **รายการหมวดหมู่ที่กรมสรรพากรยอมรับ** จาก https://rd.go.th หรือ guideline ของ ภพ.30 อย่างเป็นทางการก่อน

**Behavior:**
- AI แนะนำหมวดหมู่หลัก + หมวดหมู่ย่อย
- User สามารถ **แก้ไข** ก่อน save
- User สามารถ **เพิ่มหมวดหมู่ใหม่** ได้เอง (per-org)
- เก็บ master list ของหมวดหมู่ใน Sheet (tab ใหม่ `ExpenseCategories`)

---

## 📋 REQUIREMENT 4 — User Review ก่อน Save

**Current:** กด ✅ → save ทันที

**ต้องการ:** user **เห็นและแก้ไขทุก field** ได้ก่อนบันทึก
- LINE flow: ส่ง Flex preview → user กด "✏️ แก้ไขในเว็บ" → เปิดหน้า web review form (prefill จาก OCR + draft)
- ใน web ดูทุก field, แก้ได้, กด "บันทึก" ค่อยเขียนลง Google Sheet

**Implementation:**
- หน้าใหม่: `/payments/line-draft/[draftId]` — review + edit + save
- LineDraft schema เพิ่ม field สำหรับเก็บ user-edited values
- Postback "✏️ แก้ในเว็บ" → reply uri-action ลิงก์หน้า review

---

## 📋 REQUIREMENT 5 — Schema ครบสำหรับ ภพ.30 (Tax Filing)

ต้องเก็บใน Google Sheet (Payments tab) — ขยาย columns เพิ่มจากปัจจุบัน:

| # | Field | Type | Note |
|---|---|---|---|
| 1 | เลขที่ใบกำกับภาษี | string | InvoiceNumber (มีแล้ว) |
| 2 | **ประเภทเอกสาร** | enum | `receipt` \| `tax_invoice` (ใบเสร็จ vs ใบกำกับภาษี) — **ใหม่** |
| 3 | รายละเอียด | string | Description (มีแล้ว) |
| 4 | จำนวน | number | NoOfPPL หรือ Quantity (มีแล้ว) |
| 5 | ราคาต่อหน่วย | number | CostPerUnit (มีแล้ว) |
| 6 | ยอดรวมก่อนภาษี | number | Subtotal (TTLAmount มีแล้ว แต่ไม่ใช่ก่อน VAT — ต้องแยก) — **อาจต้องเพิ่ม** |
| 7 | ภาษีมูลค่าเพิ่ม (VAT) | number | VATAmount (มีแล้ว) |
| 8 | ภาษีหัก ณ ที่จ่าย | number | WTHAmount (มีแล้ว) |
| 9 | ยอดชำระ | number | GTTLAmount (มีแล้ว) |
| 10 | **ประเภทค่าใช้จ่าย** | enum | `goods` \| `service` (สินค้า vs บริการ) — **ใหม่** |
| 11 | **หมวดหมู่หลัก** | string | จาก ExpenseCategories — **ใหม่** |
| 12 | **หมวดหมู่ย่อย** | string | จาก ExpenseCategories — **ใหม่** |
| 13 | ผู้ขาย/ผู้ให้บริการ | string | ผ่าน PayeeID → PayeeName (มีแล้ว) |
| 14 | **เลขประจำตัวผู้เสียภาษีของร้าน** | string | ผ่าน PayeeID → TaxID (มีใน Payee แต่ควร denormalize ลง Payment ด้วย) — **ตัดสินใจ** |
| 15 | **ผู้ขออนุญาตเบิกจ่าย** | string | userId หรือชื่อผู้ส่งใบเสร็จ — **ใหม่** (CreatedBy มีแต่เป็นชื่อ display) |
| 16 | หลักฐาน (รูป/PDF) | url | InvoiceFileURL + ReceiptURL (มีแล้ว) |
| 17 | หมายเหตุ | string | Notes (มีแล้ว) |

### ที่ต้องเพิ่มแน่ ๆ:
- `DocumentType` (receipt | tax_invoice)
- `Subtotal` (ก่อน VAT — ตอนนี้ TTLAmount มีคำนวณแบบรวม)
- `ExpenseNature` (goods | service)
- `CategoryMain`
- `CategorySub`
- `RequesterUserId` หรือ `RequesterName` (ต่างจาก CreatedBy)
- `VendorTaxIdSnapshot` (denormalize จาก Payee เพื่อกันข้อมูลเปลี่ยน)

> ⚠️ **เพิ่ม column ใน Sheet** ใช้ `ensureAllTabsExist()` ที่ auto-extend อยู่แล้ว — user เก่าไม่ต้องสร้าง sheet ใหม่

---

## 📋 REQUIREMENT 6 — Web Upload Page ต้องครบ

**Current:** หน้า upload ใบเสร็จในเว็บมีแค่ ReceiptNumber + ReceiptDate

**ต้องการ:** ขยาย form ให้ครบตาม Requirement 5 ทุก field
- Path: `/payments` (ReceiptReviewModal.tsx) + อาจมีหน้าใหม่
- ใช้ component ร่วมกับ LINE draft review (Requirement 4)

---

## 📋 REQUIREMENT 7 — หน้าตั้งค่าองค์กร: HQ vs Branch

**Current:** Org schema มีแค่ name + taxId + address + phone

**ต้องการเพิ่ม:**
- `Organization.branchType` (enum: `HQ` | `Branch`) — เหมือนใน Payee
- `Organization.branchNumber` (string, 5 หลัก เช่น "00000" สำหรับ HQ, "00001" ขึ้นไปสำหรับสาขา)
- หน้า `/settings/org` แสดง dropdown + input ให้ตั้งค่า
- ใช้ใน:
  - เอกสาร WTH cert / Substitute receipt (ดู comment ใน HANDOFF เก่า)
  - Validation Requirement 2.1 (ตรวจสอบกับใบเสร็จ)

---

## 🗺️ Implementation Order (เสนอ)

จากเล็ก→ใหญ่:

| # | Task | Effort | Depends |
|---|---|---|---|
| 1 | R7: Org HQ/Branch fields | S | — |
| 2 | R5: ขยาย Sheet columns + Payment schema | M | — |
| 3 | R3: ExpenseCategories master + AI suggest | M | R5 |
| 4 | R6: Web upload form ขยายให้ครบ | M | R5, R3 |
| 5 | R4: หน้า web review for LINE draft | L | R5, R3, R6 |
| 6 | R1: LINE Flex carousel เลือก project | M | R4 |
| 7 | R2: Validation องค์กร + ผู้ขาย ครบถ้วน | S | R7, R5 |

หรือ user-driven order — แล้วแต่พี่จัดลำดับใหม่

---

## 📝 Tracking

- ทุกครั้งที่เริ่มทำ requirement ไหน → อัพเดต HANDOFF ใหม่ที่อ้างอิง requirement number
- เมื่อทำเสร็จ → ขีดฆ่าใน checklist ด้านล่าง

### Progress Checklist
- [ ] R1: LINE Bot เลือก Project (Flex carousel)
- [ ] R2: Validation องค์กร + ผู้ขาย ครบถ้วน
- [ ] R3: AI suggest หมวดหมู่ + ExpenseCategories master
- [ ] R4: Web review หน้าใหม่สำหรับ LINE draft
- [ ] R5: ขยาย Payment schema ครบ 17 fields
- [ ] R6: Web upload form ครบทุก field
- [ ] R7: Org HQ/Branch + หน้าตั้งค่า
