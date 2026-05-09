# Record of Processing Activities (ROPA) — Aim Expense

> สำหรับ Data Controller ตามมาตรา 39 PDPA (พรบ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562)
> สถานะ: **ฉบับร่างเพื่อ legal review**
>
> ปรับปรุง: 2026-05-09 — Aim Dev

---

## A. ข้อมูลผู้ควบคุม

| รายการ | รายละเอียด |
|--------|------------|
| ชื่อผู้ควบคุม (Controller) | บริษัท อาร์โต จำกัด |
| ที่อยู่ | TODO: ที่อยู่ตามทะเบียน |
| DPO | dpo@aimexpense.com |
| ผู้ประสานงาน | dev@aimexpense.com |

---

## B. กิจกรรมการประมวลผล (Processing Activities)

| # | Activity | ประเภทข้อมูล | เจ้าของข้อมูล (Subject) | วัตถุประสงค์ | ฐานทางกฎหมาย | ที่เก็บ | ระยะเวลาเก็บ | Sub-processor |
|---|----------|--------------|------------------------|---------------|----------------|---------|--------------|----------------|
| 1 | ลงทะเบียน + login | email, name, OAuth token, LINE user ID, รูปโปรไฟล์ | User | ระบุตัวตน, login | Contract §24(3) | Supabase Postgres (SG) | จนกว่าผู้ใช้ลบบัญชี | Google, LINE |
| 2 | ข้อมูลองค์กร | ชื่อบริษัท, taxId, ที่อยู่, Google Spreadsheet ID, Drive Folder ID | Org owner | จัดบัญชีผู้ใช้, ออกใบกำกับภาษี | Contract + Legal §24(6) | Supabase Postgres (SG) | จนกว่าผู้ใช้ลบ org | Google |
| 3 | บันทึกค่าใช้จ่าย / รายได้ (business data) | ใบเสร็จ, ใบกำกับภาษี, ลูกค้า, ผู้รับเงิน, จำนวนเงิน | Org members + ลูกค้า/ผู้รับเงิน (third-party PII) | ระบบบัญชีหลัก | Contract | **ใน Google Sheets/Drive ของ user** + Redis cache 30s | ตลอดอายุของ user (ใน Drive ของเขา) | Google, Upstash |
| 4 | OCR ใบเสร็จ | image content + OCR text | User uploads | ช่วยกรอกข้อมูล | Contract + Consent | ไม่บันทึก — return ทันที | ไม่เก็บ | AksonOCR (TH), OpenAI (US, fallback opt-out-able) |
| 5 | สร้างเอกสาร PDF | data ที่ใช้สร้าง PDF, generated PDF blob | User | ออกใบเสนอราคา/ใบวางบิล/ใบกำกับ | Contract + Legal | บัฟเฟอร์ใน browser ระหว่าง render เท่านั้น | ไม่เก็บ (user save ลง Drive ของเขา) | Google Drive |
| 6 | LINE notification | LINE User ID, ข้อความ + รูปใบเสร็จ | User + LINE OA followers | แจ้งเตือน + รับใบเสร็จ | Consent §24(1) | ผ่าน LINE Messaging API + Supabase tracking | drafts ลบ 7 วัน | LINE |
| 7 | Subscription + billing | Stripe customer ID, plan, billing email, history | Org owner | คิดเงิน | Contract | Stripe + Supabase Postgres (SG) | 7 ปี (พรบ. การบัญชี) | Stripe (future) |
| 8 | Audit log | userId, orgId, action, entityRef, summary | Org members | ตรวจสอบความปลอดภัย | Legitimate interest §24(5) | Supabase Postgres (SG) | 1 ปี | (ภายใน) |
| 9 | Technical logs | IP, user agent, request URL, status code, timestamps | All users | troubleshoot + security | Legitimate interest | Vercel logs | 30 วัน | Vercel |
| 10 | Error tracking (Sentry) | stack trace, request metadata (no receipt content) | All users | bug fixing | Legitimate interest | Sentry (US) | 90 วัน | Sentry |
| 11 | Performance cache (Redis) | row snapshots ของ user's sheets | All users + their org's customers/vendors | ลด Sheets API quota usage | Legitimate interest | Upstash Redis (SG) | TTL 30s + invalidate on write | Upstash |

---

## C. การโอนข้อมูลข้ามประเทศ (Cross-border Transfers)

| ปลายทาง | ประเทศ | ฐานการโอน |
|---------|--------|-----------|
| Google | USA | SCC (Google Cloud DPA) |
| LINE | Japan | SCC (LINE Provider Terms) |
| OpenAI | USA | SCC (OpenAI Business Terms) |
| Sentry | USA | SCC (Sentry DPA) |
| Stripe | USA | SCC (Stripe DPA) |
| Vercel | USA / Singapore | SCC (Vercel DPA) |
| Supabase | Singapore | ภายใน ASEAN — adequacy / SCC |
| Upstash | Singapore | ภายใน ASEAN — adequacy / SCC |
| AksonOCR | Thailand | ในประเทศ — ไม่มีการโอน |

---

## D. มาตรการรักษาความปลอดภัย (Technical & Organisational Measures)

- HTTPS/TLS 1.2+ บังคับ
- AES-256 encryption ของ OAuth tokens ก่อนเก็บ
- Role-based access control + per-user permission keys (PDPA-aligned least privilege)
- Audit log on all mutations
- ไม่มี password store (OAuth-only)
- Sub-processor list reviewed quarterly
- Backup ของ Supabase (managed, daily) — encrypted at rest
- Incident response plan — ดู [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)
- Annual employee privacy training (TODO post-launch)

---

## E. การประเมินผลกระทบ (DPIA — when triggered)

ตาม PDPA §39(2) ต้องทำ DPIA สำหรับการประมวลผลที่มีความเสี่ยงสูง.

ปัจจุบัน Aim Expense ไม่มีกิจกรรมที่จัดเป็นความเสี่ยงสูง (ไม่ profile, ไม่ใช้ AI ตัดสิน,
ไม่เก็บข้อมูลอ่อนไหว). หากเพิ่ม feature เช่น automated approval หรือ credit scoring
ต้องทำ DPIA ก่อนเปิดให้บริการ.
