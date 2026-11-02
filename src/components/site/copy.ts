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
      title1: "ค่าใช้จ่ายทั้งบริษัท",
      title2: "จบใน LINE",
      title3: "ถ่ายใบเสร็จ ส่ง แล้วจบ",
      sub: "Aim Expense บันทึกค่าใช้จ่ายจากรูปใบเสร็จในแชต LINE ออกใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน ใบกำกับภาษี และหนังสือรับรองหัก ณ ที่จ่ายบนฟอร์มกรมสรรพากร โดยข้อมูลทั้งหมดอยู่ใน Google Sheet ของคุณเอง",
      ctaStart: "ทดลองใช้ฟรี 30 วัน",
      ctaPricing: "ดูแพ็กเกจและราคา",
      facts: ["ไม่ต้องติดตั้งแอป", "ตั้งค่าเสร็จใน 5 นาที", "ข้อมูลเป็นของคุณ 100%"],
      heroAlt: "เจ้าของร้านถือมือถือถ่ายใบเสร็จบนโต๊ะทำงาน",
      chat: {
        from: "Aim Expense", time: "09:41",
        imageAlt: "รูปถ่ายใบเสร็จ",
        typing: "กำลังอ่านใบเสร็จ…",
        cardTitle: "อ่านใบเสร็จแล้ว",
        rows: [["ร้านค้า", "Café Co."], ["ยอดรวม", "฿120.00"], ["VAT 7%", "฿7.85"], ["หมวด", "ค่ารับรอง"]],
        done: "บันทึกลง Google Sheet แล้ว ✓",
        doneSub: "Event A · ค่ารับรอง",
        textMsg: "ค่าแท็กซี่ไปหาลูกค้า 250",
        textDone: "บันทึกแล้ว ✓ ค่าเดินทาง ฿250",
        textDoneSub: "พิมพ์สั้น ๆ ก็บันทึกได้ ไม่ต้องมีรูป",
      },
    },
    mock: {
      online: "ออนไลน์", receiptRead: "อ่านใบเสร็จแล้ว", total: "ยอดรวม", vat: "VAT 7%", project: "โปรเจกต์", save: "บันทึกเป็นรายจ่าย",
      docTitle: "เอกสารที่ออกได้", docs: ["ใบกำกับภาษี", "หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)", "ภ.ง.ด.3 / ภ.ง.ด.53", "ใบเสร็จรับเงิน"],
    },
    stories: {
      title: "สามงานที่กินเวลาเจ้าของกิจการมากที่สุด ทำให้เหลือไม่กี่แตะ",
      sub: "ออกแบบจากงานจริงของ SME ไทย ไม่ใช่จากฟีเจอร์ลิสต์ของโปรแกรมบัญชีองค์กรใหญ่",
      more: "ดูรายละเอียด",
      items: [
        {
          kicker: "บันทึกค่าใช้จ่าย", anchor: "capture", photo: "receipt" as const,
          title: "บันทึกค่าใช้จ่ายในแชตที่ใช้อยู่แล้ว",
          desc: "ถ่ายใบเสร็จส่งใน LINE เดี่ยวหรือกลุ่มทีม ระบบอ่านยอด ร้านค้า และภาษีด้วย OCR แล้วผูกเข้าโปรเจกต์ให้ ไม่ต้องคีย์ซ้ำ ไม่ต้องติดตั้งแอปใหม่",
          points: ["OCR อ่านใบเสร็จไทย", "พิมพ์สั้น ๆ ในแชตก็บันทึกได้", "ผูกโปรเจกต์ให้อัตโนมัติจากกลุ่มที่ส่ง"],
        },
        {
          kicker: "เอกสารภาษีและหัก ณ ที่จ่าย", anchor: "documents", photo: "documents" as const,
          title: "ออกเอกสารภาษีไทยได้ถูกต้องโดยไม่ต้องเป็นนักบัญชี",
          desc: "ใบเสนอราคา ใบวางบิล ใบเสร็จรับเงิน ใบกำกับภาษี เลขรันอัตโนมัติ หนังสือรับรองหัก ณ ที่จ่ายพิมพ์ลงบนฟอร์ม 50 ทวิ ของกรมสรรพากร และสรุป ภ.ง.ด.3 / ภ.ง.ด.53 รายเดือนพร้อมนำส่ง",
          points: ["ธุรกิจไม่จด VAT ออกใบเสร็จรับเงินได้ทันที", "ฟอร์ม 50 ทวิ ของจริง ไม่ใช่แบบเลียนแบบ", "เอกสารทุกใบบันทึกลง Google Drive ของคุณ"],
        },
        {
          kicker: "รายงาน งบ และการอนุมัติ", anchor: "reports", photo: "reports" as const,
          title: "คุมงบรายโปรเจกต์ อนุมัติในแชต ไม่ต้องไล่ถามในกลุ่ม",
          desc: "ตั้งเบิก อนุมัติ เตรียมจ่าย และเคลียร์งบเป็นขั้นตอน เห็นงบคงเหลือของแต่ละโปรเจกต์ทันที เหมาะทั้งนิติบุคคลและฟรีแลนซ์ที่ดูแลหลายงานพร้อมกัน",
          points: ["ตั้งเบิก → อนุมัติ → เตรียมจ่าย → เคลียร์", "งบประมาณและยอดคงเหลือรายโปรเจกต์", "หลายธุรกิจในบัญชีเดียว"],
        },
      ],
    },
    data: {
      title: "ข้อมูลธุรกิจอยู่ใน Google Sheet ของคุณเอง ไม่ใช่ของเรา",
      desc: "ตั้งแต่วันแรก ระบบสร้าง Google Sheet และโฟลเดอร์ Drive ในบัญชี Google ของคุณ ทุกรายการ ทุกเอกสาร เขียนลงที่นั่น เราไม่เก็บสำเนาข้อมูลธุรกิจไว้บนเซิร์ฟเวอร์",
      points: ["เปิดดู กรอง ทำกราฟ ได้เหมือนไฟล์ธรรมดา", "ส่งต่อให้นักบัญชีได้ด้วยการแชร์ไฟล์", "ยกเลิกเมื่อไหร่ ไฟล์ก็ยังเป็นของคุณ"],
      sheetFile: "Aim Expense — บริษัทของคุณ", sheetHint: "Google Sheets · ไดรฟ์ของฉัน",
      sheetTabs: ["Events", "Payments", "Billings", "TaxInvoices"],
      sheetHead: ["PaymentDate", "Description", "EventID", "GTTLAmount", "Status"],
      sheetRows: [
        ["05/10/2569", "ค่าถ่ายภาพงานอีเวนต์", "Event A", "12,000.00", "จ่ายแล้ว"],
        ["06/10/2569", "ค่าเช่าสถานที่", "Event A", "25,000.00", "อนุมัติแล้ว"],
        ["08/10/2569", "ค่าออกแบบกราฟิก", "Brand X", "8,500.00", "รออนุมัติ"],
        ["09/10/2569", "ค่าขนส่ง", "Event B", "3,200.00", "จ่ายแล้ว"],
        ["09/10/2569", "ค่ากาแฟรับรองลูกค้า", "Event B", "120.00", "จ่ายแล้ว"],
      ],
      sheetCaption: "ตัวอย่างแท็บ Payments ใน Google Sheet ที่ระบบสร้างให้ — ข้อมูลสมมติ",
    },
    how: {
      title: "เริ่มได้ในสามขั้น ไม่ต้องย้ายข้อมูลเก่า",
      sub: "ตั้งค่าเองได้ใน 5 นาที ถ้าติดตรงไหนทักมาที่ LINE OA ทีมงานช่วยตั้งค่าให้ฟรี",
      steps: [
        { title: "เข้าสู่ระบบด้วย LINE", desc: "ไม่ต้องสมัครบัญชีใหม่ ใช้ LINE ที่มีอยู่แล้ว" },
        { title: "เชื่อม Google ของคุณ", desc: "ระบบสร้าง Google Sheet และโฟลเดอร์ Drive ให้อัตโนมัติ" },
        { title: "ส่งใบเสร็จใบแรกในแชต", desc: "เพิ่ม OA เป็นเพื่อน ถ่ายใบเสร็จส่ง แล้วดูรายการขึ้นในระบบ" },
      ],
    },
    pricing: {
      eyebrow: "ราคา",
      title: "เริ่มต้นเดือนละ 189 บาท ทดลอง Pro ฟรี 30 วันก่อน",
      desc: "ทุกบัญชีได้ทดลอง Pro ครบทุกฟีเจอร์ 30 วันโดยไม่ต้องใช้บัตร หมดช่วงทดลองค่อยเลือกแพ็กเกจที่พอดีกับทีม ยกเลิกได้ตลอดเวลา",
      monthly: "รายเดือน", yearly: "รายปี", yearlyHint: "จ่ายรายปี เหมือนได้ใช้ฟรี 2 เดือน",
      perMonth: "/เดือน", perYear: "/ปี", recommended: "แนะนำ",
      choose: "เลือกแพ็กเกจ",
      users: "ผู้ใช้", businesses: "ธุรกิจ", ocr: "OCR/เดือน", unlimited: "ไม่จำกัด",
      cta: "ดูทุกแพ็กเกจและตารางเปรียบเทียบ",
    },
    faq: { title: "คำถามที่พบบ่อย", more: "ดูคำถามทั้งหมด" },
    cta: {
      title: "ส่งใบเสร็จใบแรกเข้าระบบได้ตั้งแต่วันนี้",
      desc: "ทดลอง Pro ฟรี 30 วัน ครบทุกฟีเจอร์ ไม่ต้องใช้บัตรเครดิต ถูกใจค่อยเลือกแพ็กเกจ เริ่มต้นเดือนละ 189 บาท",
      btn: "ทดลองใช้ฟรี 30 วัน",
      qrLabel: "สแกนเพิ่มเพื่อน",
      qrSub: "สอบถามหรือเริ่มใช้ผ่าน LINE OA",
    },
  },
  en: {
    hero: {
      title1: "Every company expense,",
      title2: "done in LINE",
      title3: "Snap the receipt. Send. Done.",
      sub: "Aim Expense logs expenses from receipt photos in LINE chat and issues quotations, billing notes, receipts, tax invoices and withholding certificates on the Revenue Department's official form — with every record stored in your own Google Sheet.",
      ctaStart: "Start 30-day free trial",
      ctaPricing: "See plans and pricing",
      facts: ["No app to install", "Set up in 5 minutes", "Your data, 100% yours"],
      heroAlt: "A shop owner photographing a receipt with a phone at a desk",
      chat: {
        from: "Aim Expense", time: "09:41",
        imageAlt: "Photo of a receipt",
        typing: "Reading the receipt…",
        cardTitle: "Receipt read",
        rows: [["Vendor", "Café Co."], ["Total", "฿120.00"], ["VAT 7%", "฿7.85"], ["Category", "Entertainment"]],
        done: "Saved to Google Sheet ✓",
        doneSub: "Event A · Entertainment",
        textMsg: "Taxi to client meeting 250",
        textDone: "Saved ✓ Travel ฿250",
        textDoneSub: "A short text works too, no photo needed",
      },
    },
    mock: {
      online: "Online", receiptRead: "Receipt scanned", total: "Total", vat: "VAT 7%", project: "Project", save: "Save as expense",
      docTitle: "Documents you can issue", docs: ["Tax invoice", "Withholding certificate (50 Tawi)", "PND 3 / PND 53", "Receipt"],
    },
    stories: {
      title: "The three jobs that eat an owner's time, reduced to a few taps",
      sub: "Designed from the real work of Thai SMEs, not from an enterprise feature list",
      more: "See details",
      items: [
        {
          kicker: "Expense capture", anchor: "capture", photo: "receipt" as const,
          title: "Log expenses in the chat you already use",
          desc: "Snap a receipt in LINE, one-to-one or in a team group. OCR reads the total, vendor and tax, and links it to a project. No re-typing and no new app to install.",
          points: ["OCR built for Thai receipts", "A short typed note also works", "Linked to the project of the group it was sent in"],
        },
        {
          kicker: "Tax documents and withholding", anchor: "documents", photo: "documents" as const,
          title: "Issue correct Thai tax documents without being an accountant",
          desc: "Quotations, billing notes, receipts and tax invoices with automatic numbering; withholding certificates printed onto the Revenue Department's 50 Tawi form; monthly PND 3 / PND 53 summaries ready to file.",
          points: ["Non-VAT businesses issue receipts right away", "The real 50 Tawi form, not a lookalike", "Every document saved to your Google Drive"],
        },
        {
          kicker: "Reports, budgets and approvals", anchor: "reports", photo: "reports" as const,
          title: "Budget per project and approve in chat, not in a group thread",
          desc: "Request, approve, prepare payment and reconcile as clear steps. See each project's remaining budget at once. Works for companies and for freelancers juggling several jobs.",
          points: ["Request → approve → prepare → reconcile", "Budget and remaining balance per project", "Several businesses in one account"],
        },
      ],
    },
    data: {
      title: "Your business data lives in your own Google Sheet, not ours",
      desc: "From day one the system creates a Google Sheet and Drive folder in your Google account. Every entry and every document is written there. We keep no copy of your business data on our servers.",
      points: ["Open, filter and chart it like any file", "Share the file with your accountant", "Cancel anytime; the file stays yours"],
      sheetFile: "Aim Expense — your company", sheetHint: "Google Sheets · My Drive",
      sheetTabs: ["Events", "Payments", "Billings", "TaxInvoices"],
      sheetHead: ["PaymentDate", "Description", "EventID", "GTTLAmount", "Status"],
      sheetRows: [
        ["05/10/2569", "Event photography", "Event A", "12,000.00", "Paid"],
        ["06/10/2569", "Venue rental", "Event A", "25,000.00", "Approved"],
        ["08/10/2569", "Graphic design", "Brand X", "8,500.00", "Pending"],
        ["09/10/2569", "Transport", "Event B", "3,200.00", "Paid"],
        ["09/10/2569", "Client coffee", "Event B", "120.00", "Paid"],
      ],
      sheetCaption: "Example Payments tab in the Google Sheet the system creates — sample data",
    },
    how: {
      title: "Up and running in three steps, no data migration",
      sub: "Set it up yourself in 5 minutes, or message the LINE OA and our team will help at no cost",
      steps: [
        { title: "Sign in with LINE", desc: "No new account; use the LINE you already have" },
        { title: "Connect your Google", desc: "A Google Sheet and Drive folder are created for you automatically" },
        { title: "Send your first receipt in chat", desc: "Add the OA as a friend, snap a receipt, and watch it appear" },
      ],
    },
    pricing: {
      eyebrow: "Pricing",
      title: "From ฿189 a month, with a free 30-day Pro trial",
      desc: "Every account gets a full-featured 30-day Pro trial with no card. When it ends, pick the plan that fits your team. Cancel anytime.",
      monthly: "Monthly", yearly: "Yearly", yearlyHint: "Pay yearly and get 2 months free",
      perMonth: "/mo", perYear: "/yr", recommended: "Recommended",
      choose: "Choose plan",
      users: "users", businesses: "businesses", ocr: "OCR/mo", unlimited: "Unlimited",
      cta: "See all plans and the comparison table",
    },
    faq: { title: "Frequently asked questions", more: "See all questions" },
    cta: {
      title: "Send your first receipt into the system today",
      desc: "30-day Pro trial with every feature, no credit card. Plans start at ฿189 a month once you decide to stay.",
      btn: "Start 30-day free trial",
      qrLabel: "Scan to add friend",
      qrSub: "Ask questions or get started via LINE OA",
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
    { q: "ราคาเท่าไร ทดลองใช้ได้ไหม", a: "ทุกบัญชีได้ทดลอง Pro ครบทุกฟีเจอร์ 30 วันโดยไม่ต้องใช้บัตร หมดช่วงทดลองค่อยเลือกแพ็กเกจ เริ่มต้นที่ Basic 189 บาทต่อเดือน (Pro 399, Business 699, Max 1,499 บาท) ชำระผ่านบัตรเครดิตหรือเดบิต และยกเลิกได้ตลอดเวลาจากหน้าแพ็กเกจ" },
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
    { q: "How much does it cost, and is there a trial?", a: "Every account gets a full-featured 30-day Pro trial with no card. When it ends, choose a plan: Basic starts at 189 baht per month (Pro 399, Business 699, Max 1,499), billed by credit or debit card, and you can cancel anytime from the plan page." },
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
