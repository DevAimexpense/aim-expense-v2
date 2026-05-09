# Sub-processors — Aim Expense

> ผู้ประมวลผลข้อมูลบุคคลที่สามที่เราใช้บริการ — เป็นไปตามมาตรา 25 PDPA และ
> ใช้เป็นเอกสารแนบใน Data Processing Agreement (DPA) สำหรับลูกค้า B2B
>
> ปรับปรุง: 2026-05-09

| Sub-processor | บริการที่ใช้ | ที่จัดเก็บข้อมูล | ข้อมูลที่ส่ง | ฐานทางกฎหมาย / safeguards |
|---------------|--------------|------------------|--------------|---------------------------|
| **Google LLC** | Google Sheets API, Google Drive API, Google OAuth (Sign-In) | USA | OAuth tokens (encrypted at rest in our DB), business data (in user's own Drive — we do not see content beyond what we read on demand) | Google Cloud DPA + SCC |
| **Supabase** | Postgres (managed) | Singapore (ap-southeast-1) | User/Org/Subscription metadata, encrypted OAuth tokens, audit log | Supabase DPA + SCC |
| **Vercel** | Hosting + serverless functions | USA primary, Singapore edge | All HTTP requests transit; access logs (≤30d) | Vercel DPA + SCC |
| **LINE Corporation** | LINE Login (OAuth), LINE Messaging API | Japan | LINE User ID, profile, messages and images sent to OA | LINE Provider Terms |
| **Upstash, Inc.** | Redis (REST API) — sheets cache | Singapore | Cached row data from user's Sheets (TLS in transit, encrypted at rest, TTL 30s) | Upstash DPA + SCC |
| **AksonOCR (Akson Co., Ltd.)** | Thai-OCR primary | Thailand | Receipt images (deleted by us after parsing) | Domestic — PDPA inter-controller flow |
| **OpenAI, L.L.C.** | GPT-4o OCR fallback | USA | Receipt images (only when fallback fires; toggle-able) | OpenAI Business Terms (no-training opt-out) |
| **Stripe, Inc.** | Subscription billing (future) | USA | Card token, billing email, plan, amount | Stripe DPA + SCC |
| **Sentry (Functional Software)** | Error monitoring (Phase 3 S25) | USA | Stack traces, request metadata (NO receipt content; PII scrubbed) | Sentry DPA + SCC |

---

## หมายเหตุ — ระบบที่ไม่ใช่ sub-processor

- **Cloudflare** (CDN ปกติของ Vercel) — เป็น sub-processor ของ Vercel
- **Apple/Google fonts** (CDN font) — ไม่มีการส่ง PII; แค่ font assets
- **Google Cloud Logging** (สำหรับ Sheets API) — sub-processor ของ Google

## ตารางการแจ้งเปลี่ยนแปลง (Notification of changes)

หากเราเพิ่มหรือเปลี่ยน sub-processor ที่มีผลกระทบกับการประมวลผลข้อมูลส่วนบุคคล
เราจะแจ้งทาง email + in-app banner อย่างน้อย 14 วันก่อนเริ่มใช้

ลูกค้า B2B (พนักงาน enterprise plan) มีสิทธิคัดค้าน sub-processor ใหม่ภายใน 14 วัน
หากคัดค้านได้รับการรับรองโดยเรา ลูกค้าอาจระงับการใช้บริการได้โดยไม่เสียค่าธรรมเนียม
จนกว่าเราจะเปลี่ยนสถาปัตยกรรม
