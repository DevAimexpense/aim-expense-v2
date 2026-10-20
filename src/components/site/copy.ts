// ===========================================
// ข้อความหน้าแรก + FAQ ของเว็บสาธารณะ (TH/EN) — แหล่งเดียว ใช้ทั้ง landing, /faq และ JSON-LD
//
// กติกา (ตาม aim-hr): ห้ามตัวเลขผู้ใช้/รีวิว/ดาวปลอม · ทุกข้อความต้องตรงกับที่ระบบทำได้จริง
// ไม่กล่าวถึง ภ.พ.30 (พี่พิม 2026-10-20) · คำตอบ FAQ เขียนแบบ "ตอบก่อน แล้วค่อยอธิบาย" เพื่อ AEO
// ===========================================

import type { Lang } from "@/lib/site-lang";

export const HOME = {
  th: {
    hero: {
      h1a: "บัญชีและภาษีของ SME ไทย",
      h1b: "จบได้ในแชต LINE",
      sub: "ถ่ายใบเสร็จส่งในแชต ระบบบันทึกค่าใช้จ่ายให้ทันที ออกใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน ใบกำกับภาษี และหนังสือรับรองหัก ณ ที่จ่ายบนฟอร์มกรมสรรพากร — ข้อมูลทั้งหมดอยู่ใน Google Sheet ของคุณเอง",
      ctaStart: "เริ่มฟรีด้วย LINE",
      ctaPricing: "ดูแพ็กเกจและราคา",
      facts: ["ทดลอง Pro ฟรี 30 วัน ไม่ต้องใช้บัตร", "ตั้งค่าเสร็จใน 5 นาที", "ข้อมูลเป็นของคุณ 100%"],
    },
    mock: {
      online: "ออนไลน์", receiptRead: "อ่านใบเสร็จแล้ว", total: "ยอดรวม", vat: "VAT 7%", project: "โปรเจกต์", save: "บันทึกเป็นรายจ่าย",
      docTitle: "เอกสารที่ออกได้", docs: ["ใบกำกับภาษี", "หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)", "ภ.ง.ด.3 / ภ.ง.ด.53", "ใบเสร็จรับเงิน"],
    },
    stories: {
      title: "สามงานที่กินเวลาเจ้าของกิจการมากที่สุด ทำให้เหลือไม่กี่แตะ",
      items: [
        {
          title: "บันทึกค่าใช้จ่ายในแชตที่ใช้อยู่แล้ว",
          desc: "ถ่ายใบเสร็จส่งใน LINE เดี่ยวหรือกลุ่มทีม ระบบอ่านยอด ร้านค้า และภาษีด้วย OCR แล้วผูกเข้าโปรเจกต์ให้ ไม่ต้องคีย์ซ้ำ ไม่ต้องติดตั้งแอปใหม่",
          points: ["OCR อ่านใบเสร็จไทย", "พิมพ์สั้น ๆ ในแชตก็บันทึกได้", "ผูกโปรเจกต์และหมวดอัตโนมัติ"],
        },
        {
          title: "ออกเอกสารภาษีไทยได้ถูกต้องโดยไม่ต้องเป็นนักบัญชี",
          desc: "ใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน ใบกำกับภาษี เลขรันอัตโนมัติ หนังสือรับรองหัก ณ ที่จ่ายพิมพ์ลงบนฟอร์ม 50 ทวิ ของกรมสรรพากร และสรุป ภ.ง.ด.3 / ภ.ง.ด.53 รายเดือนพร้อมนำส่ง",
          points: ["ธุรกิจไม่จด VAT ออกใบเสร็จรับเงินได้ทันที", "ฟอร์ม 50 ทวิ ของจริง ไม่ใช่แบบเลียนแบบ", "เอกสารทุกใบบันทึกลง Google Drive ของคุณ"],
        },
        {
          title: "คุมงบรายโปรเจกต์ อนุมัติในแชต ไม่ต้องไล่ถามในกลุ่ม",
          desc: "ตั้งเบิก อนุมัติ เตรียมจ่าย และเคลียร์งบเป็นขั้นตอน เห็นงบคงเหลือและกำไรต่อโปรเจกต์ทันที เหมาะทั้งนิติบุคคลและฟรีแลนซ์ที่ดูแลหลายงานพร้อมกัน",
          points: ["ตั้งเบิก → อนุมัติ → เตรียมจ่าย → เคลียร์", "กำไร/ขาดทุนรายโปรเจกต์", "หลายธุรกิจในบัญชีเดียว"],
        },
      ],
    },
    data: {
      title: "ข้อมูลธุรกิจอยู่ใน Google Sheet ของคุณเอง ไม่ใช่ของเรา",
      desc: "ตั้งแต่วันแรก ระบบสร้าง Google Sheet และโฟลเดอร์ Drive ในบัญชี Google ของคุณ ทุกรายการ ทุกเอกสาร เขียนลงที่นั่น เราไม่เก็บสำเนาข้อมูลธุรกิจไว้บนเซิร์ฟเวอร์",
      points: ["เปิดดู กรอง ทำกราฟ ได้เหมือนไฟล์ธรรมดา", "ส่งต่อให้นักบัญชีได้ด้วยการแชร์ไฟล์", "ยกเลิกเมื่อไหร่ ไฟล์ก็ยังเป็นของคุณ"],
      sheetTab: "Payments", sheetHead: ["วันที่", "รายการ", "โปรเจกต์", "ยอด", "หัก ณ ที่จ่าย"],
      sheetRows: [
        ["05/10/2569", "ค่าถ่ายภาพงานอีเวนต์", "Event A", "12,000.00", "360.00"],
        ["06/10/2569", "ค่าเช่าสถานที่", "Event A", "25,000.00", "1,250.00"],
        ["08/10/2569", "ค่าออกแบบกราฟิก", "Brand X", "8,500.00", "255.00"],
        ["09/10/2569", "ค่าขนส่ง", "Event B", "3,200.00", "32.00"],
      ],
    },
    how: {
      title: "เริ่มได้ในสามขั้น ไม่ต้องย้ายข้อมูลเก่า",
      steps: [
        { title: "เข้าสู่ระบบด้วย LINE", desc: "ไม่ต้องสมัครบัญชีใหม่ ใช้ LINE ที่มีอยู่แล้ว" },
        { title: "เชื่อม Google ของคุณ", desc: "ระบบสร้าง Google Sheet และโฟลเดอร์ Drive ให้อัตโนมัติ" },
        { title: "ส่งใบเสร็จใบแรกในแชต", desc: "เพิ่ม OA เป็นเพื่อน ถ่ายใบเสร็จส่ง แล้วดูรายการขึ้นในระบบ" },
      ],
    },
    pricing: {
      title: "เริ่มฟรี อัปเกรดเมื่อพร้อม",
      desc: "ทุกบัญชีได้ทดลอง Pro ครบทุกฟีเจอร์ 30 วันโดยไม่ต้องใช้บัตร หมดช่วงทดลองจะกลับเป็น Free Forever ใช้ต่อได้ไม่มีกำหนด",
      tiers: [
        { name: "Free Forever", price: "฿0", note: "OCR 5 ครั้ง/เดือน · 1 ผู้ใช้" },
        { name: "Pro", price: "฿399", unit: "/เดือน", note: "เอกสารภาษีครบ · 5 ผู้ใช้ · OCR 300 ครั้ง", hot: true },
        { name: "Business", price: "฿699", unit: "/เดือน", note: "10 ผู้ใช้ · 3 ธุรกิจ · OCR 600 ครั้ง" },
      ],
      cta: "ดูทุกแพ็กเกจ",
    },
    faq: { title: "คำถามที่พบบ่อย", more: "ดูคำถามทั้งหมด" },
    cta: {
      title: "ส่งใบเสร็จใบแรกเข้าระบบได้ตั้งแต่วันนี้",
      desc: "เพิ่มเพื่อน LINE Official Account แล้วเริ่มใช้ได้ทันที ทดลอง Pro ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต",
      btn: "เริ่มฟรีด้วย LINE",
      qrLabel: "สแกนเพิ่มเพื่อน",
    },
  },
  en: {
    hero: {
      h1a: "Thai SME accounting and tax,",
      h1b: "done inside LINE chat",
      sub: "Snap a receipt in chat and the expense is logged instantly. Issue quotations, billing notes, receipts, tax invoices and withholding certificates on the Revenue Department's official form — with every record stored in your own Google Sheet.",
      ctaStart: "Start free with LINE",
      ctaPricing: "See plans and pricing",
      facts: ["30-day Pro trial, no card", "Set up in 5 minutes", "Your data, 100% yours"],
    },
    mock: {
      online: "Online", receiptRead: "Receipt scanned", total: "Total", vat: "VAT 7%", project: "Project", save: "Save as expense",
      docTitle: "Documents you can issue", docs: ["Tax invoice", "Withholding certificate (50 Tawi)", "PND 3 / PND 53", "Receipt"],
    },
    stories: {
      title: "The three jobs that eat an owner's time, reduced to a few taps",
      items: [
        {
          title: "Log expenses in the chat you already use",
          desc: "Snap a receipt in LINE, one-to-one or in a team group. OCR reads the total, vendor and tax, and links it to a project. No re-typing and no new app to install.",
          points: ["OCR built for Thai receipts", "A short typed note also works", "Project and category assigned automatically"],
        },
        {
          title: "Issue correct Thai tax documents without being an accountant",
          desc: "Quotations, billing notes, receipts and tax invoices with automatic numbering; withholding certificates printed onto the Revenue Department's 50 Tawi form; monthly PND 3 / PND 53 summaries ready to file.",
          points: ["Non-VAT businesses issue receipts right away", "The real 50 Tawi form, not a lookalike", "Every document saved to your Google Drive"],
        },
        {
          title: "Budget per project and approve in chat, not in a group thread",
          desc: "Request, approve, prepare payment and reconcile as clear steps. See remaining budget and profit per project at once. Works for companies and for freelancers juggling several jobs.",
          points: ["Request → approve → prepare → reconcile", "Profit and loss per project", "Several businesses in one account"],
        },
      ],
    },
    data: {
      title: "Your business data lives in your own Google Sheet, not ours",
      desc: "From day one the system creates a Google Sheet and Drive folder in your Google account. Every entry and every document is written there. We keep no copy of your business data on our servers.",
      points: ["Open, filter and chart it like any file", "Share the file with your accountant", "Cancel anytime; the file stays yours"],
      sheetTab: "Payments", sheetHead: ["Date", "Item", "Project", "Amount", "WHT"],
      sheetRows: [
        ["05/10/2569", "Event photography", "Event A", "12,000.00", "360.00"],
        ["06/10/2569", "Venue rental", "Event A", "25,000.00", "1,250.00"],
        ["08/10/2569", "Graphic design", "Brand X", "8,500.00", "255.00"],
        ["09/10/2569", "Transport", "Event B", "3,200.00", "32.00"],
      ],
    },
    how: {
      title: "Up and running in three steps, no data migration",
      steps: [
        { title: "Sign in with LINE", desc: "No new account; use the LINE you already have" },
        { title: "Connect your Google", desc: "A Google Sheet and Drive folder are created for you automatically" },
        { title: "Send your first receipt in chat", desc: "Add the OA as a friend, snap a receipt, and watch it appear" },
      ],
    },
    pricing: {
      title: "Start free, upgrade when ready",
      desc: "Every account gets a full-featured 30-day Pro trial with no card. After the trial you drop to Free Forever and can keep using it indefinitely.",
      tiers: [
        { name: "Free Forever", price: "฿0", note: "5 OCR scans/month · 1 user" },
        { name: "Pro", price: "฿399", unit: "/mo", note: "All tax documents · 5 users · 300 OCR scans", hot: true },
        { name: "Business", price: "฿699", unit: "/mo", note: "10 users · 3 businesses · 600 OCR scans" },
      ],
      cta: "See all plans",
    },
    faq: { title: "Frequently asked questions", more: "See all questions" },
    cta: {
      title: "Send your first receipt into the system today",
      desc: "Add the LINE Official Account as a friend and start right away. 30-day Pro trial, no credit card.",
      btn: "Start free with LINE",
      qrLabel: "Scan to add friend",
    },
  },
} as const;

/** FAQ — ใช้ทั้งหน้าแรก (6 ข้อแรก) และหน้า /faq (ทั้งหมด) · ตอบก่อน แล้วค่อยอธิบาย */
export const FAQ: Record<Lang, Array<{ q: string; a: string }>> = {
  th: [
    { q: "ต้องติดตั้งแอปไหม", a: "ไม่ต้อง ใช้ LINE ที่มีอยู่แล้ว เพิ่ม LINE Official Account ของ Aim Expense เป็นเพื่อน แล้วส่งรูปใบเสร็จหรือพิมพ์รายการในแชตได้เลย ส่วนงานที่ต้องดูภาพรวม เช่น อนุมัติ รายงาน และออกเอกสาร ทำบนเว็บได้จากทุกเครื่อง" },
    { q: "ข้อมูลธุรกิจของเราเก็บไว้ที่ไหน", a: "ใน Google Sheet และ Google Drive ของบัญชี Google ที่คุณเชื่อมไว้เอง ระบบเขียนทุกรายการและทุกเอกสารลงที่นั่น เราไม่เก็บสำเนาข้อมูลธุรกิจบนเซิร์ฟเวอร์ของเรา เก็บเฉพาะข้อมูลบัญชีผู้ใช้และการสมัครใช้งาน" },
    { q: "ธุรกิจที่ยังไม่จดทะเบียน VAT ใช้ได้ไหม", a: "ได้ ตั้งค่าบริษัทเป็น \"ไม่จดทะเบียน VAT\" แล้วระบบจะออกใบเสนอราคา ใบวางบิล และใบเสร็จรับเงินโดยไม่มีบรรทัด VAT และซ่อนเมนูใบกำกับภาษีให้ เมื่อจด VAT ภายหลังก็เปิดใช้ได้ทันที" },
    { q: "ออกใบกำกับภาษีและหนังสือรับรองหัก ณ ที่จ่ายได้ไหม", a: "ได้ ใบกำกับภาษีออกเลขเรียงอัตโนมัติพร้อมข้อมูลสาขาของลูกค้า หนังสือรับรองหัก ณ ที่จ่ายพิมพ์ลงบนฟอร์ม 50 ทวิ ของกรมสรรพากรโดยใช้วันที่จ่ายเงินจริง และระบบสรุป ภ.ง.ด.3 และ ภ.ง.ด.53 รายเดือนให้ คุณเป็นผู้นำส่งกับกรมสรรพากรเอง" },
    { q: "ฟรีแลนซ์หรือบุคคลธรรมดาใช้ได้ไหม", a: "ได้ เลือกประเภทบัญชีเป็นบุคคลธรรมดา ระบบจะปรับเมนูให้เหมาะกับการบันทึกรายรับ รายจ่าย และเก็บหนังสือรับรองหัก ณ ที่จ่ายที่ผู้ว่าจ้างออกให้ เพื่อใช้ยื่นภาษีเงินได้บุคคลธรรมดา และยังเปิดบริษัทเพิ่มในบัญชีเดียวกันได้ตามแพ็กเกจ" },
    { q: "ยกเลิกแล้วข้อมูลหายไหม", a: "ไม่หาย Google Sheet และไฟล์ใน Drive เป็นของคุณตั้งแต่แรก ยกเลิกแล้วยังเปิด ดาวน์โหลด หรือใช้ต่อได้ตามปกติ บัญชีในระบบของเราลบได้เมื่อแจ้งขอ" },
    { q: "ทีมหลายคนใช้ร่วมกันได้ไหม มีขั้นตอนอนุมัติไหม", a: "ได้ เชิญสมาชิกเข้าบริษัทพร้อมกำหนดสิทธิ์ เช่น ผู้ตั้งเบิก ผู้อนุมัติ ฝ่ายบัญชี หรือผู้จัดการโปรเจกต์ที่เห็นเฉพาะงานของตัวเอง รายการจะเดินตามขั้น ตั้งเบิก อนุมัติ เตรียมจ่าย และเคลียร์งบ จำนวนผู้ใช้ขึ้นกับแพ็กเกจ" },
    { q: "ดูแลหลายบริษัทจากบัญชีเดียวได้ไหม", a: "ได้ สลับบริษัทได้จากเมนู แต่ละบริษัทมี Google Sheet และเอกสารแยกกัน แพ็กเกจ Pro รองรับ 2 ธุรกิจ Business 3 ธุรกิจ และ Max 5 ธุรกิจ" },
    { q: "ราคาเท่าไร ทดลองใช้ได้ไหม", a: "ทุกบัญชีได้ทดลอง Pro ครบทุกฟีเจอร์ 30 วันโดยไม่ต้องใช้บัตร หมดช่วงทดลองจะกลับเป็น Free Forever ซึ่งใช้ต่อได้ไม่มีกำหนด แพ็กเกจแบบชำระเงินเริ่มที่ 189 บาทต่อเดือน ชำระผ่านบัตรเครดิตหรือเดบิต และยกเลิกได้ตลอดเวลาจากหน้าแพ็กเกจ" },
    { q: "ต่างจากโปรแกรมบัญชีทั่วไปอย่างไร", a: "สองเรื่อง หนึ่ง งานประจำวันทำในแชต LINE ที่ทีมใช้อยู่แล้ว ไม่ต้องเทรนโปรแกรมใหม่ สอง ข้อมูลทั้งหมดอยู่ใน Google Sheet ของคุณ ไม่ได้อยู่ในฐานข้อมูลของผู้ให้บริการ จึงไม่มี lock-in และส่งต่อให้นักบัญชีได้ด้วยการแชร์ไฟล์" },
  ],
  en: [
    { q: "Do I need to install an app?", a: "No. Use the LINE you already have: add the Aim Expense LINE Official Account as a friend, then send receipt photos or type entries in chat. Overview work such as approvals, reports and document issuing is done on the web from any device." },
    { q: "Where is our business data stored?", a: "In the Google Sheet and Google Drive of the Google account you connect. The system writes every entry and document there. We keep no copy of your business data on our servers, only your user account and subscription details." },
    { q: "Can a business that is not VAT-registered use it?", a: "Yes. Set the company to \"not VAT-registered\" and the system issues quotations, billing notes and receipts without a VAT line and hides the tax-invoice menu. When you register for VAT later, switch it on instantly." },
    { q: "Can it issue tax invoices and withholding certificates?", a: "Yes. Tax invoices get sequential numbers with the customer's branch details. Withholding certificates are printed onto the Revenue Department's 50 Tawi form using the actual payment date, and the system prepares monthly PND 3 and PND 53 summaries. You file them with the Revenue Department yourself." },
    { q: "Does it work for freelancers and individuals?", a: "Yes. Choose the individual account type and the menus adapt to logging income and expenses and keeping the withholding certificates your clients issue, for personal income tax filing. You can also add a company to the same account depending on your plan." },
    { q: "Do I lose my data if I cancel?", a: "No. The Google Sheet and Drive files have been yours from the start, so after cancelling you can still open, download or keep using them. Your account in our system is deleted on request." },
    { q: "Can a team share it, and is there an approval flow?", a: "Yes. Invite members to the company with roles such as requester, approver, accountant, or a project manager who only sees their own projects. Entries move through request, approve, prepare payment and reconcile. The number of users depends on your plan." },
    { q: "Can I manage several companies from one account?", a: "Yes. Switch companies from the menu; each has its own Google Sheet and documents. Pro supports 2 businesses, Business 3 and Max 5." },
    { q: "How much does it cost, and is there a trial?", a: "Every account gets a full-featured 30-day Pro trial with no card. After the trial you drop to Free Forever, which you can keep using indefinitely. Paid plans start at 189 baht per month, billed by credit or debit card, and you can cancel anytime from the plan page." },
    { q: "How is this different from ordinary accounting software?", a: "Two things. Day-to-day work happens in LINE chat, which your team already uses, so there is no new program to learn. And all data lives in your own Google Sheet rather than a vendor's database, so there is no lock-in and you can hand it to your accountant by sharing the file." },
  ],
};

export function faqJsonLd(lang: Lang, items = FAQ[lang]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
