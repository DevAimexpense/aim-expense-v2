# Session 7 — Prompt สำหรับเริ่ม session ใหม่

ใช้ prompt ด้านล่างนี้ copy ทั้งก้อนไปวางใน session ใหม่:

---

สวัสดีค่ะ นี่คือ session ต่อจาก session 6 ของ Aim Expense V2

## อ่าน HANDOFF.md ก่อนเลยค่ะ:
```
cat aim-expense/HANDOFF.md
```

## อ่าน Architecture Spec ส่วน Phase 2 ด้วย:
```
cat AimExpense-Architecture-Spec-v2.md
```

## งานที่ต้องทำใน session นี้: Phase 2 — Core Data CRUD

ตอนนี้ Phase 1 (Foundation) เสร็จ 100% และ Phase 5 (LINE Integration) เสร็จ ~80% แล้ว
session นี้ต้องทำ Phase 2: สร้างหน้า CRUD สำหรับข้อมูลหลักทั้ง 4 ชุด

### สิ่งที่มีอยู่แล้ว:
- tRPC routers สร้างไว้แล้ว: `event.router.ts`, `payee.router.ts`, `bank.router.ts`, `companyBank.router.ts`
- GoogleSheetsService มี methods พร้อมแล้ว: getEvents(), getPayees(), getBanks(), appendRow(), updateById(), deleteById() ฯลฯ
- หน้า page.tsx สร้างไว้แล้ว: events, payees, banks (แต่ยังไม่มี UI จริง — ต้องสร้าง)
- SearchableSelect component มีพร้อมใช้งาน

### Task List — เรียงลำดับความสำคัญ:

**1. Events CRUD** (สำคัญสุด — LINE เลือก project จากตรงนี้)
- หน้า list: ตาราง EventName, Budget, StartDate, EndDate, Status
- Create/Edit modal: ชื่อ, งบประมาณ, วันที่เริ่ม-สิ้นสุด, สถานะ, รายละเอียด
- Delete (soft delete — เปลี่ยน status เป็น inactive)
- เชื่อม tRPC → GoogleSheetsService

**2. Payees CRUD** (สำคัญ — ใช้ในตั้งเบิก + OCR auto-match)
- หน้า list: ตาราง PayeeName, TaxID, BranchType, BankAccount, IsVAT, DefaultWTH
- Create/Edit modal: ชื่อ, Tax ID, ประเภทสาขา (HQ/Branch), เลขสาขา, บัญชีธนาคาร, VAT, WHT default, ที่อยู่, เบอร์โทร, อีเมล
- Delete

**3. Company Banks CRUD** (ใช้ในตั้งเบิก — เลือกบัญชีจ่าย)
- หน้า list: ตาราง BankName, AccountNumber, AccountName, Branch, IsDefault
- Create/Edit modal
- Delete

**4. Event Assignments** (มอบหมายคนเข้าโปรเจกต์)
- UI ในหน้า Event detail หรือ modal
- เลือก member → assign เข้า event

### แนวทาง UI:
- ใช้ Tailwind CSS v4 (ไม่ใช้ config file, ใช้ @theme ใน globals.css)
- ใช้ SearchableSelect component สำหรับ dropdown ทั้งหมด
- Modal สำหรับ create/edit (เหมือน payment-modal ที่มีอยู่)
- Responsive table สำหรับ list
- Permission check: ใช้ tRPC middleware `permissionProcedure("manageEvents")` ฯลฯ

### คำสั่ง dev:
```
cd aim-expense && npm run dev
```

### ⚠️ สิ่งที่ต้องระวัง:
- Tailwind v4 ใช้ `@theme` ใน CSS ไม่ใช่ `tailwind.config.ts`
- Google Sheets เป็น user's data — ต้อง resolve orgContext + get accessToken ก่อนเรียก service
- tRPC routers มีอยู่แล้วแต่บาง procedure อาจยังเป็น skeleton (TODO) — ต้องเช็คและ implement ให้ครบ

เริ่มจาก Events CRUD ก่อนเลยค่ะ เพราะเป็นตัวหลักที่ LINE + Web ใช้ร่วมกัน
