# Data Processing Agreement (DPA) — Aim Expense

> ฉบับร่างสำหรับลูกค้า B2B (org plan: business / max / enterprise)
> ใช้แนบเข้ากับสัญญาการให้บริการ
> สถานะ: **ฉบับร่างเพื่อ legal review**
>
> ปรับปรุง: 2026-05-09

---

**คู่สัญญา:**
- **ผู้ควบคุมข้อมูล (Data Controller, "Customer")** — ลูกค้าผู้ใช้บริการ Aim Expense
- **ผู้ประมวลผลข้อมูล (Data Processor, "Aim Expense")** — บริษัท อาร์โต จำกัด

โดยเข้าใจตรงกันว่าเอกสารนี้เป็นไปตามมาตรา 40 PDPA และเป็นส่วนเสริมของ
[Terms of Service](TERMS_OF_SERVICE_TH.md). หากมีข้อขัดแย้ง DPA นี้มีผลเหนือกว่า
ในประเด็นที่เกี่ยวข้องกับการคุ้มครองข้อมูลส่วนบุคคล.

---

## 1. นิยาม

ใช้ตาม PDPA §6 ที่เกี่ยวข้อง รวมถึง: "ข้อมูลส่วนบุคคล", "ผู้ควบคุมข้อมูล",
"ผู้ประมวลผลข้อมูล", "ผู้ประมวลผลข้อมูลช่วง" (sub-processor), "เหตุการณ์ละเมิด"

## 2. หัวข้อและวัตถุประสงค์

Aim Expense ประมวลผลข้อมูลส่วนบุคคลของ Customer ตามที่ระบุใน
[ROPA.md](ROPA.md) เพื่อให้บริการตาม Terms of Service เท่านั้น

## 3. ระยะเวลา

มีผลตั้งแต่วันที่ Customer ยอมรับ Terms จนกว่าจะยุติบริการ + 30 วัน
สำหรับการคืน/ลบข้อมูล (ดู §10)

## 4. ประเภทข้อมูลและเจ้าของ

ดูตารางใน [ROPA.md §B](ROPA.md). โดยสรุป:
- ข้อมูลผู้ใช้: email, ชื่อ, OAuth tokens, LINE User ID
- ข้อมูลธุรกิจ: ใบเสร็จ, ลูกค้า, ผู้รับเงิน, จำนวนเงิน, ที่อยู่ (เก็บใน Google Drive ของ Customer)
- Audit log: ID + summary

เจ้าของข้อมูลคือ: พนักงาน/ผู้ใช้ของ Customer + ลูกค้า/ผู้รับเงิน (third-party PII)

## 5. หน้าที่ของ Aim Expense (Processor)

(1) ประมวลผลข้อมูลตามคำสั่งของ Customer ที่บันทึกไว้ (ผ่าน Terms + การใช้งานผ่าน UI)
และไม่เกินขอบเขตนั้น

(2) จัดให้มี **มาตรการความปลอดภัยทางเทคนิค + องค์กร** ตาม [ROPA §D](ROPA.md). โดยรวมถึง:
- HTTPS/TLS 1.2+
- AES-256 encryption สำหรับ OAuth tokens
- ระบบสิทธิ + audit log

(3) **สนับสนุน Customer** ในการตอบสิทธิของเจ้าของข้อมูล (DSR) ภายใน 14 วันนับจาก
Customer แจ้ง

(4) **แจ้งเหตุละเมิด** Customer ภายใน **48 ชั่วโมง** หลังพบเหตุที่อาจกระทบข้อมูลของ Customer
ดู [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)

(5) **ห้ามถ่ายโอนข้อมูลไปยัง sub-processor** เพิ่ม โดยไม่แจ้งล่วงหน้า 14 วัน
และให้ Customer มีสิทธิคัดค้าน — ดู §6

(6) **ลบหรือคืนข้อมูล** เมื่อสิ้นสุดสัญญา ภายใน 30 วัน — ดู §10

(7) **บังคับให้บุคลากรของ Aim Expense ที่เข้าถึงข้อมูล** ลงนาม NDA และผ่าน
training ด้านการคุ้มครองข้อมูลส่วนบุคคล

## 6. Sub-processors

(1) Aim Expense ใช้ sub-processor ตามรายการใน [SUB_PROCESSORS.md](SUB_PROCESSORS.md).
Customer ยอมรับรายการปัจจุบัน ณ วันลงนาม

(2) Aim Expense จะแจ้ง email + in-app banner อย่างน้อย 14 วันก่อนเพิ่ม/เปลี่ยน
sub-processor

(3) หาก Customer คัดค้าน sub-processor ใหม่อย่างมีเหตุผล Aim Expense จะ:
- พยายามปรับสถาปัตยกรรมให้ไม่ใช้ sub-processor ดังกล่าว, หรือ
- ให้สิทธิ Customer ระงับการใช้บริการโดยไม่เสียค่าธรรมเนียมจนกว่าจะปรับเสร็จ

## 7. การโอนข้ามประเทศ

ดู [ROPA §C](ROPA.md). Aim Expense ใช้ SCC ของ sub-processor แต่ละราย
เป็น safeguard ตาม PDPA §28

## 8. ความช่วยเหลือ Customer (Audit Rights)

(1) Customer (หรือ auditor ที่ Customer แต่งตั้ง โดยลงนาม NDA) มีสิทธิ audit
ปีละไม่เกิน 1 ครั้ง โดยแจ้งล่วงหน้า 30 วัน

(2) ค่าใช้จ่าย audit เป็นของ Customer; หาก audit พบประเด็นที่ Aim Expense
ละเมิด DPA — ค่าใช้จ่าย Aim Expense รับผิดชอบ

(3) Aim Expense จะให้ความร่วมมือในการสนับสนุน DPIA, การตอบ regulator (PDPC),
และการตอบคำขอจาก data subjects

## 9. การแจ้งเหตุละเมิด

ดูขั้นตอนใน [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md). โดยสรุป:
- Aim Expense แจ้ง Customer ภายใน 48 ชม.
- ระบุ: ลักษณะเหตุ, ขอบเขต, ข้อมูลที่ถูกกระทบ, มาตรการแก้ไข
- ร่วมมือเตรียมการแจ้ง PDPC + data subjects ภายใน 72 ชม. (ตาม §37 PDPA)

## 10. การคืน / ลบข้อมูลเมื่อสิ้นสัญญา

(1) ภายใน 30 วันหลังสิ้นสัญญา Aim Expense จะลบ:
- User/Org metadata ใน Postgres
- Audit log ที่ปฏิบัติเก็บไว้ (ยกเว้นเก็บตามกฎหมาย — เช่น invoice 7 ปี)
- Backup ที่เกี่ยวข้องตามรอบ recycling (~30 วัน)

(2) **ข้อมูลใน Google Drive/Sheets ของ Customer ไม่ถูกแตะ** — Customer ควบคุมเอง

(3) Aim Expense ออก **certificate of deletion** ให้ Customer เมื่อร้องขอ

## 11. ความรับผิด

(1) Aim Expense รับผิดต่อ Customer สำหรับการละเมิด DPA ตามขอบเขตที่จำกัดใน
Terms of Service §10 — ยกเว้นการละเมิดข้อบังคับ PDPA ที่มีบทลงโทษเฉพาะ

(2) Customer รับผิดต่อ data subjects ในฐานะ Controller — Aim Expense ช่วยเหลือ
ในส่วนของหน้าที่ที่เป็น Processor

## 12. กฎหมายและศาล

ใช้กฎหมายไทย; ข้อพิพาทระงับโดยศาลในกรุงเทพมหานคร

---

**ลงนาม Customer:**
- ชื่อ:
- ตำแหน่ง:
- วันที่:

**ลงนาม Aim Expense:**
- ชื่อ:
- ตำแหน่ง:
- วันที่:
