# Incident Response Runbook — Aim Expense

> ขั้นตอนการตอบสนองเหตุการณ์ละเมิดข้อมูลส่วนบุคคล (Data Breach)
> Reference: PDPA §37 — แจ้ง PDPC ภายใน 72 ชม., แจ้งเจ้าของข้อมูลถ้าความเสี่ยงสูง
>
> ปรับปรุง: 2026-05-09

---

## 0. นิยาม "เหตุการณ์ละเมิด"

การกระทำใด ๆ ที่ทำให้ข้อมูลส่วนบุคคลถูก:
- **เข้าถึง** โดยบุคคลที่ไม่ได้รับอนุญาต
- **เปลี่ยนแปลง** โดยไม่ได้รับอนุญาต
- **สูญหาย** อย่างถาวร
- **เปิดเผย** ต่อสาธารณะหรือ third party ที่ไม่ควร

ตัวอย่าง:
- มีคนเข้าถึง Supabase DB ผ่าน leaked SUPABASE_SERVICE_ROLE_KEY
- เพื่อนร่วมทีมกด deploy โดย env file มี secret รั่ว
- Vercel logs ถูก dump
- Bug ทำให้ user A เห็น org ของ user B
- Upstash Redis snapshot leak

---

## 1. ทีม Incident Response

| บทบาท | ผู้รับผิดชอบ |
|-------|--------------|
| Incident Commander (IC) | dev@aimexpense.com (พี่เอม) |
| DPO | dpo@aimexpense.com |
| Comms / Legal | dev@aimexpense.com (เปลี่ยนเมื่อมี outside counsel) |
| Engineering | dev@aimexpense.com |

ในระยะเริ่มต้น 1 คนทำหลายบทบาท. หลัง launch + scale ค่อยแยก.

---

## 2. ขั้นตอน

### Phase 1 — Detect (ตรวจพบ)

แหล่งที่อาจตรวจพบ:
- Sentry error spike
- Vercel uptime down
- Supabase audit log ผิดปกติ
- User report ผ่าน support@
- Google Cloud Console security alert
- Auto-scan tool

### Phase 2 — Contain (T+0 ถึง 4 ชม.)

1. **หยุดการแพร่กระจาย** — disable api keys, rotate secrets, freeze deploys
2. **บันทึก timeline** — เริ่มเขียน incident log (Markdown ใน Notion/Drive — ไม่ใช่ลงใน app เอง)
3. **Snapshot evidence** — Vercel logs, Supabase audit, Sentry events
4. **กำหนด severity:**
   - **P0** — ข้อมูลรั่วต่อสาธารณะ, ต้องแจ้ง PDPC + ผู้ใช้
   - **P1** — ข้อมูลรั่วภายในแต่จำกัด ต้องแจ้ง PDPC
   - **P2** — ระบบติดขัดแต่ไม่มี data exposure ไม่ต้องแจ้ง PDPC แต่บันทึกไว้

### Phase 3 — Eradicate (T+4 ถึง 24 ชม.)

1. ระบุสาเหตุ (root cause)
2. แก้ไข (fix code, rotate secret, revoke session)
3. ตรวจสอบไม่ให้มีจุดอื่นที่ vulnerable

### Phase 4 — Notify (T+0 ถึง 72 ชม.)

#### A. แจ้ง PDPC (ถ้า severity ≥ P1)

- ผ่านระบบ e-Notification ของ PDPC: https://www.pdpc.or.th
- ภายใน **72 ชั่วโมง** (PDPA §37(2))
- ระบุ: ลักษณะ + ขอบเขต + จำนวน data subjects + มาตรการแก้ไข + ผลกระทบที่อาจตามมา

#### B. แจ้ง Data Subjects (ถ้าความเสี่ยงสูง — PDPA §37(4))

ส่ง email + in-app banner + LINE OA broadcast:
- เกิดอะไรขึ้น
- ข้อมูลใดได้รับผลกระทบ
- ความเสี่ยงต่อตัวเขา
- มาตรการที่เราทำแล้ว
- ขั้นตอนที่ผู้ใช้ควรทำ (เปลี่ยนรหัส, ตรวจ statement, ฯลฯ)
- ติดต่อ DPO ได้ที่: dpo@aimexpense.com

#### C. แจ้งลูกค้า B2B (Customer ตาม DPA)

ส่ง email ถึง org admin ภายใน **48 ชั่วโมง** (ก่อน 72 ชม. ของ PDPC)
ระบุข้อมูลตามที่กำหนดในส่วน 9 ของ DPA

### Phase 5 — Recover

1. Service restore (ถ้ามี downtime)
2. Communications follow-up (post-mortem update)

### Phase 6 — Lessons Learned (T+1 ถึง 2 สัปดาห์)

1. **Post-mortem document** (blameless) — root cause + timeline + lessons
2. ปรับ runbook นี้
3. เพิ่ม test / monitoring ที่ป้องกันซ้ำ

---

## 3. Templates

### 3.1 PDPC notification email (TH)

```
หัวข้อ: แจ้งเหตุการณ์ละเมิดข้อมูลส่วนบุคคล — บริษัท อาร์โต จำกัด

เรียน คณะกรรมการคุ้มครองข้อมูลส่วนบุคคล,

ข้าพเจ้าขอแจ้งเหตุการณ์ละเมิดข้อมูลส่วนบุคคลตามมาตรา 37 พรบ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562

1. ผู้ควบคุมข้อมูล: บริษัท อาร์โต จำกัด, [ที่อยู่]
2. DPO: dpo@aimexpense.com
3. ลักษณะการละเมิด: [...]
4. ขอบเขต: ข้อมูลที่ได้รับผลกระทบประมาณ X ราย
5. ประเภทข้อมูล: [...]
6. ความเสี่ยงที่อาจเกิดต่อเจ้าของข้อมูล: [...]
7. มาตรการที่ดำเนินการแล้ว: [...]
8. มาตรการที่จะดำเนินการต่อไป: [...]
9. ติดต่อ: dev@aimexpense.com / 02-XXX-XXXX

ขอแสดงความนับถือ,
[ชื่อ]
[ตำแหน่ง]
```

### 3.2 Data Subject notification email (TH)

```
หัวข้อ: แจ้งเหตุการณ์ที่อาจกระทบข้อมูลส่วนบุคคลของท่าน

เรียน ผู้ใช้บริการ Aim Expense,

ในวันที่ [วันที่] เราตรวจพบเหตุการณ์ที่อาจส่งผลต่อข้อมูลส่วนบุคคลของท่าน

[คำอธิบายสั้น ๆ ที่เข้าใจได้]

ข้อมูลที่ได้รับผลกระทบ: [...]
ความเสี่ยง: [...]

มาตรการที่เราทำ:
- [...]

สิ่งที่ท่านควรทำ:
- [...]

หากมีคำถามติดต่อ DPO ที่: dpo@aimexpense.com
ติดต่อ PDPC: https://www.pdpc.or.th

ขออภัยในความไม่สะดวกอย่างสูง

ทีมงาน Aim Expense
```

---

## 4. Pre-incident Checklist (ทำตอนนี้)

- [ ] กำหนด IC + DPO + comms (ทำแล้ว — แต่ทุกบทบาทเป็น dev@ คนเดียว)
- [ ] Sentry setup (Phase 3 S25)
- [ ] Vercel uptime monitor (Phase 3 S25)
- [ ] Status page (TODO post-launch)
- [ ] Backup test ของ Supabase (TODO post-launch)
- [ ] Tabletop exercise — ลอง drill incident response (TODO post-launch)
- [ ] Cyber insurance (TODO ถ้าเริ่มมีลูกค้า enterprise)
