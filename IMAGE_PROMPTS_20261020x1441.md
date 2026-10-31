# Image prompts — Aim Expense website illustrations

> สร้างด้วย gpt-image-1 / Midjourney / Imagen · ขนาด **1536×1024** (3:2) · บันทึกเป็น JPG คุณภาพ ~80 ให้ ≤ 180 KB
> วางไฟล์ที่ `public/illustrations/<ชื่อ>.jpg` แล้วเพิ่มชื่อใน `AVAILABLE` ที่ `src/components/site/feature-photo.tsx`
> สไตล์เดียวกับ `aim-hr/public/illustrations/*.jpg`: ภาพถ่ายสมจริง แสงธรรมชาติ คนทำงาน SME ไทย โทนน้ำเงินแบรนด์ (#2563eb / #1e3a8a) แต้มเหลืองเล็กน้อย (#ffd93d)
> กติกา: **ไม่มีตัวหนังสือ โลโก้ หรือหน้าจอที่อ่านออก** · ไม่สื่อว่าเป็นลูกค้าจริง · ไม่มีลายน้ำ

Common style suffix (append to every prompt):

> photorealistic editorial photo, natural window light, shallow depth of field, Thai people in a modern small-business office in Bangkok, brand palette: azure blue (#2563eb) and deep navy (#1e3a8a) in clothing/props with a small touch of warm yellow (#ffd93d), no readable text, no logos, no watermark, no visible brand names, 3:2 landscape, 1536x1024

| File | Prompt |
|---|---|
| `hero.jpg` | A Thai small-business owner in her 30s, wearing a navy blouse, holding a smartphone and photographing a paper receipt lying on a wooden desk; coffee cup, a few receipts, and a laptop slightly out of focus; warm morning light; she looks relaxed and in control. |
| `receipt.jpg` | Close-up of several crumpled and flat Thai shop receipts on a light wooden desk next to a smartphone lying face-up (screen blurred, no readable UI), a blue pen and a yellow sticky note; top-down angle; soft daylight. |
| `documents.jpg` | Neatly stacked printed invoices and tax documents on a desk, a blue document folder, a rubber stamp and a fountain pen; a Thai accountant's hands in the background arranging the papers; no readable text on the papers (slightly out of focus or blank forms). |
| `reports.jpg` | A Thai woman in a blue shirt looking at a laptop on a bright desk; the screen shows a simple blurred bar chart in blue and yellow with no readable numbers; small plant and notebook beside the laptop; side angle. |
| `team.jpg` | Three Thai colleagues in a small modern office having a relaxed discussion around a table, one holding a phone, another a tablet (screens not readable); navy and light-blue outfits; natural light from a large window. |
| `multi.jpg` | A Thai business owner standing at the entrance of a small café/shop while checking his phone, with a second storefront visible across the street; sunny afternoon; blue and yellow accents in signage without readable text. |

Alt text (already in `feature-photo.tsx`): hero "เจ้าของร้านถือมือถือถ่ายใบเสร็จบนโต๊ะทำงาน" · receipt "ใบเสร็จหลายใบวางบนโต๊ะข้างโทรศัพท์มือถือ" · documents "เอกสารภาษีและใบกำกับภาษีพิมพ์ออกมาจัดเรียงเป็นระเบียบ" · reports "แล็ปท็อปเปิดกราฟรายรับ-รายจ่ายบนโต๊ะทำงาน" · team "ทีมเล็ก ๆ ในออฟฟิศ SME กำลังคุยงานกัน" · multi "เจ้าของกิจการดูแลหลายสาขาหลายบริษัท"

> อัปเดต 20/10/2569 15:05 — สร้างครบ 6 รูปแล้วด้วย gpt-image-1 ผ่านสคริปต์ `scripts/gen-site-images.mjs` (ใช้ OPENAI_API_KEY ของโปรเจกต์) ไฟล์อยู่ที่ `public/illustrations/` ถ้าอยากสร้างใหม่ให้ลบไฟล์นั้นแล้วรันสคริปต์อีกครั้ง
