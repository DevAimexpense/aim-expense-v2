# Aim Expense — Legal & Compliance Docs

> ฉบับร่างเพื่อ legal review (ก่อน soft launch)
> ปรับปรุง: 2026-05-09

ทุกเอกสารในโฟลเดอร์นี้เป็น **draft** สำหรับใช้เป็นจุดเริ่มต้นเข้าทนาย —
**ห้ามเผยแพร่ก่อน lawyer ให้ผ่าน**

## สารบัญ

| ไฟล์ | จุดประสงค์ | ผู้อ่าน |
|------|-----------|--------|
| [PRIVACY_POLICY_TH.md](PRIVACY_POLICY_TH.md) | นโยบายความเป็นส่วนตัว (PDPA-aligned) | ผู้ใช้ทั่วไป |
| [PRIVACY_POLICY_EN.md](PRIVACY_POLICY_EN.md) | ฉบับภาษาอังกฤษ | ผู้ใช้ international |
| [TERMS_OF_SERVICE_TH.md](TERMS_OF_SERVICE_TH.md) | ข้อกำหนดบริการ | ผู้ใช้ทั่วไป |
| [TERMS_OF_SERVICE_EN.md](TERMS_OF_SERVICE_EN.md) | ฉบับภาษาอังกฤษ | ผู้ใช้ international |
| [SUB_PROCESSORS.md](SUB_PROCESSORS.md) | รายชื่อ sub-processor + ที่เก็บข้อมูล | ลูกค้า B2B / regulator |
| [DPA_TEMPLATE.md](DPA_TEMPLATE.md) | Data Processing Agreement | ลูกค้า B2B (business+) |
| [ROPA.md](ROPA.md) | Record of Processing Activities (PDPA §39) | regulator (PDPC) + internal |
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | Runbook ตอบสนองเหตุละเมิด | internal |

## Pre-launch checklist

- [ ] ส่ง draft ทั้งหมดให้ทนายตรวจ (ประมาณ 15-20K บาท / ~1 สัปดาห์)
- [ ] กรอกที่อยู่ + เบอร์โทรบริษัท ในทุกเอกสาร (ค้น "TODO:" ใน docs/legal/)
- [ ] สร้าง mailbox: dpo@aimexpense.com (forward → dev@aimexpense.com ก็ได้)
- [ ] สร้าง mailbox: support@aimexpense.com
- [ ] Render เอกสารเป็น HTML ที่ /privacy + /terms (ผ่าน app)
- [ ] เพิ่ม footer link ในทุกหน้าหลัง login
- [ ] เพิ่ม sign-up checkbox "ยอมรับข้อกำหนด + นโยบายความเป็นส่วนตัว"
- [ ] เพิ่ม /account/data — DSR flow (ขอข้อมูล / ลบบัญชี)
- [ ] Setup Sentry + Vercel Analytics (Phase 3 S25)
- [ ] Backup ของ Supabase test
- [ ] Tabletop exercise incident response

## หลังเปิดบริการ — รอบการ review

- ทุก 6 เดือน: review sub-processor list
- ทุกปี: re-review Privacy + Terms + ROPA
- เมื่อมีการเปลี่ยน feature สำคัญ: update ROPA ก่อน

## Source of truth

ROPA.md = source of truth สำหรับ data flow.
หาก feature ใหม่เพิ่ม processing activity → update ROPA + (ถ้าจำเป็น) Privacy Policy ด้วย
