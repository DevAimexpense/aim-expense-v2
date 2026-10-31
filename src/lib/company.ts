// ===========================================
// ข้อมูลนิติบุคคล/ช่องทางติดต่อของ Aim Expense — แหล่งเดียว ใช้ทั้งฟุตเตอร์ หน้า /contact /about
// หน้ากฎหมาย และ JSON-LD (แบบเดียวกับ aim-hr: src/lib/company.ts)
//
// LINE OA verification ต้องเห็นชื่อบริษัท อีเมล และบัญชี OA เป็นข้อความธรรมดาในหน้าเว็บ
// ห้าม obfuscate อีเมล · นิติบุคคลเดียวกับ Aim HR Expert (ต่างกันเฉพาะ OA และอีเมลสินค้า)
// ===========================================

export const COMPANY = {
  nameTh: "บริษัท เอม เอ็กเพนส์ซิส จำกัด",
  nameEn: "Aim Expensys Limited",
  address:
    "725 อาคารเอส เมโทร ห้องเลขที่ 47 ชั้นที่ 20 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110",
  addressEn:
    "725 S Metro Building, Room 47, 20th Floor, Sukhumvit Road, Khlong Tan Nuea, Watthana, Bangkok 10110",
  registrationNo: "0105569117503",
  email: "contact@aimexpensys.com",
  phone: "065-3287888",
  /** รูปแบบสากลสำหรับ tel: และ JSON-LD */
  phoneIntl: "+66653287888",
  /** Premium ID ของ OA (พี่พิม 2026-10-20) — basic ID คือ @064qycfu ยังใช้ใน env LINE_OA_BASIC_ID ของ onboarding */
  lineOaId: "@aimexpense",
  lineOaUrl: "https://line.me/R/ti/p/@aimexpense",
  /** QR เพิ่มเพื่อน (สร้างจากลิงก์ OA — แบบเดียวกับหน้า onboarding) */
  lineOaQr:
    "https://api.qrserver.com/v1/create-qr-code/?size=440x440&data=" +
    encodeURIComponent("https://line.me/R/ti/p/@aimexpense"),
  siteUrl: "https://aimexpense.com",
  productName: "Aim Expense",
  /** ผลิตภัณฑ์พี่น้อง (นิติบุคคลเดียวกัน) */
  sisterProduct: { name: "Aim HR Expert", url: "https://www.aimhrexpert.com" },
} as const;
