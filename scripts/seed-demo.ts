// ===========================================
// Aim Expense — ใส่ข้อมูลตัวอย่างสำหรับสาธิตให้ลูกค้าดู
//
// เขียนลง Google Sheet ของ org ที่ระบุ (ไม่แตะ Postgres นอกจากอ่าน org/เจ้าของ):
//   โปรเจกต์ 2 · ผู้รับเงิน 3 · ลูกค้า 1 · รายการจ่าย 10 (รออนุมัติ 1 / อนุมัติแล้ว 2 /
//   จ่ายแล้ว 5 / เคลียร์แล้ว 2 — มีหัก ณ ที่จ่าย 3% ให้ฟรีแลนซ์ 1 รายการ สำหรับพิมพ์ 50 ทวิ)
//   ใบเสนอราคา 1 → ใบวางบิล 1 (รับเงินครบ + เลขใบเสร็จ) → ใบกำกับภาษี 1 (ออกเลขแล้ว)
//
// ทุกคอลัมน์เขียนให้เหมือนที่ router ของแอปเขียน (payment/quotation/billing/taxInvoice)
// ยอดเงินคำนวณด้วยฟังก์ชันเดียวกับแอป · เลขเอกสารออกด้วย computeNextDocNumber ของแอป
//
// รัน (จาก aim-expense/):
//   set -a && source .env.local && set +a
//   npx tsx scripts/seed-demo.ts                           # ดูรายชื่อ org
//   npx tsx scripts/seed-demo.ts <orgId>                   # ดูว่าจะเขียนอะไร (ยังไม่เขียน)
//   npx tsx scripts/seed-demo.ts <orgId> --confirm         # ใส่ข้อมูล
//   npx tsx scripts/seed-demo.ts <orgId> --confirm --force # ล้างแท็บเดโมก่อนแล้วใส่ใหม่
//
// ⚠️ ใช้กับ org สำหรับสาธิตเท่านั้น — สร้างบริษัทใหม่ผ่าน "เพิ่มบริษัท" จะได้ Sheet เปล่า
//    อย่ารันทับบริษัทลูกค้าจริง (--force ล้างข้อมูลทุกแถวในแท็บเดโม)
//
// สิ่งที่สคริปต์ทำให้ไม่ได้ (ต้องทำผ่าน LINE เอง): รายการที่มีรูปใบเสร็จ/ผล OCR จริง
// (ไฟล์อยู่ใน Drive ของ org — สคริปต์ไม่สร้างไฟล์) → ส่งใบเสร็จจริงผ่าน LINE 2–3 ใบหลังรัน
// ===========================================

import { google } from "googleapis";
import { prisma } from "../src/lib/prisma";
import {
  getSheetsService,
  ensureTabsCached,
  getOrgAccessToken,
} from "../src/server/lib/sheets-context";
import {
  SHEET_TABS,
  type GoogleSheetsService,
} from "../src/server/services/google-sheets.service";
import { computeNextDocNumber } from "../src/server/lib/doc-number";
import { resolveIssuerBranch } from "../src/server/lib/issuer-branch";
import { invalidateTab } from "../src/server/lib/cache";
import { calculatePayment } from "../src/lib/calculations";
import { todayBangkok } from "../src/lib/utils/date";
import { readVatRegistered } from "../src/lib/org-settings";
import { computeQuotationTotals } from "../src/server/routers/quotation.router";
import { computeBillingTotals } from "../src/server/routers/billing.router";
import { computeTaxInvoiceTotals } from "../src/server/routers/taxInvoice.router";

type Row = Record<string, string | number | boolean>;

// ===== แท็บที่สคริปต์เขียน/ล้าง (Config · Banks · CompanyBanks · EventAssignments ไม่แตะ) =====
const DEMO_TABS: string[] = [
  SHEET_TABS.EVENTS,
  SHEET_TABS.PAYEES,
  SHEET_TABS.CUSTOMERS,
  SHEET_TABS.PAYMENTS,
  SHEET_TABS.QUOTATIONS,
  SHEET_TABS.QUOTATION_LINES,
  SHEET_TABS.BILLINGS,
  SHEET_TABS.BILLING_LINES,
  SHEET_TABS.TAX_INVOICES,
  SHEET_TABS.TAX_INVOICE_LINES,
];

// ===== วันที่ (เวลาไทย) =====

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** ISO timestamp ของเวลาไทย HH:MM ในวันที่ระบุ — ให้ CreatedAt/ApprovedAt ดูเหมือนทำจริงในวันนั้น */
function bangkokIso(dateStr: string, hhmm: string): string {
  return new Date(`${dateStr}T${hhmm}:00+07:00`).toISOString();
}

/** สุ่มแบบคงที่ — รันกี่ครั้งก็ได้ข้อมูลชุดเดิม ตัวเลขในเดโมจะได้ไม่เปลี่ยนไปมา */
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** เวลา HH:MM คงที่ต่อ seed — ชั่วโมงทำงาน 09:00–17:59 */
function workTime(n: number): string {
  const hh = 9 + Math.floor(seeded(n) * 9);
  const mm = Math.floor(seeded(n + 1000) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * ID คงที่ในรูปแบบเดียวกับ GoogleSheetsService.generateId (`PREFIX-xxxx-xxxx`)
 * จงใจไม่ใช้ generateId (timestamp + random) — ข้อมูลเดโมต้องเหมือนเดิมทุกครั้งที่รัน
 * และคำว่า DEMO ในไอดีทำให้แยกออกจากข้อมูลจริงได้ทันทีใน Sheet
 */
function demoId(prefix: string, n: number): string {
  return `${prefix}-DEMO-${String(n).padStart(4, "0")}`;
}

// ===== ข้อมูลเดโม =====

const EVENTS = [
  { id: demoId("EVT", 1), name: "งานอีเวนต์ลูกค้า A", budget: 50000, startBack: 25, endForward: 5, desc: "งานเปิดตัวสินค้าของลูกค้า A — เวที แสง เสียง ทีมงานหน้างาน" },
  { id: demoId("EVT", 2), name: "ออกบูธ ต.ค.", budget: 30000, startBack: 20, endForward: -3, desc: "ออกบูธงานแสดงสินค้า 2 วัน" },
];

const PAYEES = [
  {
    id: demoId("PAY", 1),
    name: "บริษัท ซัพพลายอีเวนต์ จำกัด",
    taxId: "0105560012345", // นิติบุคคล (ขึ้นต้น 0) → ภ.ง.ด.53
    branchType: "HQ",
    branchNumber: "00000",
    bankAccount: "123-4-56789-0",
    bankName: "ธนาคารกสิกรไทย",
    isVAT: true,
    defaultWTH: 3,
    phone: "021234567",
    email: "ar@supply-event.example",
    address: "88/8 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310",
  },
  {
    id: demoId("PAY", 2),
    name: "นายกิตติ ภาพสวย (ช่างภาพฟรีแลนซ์)",
    taxId: "1100700123456", // เลขบัตรประชาชน (ขึ้นต้น 1) → ภ.ง.ด.3
    branchType: "HQ",
    branchNumber: "",
    bankAccount: "987-6-54321-0",
    bankName: "ธนาคารไทยพาณิชย์",
    isVAT: false,
    defaultWTH: 3,
    phone: "0891234567",
    email: "",
    address: "12/34 ซอยลาดพร้าว 101 แขวงคลองจั่น เขตบางกะปิ กรุงเทพฯ 10240",
  },
  {
    id: demoId("PAY", 3),
    name: "ร้านกาแฟบ้านสวน",
    taxId: "",
    branchType: "HQ",
    branchNumber: "",
    bankAccount: "",
    bankName: "",
    isVAT: false,
    defaultWTH: 0,
    phone: "",
    email: "",
    address: "",
  },
];

const CUSTOMER = {
  id: demoId("CUST", 1),
  name: "บริษัท ลูกค้าตัวอย่าง จำกัด",
  taxId: "0105559876543",
  branchType: "HQ",
  branchNumber: "00000",
  contact: "คุณสมหญิง (ฝ่ายจัดซื้อ)",
  phone: "029876543",
  email: "purchasing@customer.example",
  address: "99/9 อาคารตัวอย่างทาวเวอร์ ชั้น 12 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110",
  paymentTerms: "NET 30",
  defaultWHTPercent: 3,
};

/** บัญชีบริษัทสำหรับ Account Expense — ใช้ของจริงใน CompanyBanks ถ้ามี ไม่มีจึงสร้างอันนี้ */
const DEMO_COMPANY_BANK = {
  id: demoId("CB", 1),
  bankName: "ธนาคารกสิกรไทย",
  accountNumber: "012-3-45678-9",
  branch: "สาขาสีลม",
};

type PaymentStatus = "pending" | "approved" | "paid" | "cleared";

interface DemoPayment {
  n: number;
  event: 1 | 2;
  payee: 1 | 2 | 3;
  expenseType: "team" | "account";
  description: string;
  costPerUnit: number;
  days: number;
  ppl: number;
  pctWTH: number;
  status: PaymentStatus;
  /** วันที่คีย์รายการ (กี่วันก่อนวันนี้) */
  createdBack: number;
  approvedBack?: number;
  paidBack?: number;
  clearedBack?: number;
  /** approved + กำหนดวันจ่ายล่วงหน้า (ไปโผล่หน้า "เตรียมจ่าย") — กี่วันนับจากวันนี้ */
  plannedPayForward?: number;
  batch?: number;
  invoiceNumber?: string;
  documentType?: "receipt" | "tax_invoice" | "id_card" | "substitute_receipt";
  expenseNature?: "goods" | "service";
  categoryMain?: string;
  categorySub?: string;
  requester?: string;
  notes?: string;
}

const PAYMENTS: DemoPayment[] = [
  // --- รออนุมัติ 1 (ให้กดอนุมัติสดต่อหน้าลูกค้า) ---
  { n: 1, event: 1, payee: 3, expenseType: "team", description: "ค่ากาแฟและขนมเบรกทีมงานวันซ้อมใหญ่", costPerUnit: 1850, days: 1, ppl: 1, pctWTH: 0, status: "pending", createdBack: 1, documentType: "receipt", expenseNature: "goods", categoryMain: "ค่าอาหารและเครื่องดื่ม", requester: "มิ้นท์ (ทีมอีเวนต์)", notes: "LINE OCR confidence 92%" },
  // --- อนุมัติแล้ว 2 ---
  { n: 2, event: 1, payee: 1, expenseType: "account", description: "ค่าเช่าเครื่องเสียงและไฟเวที (งานเปิดตัวสินค้า)", costPerUnit: 12000, days: 1, ppl: 1, pctWTH: 3, status: "approved", createdBack: 3, approvedBack: 2, plannedPayForward: 2, invoiceNumber: "INV-2569-0455", documentType: "tax_invoice", expenseNature: "service", categoryMain: "ค่าเช่าอุปกรณ์" },
  { n: 3, event: 2, payee: 3, expenseType: "team", description: "ค่าอาหารกลางวันทีมบูธ 6 คน", costPerUnit: 120, days: 1, ppl: 6, pctWTH: 0, status: "approved", createdBack: 4, approvedBack: 3, documentType: "receipt", expenseNature: "goods", categoryMain: "ค่าอาหารและเครื่องดื่ม", requester: "บอส (ฝ่ายขาย)", notes: "LINE OCR confidence 88%" },
  // --- จ่ายแล้ว 5 ---
  // ฟรีแลนซ์ หัก ณ ที่จ่าย 3% — ใช้พิมพ์หนังสือรับรอง 50 ทวิ (ภ.ง.ด.3)
  { n: 4, event: 1, payee: 2, expenseType: "account", description: "ค่าถ่ายภาพงานอีเวนต์ (ช่างภาพ 1 วัน)", costPerUnit: 10000, days: 1, ppl: 1, pctWTH: 3, status: "paid", createdBack: 8, approvedBack: 7, paidBack: 5, batch: 1, documentType: "substitute_receipt", expenseNature: "service", categoryMain: "ค่าจ้างบริการ", categorySub: "ช่างภาพ" },
  { n: 5, event: 1, payee: 1, expenseType: "account", description: "ค่าพิมพ์แบ็คดรอปและป้ายไวนิล", costPerUnit: 8500, days: 1, ppl: 1, pctWTH: 3, status: "paid", createdBack: 11, approvedBack: 10, paidBack: 9, batch: 2, invoiceNumber: "INV-2569-0412", documentType: "tax_invoice", expenseNature: "goods", categoryMain: "ค่าผลิตสื่อ" },
  { n: 6, event: 2, payee: 1, expenseType: "account", description: "ค่าเช่าพื้นที่บูธ 3×3 ม. 2 วัน", costPerUnit: 4500, days: 2, ppl: 1, pctWTH: 5, status: "paid", createdBack: 17, approvedBack: 16, paidBack: 14, batch: 3, invoiceNumber: "INV-2569-0388", documentType: "tax_invoice", expenseNature: "service", categoryMain: "ค่าเช่าสถานที่" },
  { n: 7, event: 2, payee: 3, expenseType: "team", description: "ค่าน้ำดื่มและของว่างหน้าบูธ", costPerUnit: 1260, days: 1, ppl: 1, pctWTH: 0, status: "paid", createdBack: 13, approvedBack: 13, paidBack: 12, batch: 4, documentType: "receipt", expenseNature: "goods", categoryMain: "ค่าอาหารและเครื่องดื่ม", requester: "บอส (ฝ่ายขาย)", notes: "LINE OCR confidence 95%" },
  { n: 8, event: 1, payee: 3, expenseType: "team", description: "ค่าแท็กซี่ส่งอุปกรณ์ไปสถานที่จัดงาน", costPerUnit: 350, days: 1, ppl: 1, pctWTH: 0, status: "paid", createdBack: 7, approvedBack: 6, paidBack: 6, batch: 5, categoryMain: "ค่าเดินทาง", requester: "มิ้นท์ (ทีมอีเวนต์)", notes: "พิมพ์ในแชต LINE: \"ค่าแท็กซี่ 350\" (ไม่มีใบเสร็จ)" },
  // --- เคลียร์แล้ว 2 (team expense ที่ส่งใบเสร็จครบแล้ว) ---
  { n: 9, event: 2, payee: 3, expenseType: "team", description: "ค่ากาแฟรับรองลูกค้าที่บูธ", costPerUnit: 980, days: 1, ppl: 1, pctWTH: 0, status: "cleared", createdBack: 16, approvedBack: 15, paidBack: 14, clearedBack: 13, batch: 3, documentType: "receipt", expenseNature: "goods", categoryMain: "ค่ารับรอง", notes: "LINE OCR confidence 91%" },
  { n: 10, event: 1, payee: 3, expenseType: "team", description: "ค่าอาหารเย็นทีมติดตั้งเวที 5 คน", costPerUnit: 180, days: 1, ppl: 5, pctWTH: 0, status: "cleared", createdBack: 21, approvedBack: 20, paidBack: 20, clearedBack: 18, batch: 6, documentType: "receipt", expenseNature: "goods", categoryMain: "ค่าอาหารและเครื่องดื่ม", requester: "มิ้นท์ (ทีมอีเวนต์)", notes: "LINE OCR confidence 93%" },
];

/** รายการสินค้า/บริการ ใช้ร่วมกันทั้ง ใบเสนอราคา → ใบวางบิล → ใบกำกับภาษี (งานเดียวกัน) */
const DOC_LINES = [
  { description: "จัดงานเปิดตัวสินค้า — ออกแบบและติดตั้งเวที ระบบแสง เสียง", quantity: 1, unitPrice: 85000, discountPercent: 0, expenseNature: "service" as const },
  { description: "ทีมงานหน้างาน 1 วัน (ผู้ควบคุมงาน + ทีมเทคนิค)", quantity: 1, unitPrice: 15000, discountPercent: 0, expenseNature: "service" as const },
];
const DOC_DISCOUNT = 0;
const DOC_VAT_INCLUDED = false;
const DOC_TERMS = "ชำระภายใน 30 วันนับจากวันที่วางบิล · โอนเข้าบัญชีบริษัทตามที่ระบุ";

// ===== helpers =====

async function listOrgs() {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      ownerId: true,
      googleSpreadsheetId: true,
      subscription: { select: { plan: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log("\nOrgs:");
  for (const o of orgs) {
    console.log(
      `  ${o.id}  ${o.name}  owner=${o.ownerId}  [plan=${o.subscription?.plan ?? "none"}]${
        o.googleSpreadsheetId ? "" : "  (ยังไม่มี Master Sheet)"
      }`
    );
  }
  console.log("\n⚠️  ใช้กับ org สำหรับสาธิตเท่านั้น อย่ารันทับบริษัทลูกค้าจริง");
}

/** ล้างทุกแถวใต้ header ของแท็บเดโม (1 คำขอ) แล้ว invalidate cache ให้ computeNextDocNumber อ่านสด */
async function clearDemoTabs(ownerId: string, spreadsheetId: string): Promise<void> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: await getOrgAccessToken(ownerId) });
  const api = google.sheets({ version: "v4", auth });
  await api.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: { ranges: DEMO_TABS.map((t) => `${t}!A2:ZZ`) },
  });
  await Promise.all(DEMO_TABS.map((t) => invalidateTab(spreadsheetId, t)));
}

/** snapshot ร้านค้า แบบเดียวกับ payment.router create */
function vendorSnapshot(payee: (typeof PAYEES)[number]): { taxId: string; branchInfo: string } {
  let branchInfo = "";
  if (payee.branchType === "Branch" && payee.branchNumber) {
    branchInfo = `สาขา ${payee.branchNumber}`;
  } else if (payee.branchType === "HQ") {
    branchInfo = "สำนักงานใหญ่";
  }
  return { taxId: payee.taxId, branchInfo };
}

/** label สาขาลูกค้าตามรูปแบบสรรพากร — เหมือน branchLabelOf ใน taxInvoice.router (ไม่ได้ export) */
function customerBranchLabel(branchType: string, branchNumber: string): string {
  if (branchType === "HQ") return "00000";
  if (branchType === "Branch" && branchNumber) return branchNumber.padStart(5, "0");
  return "";
}

// ===== main =====

async function main() {
  const orgId = process.argv[2];
  const confirm = process.argv.includes("--confirm");
  const force = process.argv.includes("--force");

  try {
    if (!orgId || orgId.startsWith("--")) {
      console.log("Usage: npx tsx scripts/seed-demo.ts <orgId> --confirm [--force]");
      await listOrgs();
      return;
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        googleSpreadsheetId: true,
        settings: true,
        owner: { select: { id: true, lineDisplayName: true, fullName: true } },
      },
    });
    if (!org) {
      console.error(`ไม่พบ org ${orgId}`);
      process.exitCode = 1;
      return;
    }
    if (!org.googleSpreadsheetId) {
      console.error("org นี้ยังไม่มี Master Sheet — ทำ onboarding (เชื่อม Google) ให้เสร็จก่อน");
      process.exitCode = 1;
      return;
    }

    // ผู้สร้างทุกแถว = เจ้าของ org (session.displayName ของแอปคือ User.lineDisplayName)
    const ownerName = org.owner.lineDisplayName || org.owner.fullName || "เจ้าของบริษัท";
    const ownerId = org.owner.id;
    const vatRegistered = readVatRegistered(org.settings);

    const sheets: GoogleSheetsService = await getSheetsService(orgId);
    await ensureTabsCached(sheets, orgId); // ให้ทุกแท็บ/คอลัมน์มีครบก่อน (แท็บเก่าอาจขาดคอลัมน์ใหม่)

    // อ่านทุกแท็บที่เกี่ยวใน 1 batchGet (โควตา Sheets 60 reads/นาที/ผู้ใช้)
    const existing = await sheets.getAllBatch([...DEMO_TABS, SHEET_TABS.COMPANY_BANKS]);
    const nonEmpty = DEMO_TABS.filter((t) => (existing[t]?.length ?? 0) > 0);
    const companyBanks = existing[SHEET_TABS.COMPANY_BANKS] ?? [];

    console.log(`\nองค์กร   : ${org.name}`);
    console.log(`orgId    : ${orgId}`);
    console.log(`เจ้าของ   : ${ownerName} (${ownerId})`);
    console.log(`จด VAT   : ${vatRegistered ? "ใช่" : "ไม่ (ตั้งค่าองค์กร)"}`);
    console.log(
      `ข้อมูลเดิม : ${
        nonEmpty.length === 0
          ? "แท็บเดโมว่างทั้งหมด"
          : nonEmpty.map((t) => `${t}=${existing[t].length}`).join(" · ")
      }`
    );

    if (!vatRegistered) {
      console.warn(
        "\n⚠️  org นี้ตั้งค่าว่า \"ไม่จดทะเบียน VAT\" — ใบเสนอราคา/ใบวางบิลจะออกแบบไม่มี VAT" +
          " และจะไม่สร้างใบกำกับภาษี (แอปห้ามออก) · ถ้าจะโชว์ใบกำกับภาษีให้ไปติ๊ก \"จดทะเบียน VAT\"" +
          " ที่ ตั้งค่า → ข้อมูลบริษัท แล้วรันใหม่ด้วย --force"
      );
    }

    if (nonEmpty.length > 0 && !force) {
      console.error(
        `\n🛑 แท็บเดโมมีข้อมูลอยู่แล้ว (${nonEmpty.join(", ")}) — หยุดไว้ก่อนเพื่อกันเขียนทับข้อมูลจริง` +
          `\n   ถ้าแน่ใจว่าเป็น org สาธิต ให้เติม --force (จะล้างทุกแถวในแท็บ: ${DEMO_TABS.join(", ")})`
      );
      process.exitCode = 1;
      return;
    }

    const today = todayBangkok();
    const useExistingBank =
      companyBanks.find((b) => b.UseForPayment === "TRUE") ??
      companyBanks.find((b) => b.CompanyBankID !== DEMO_COMPANY_BANK.id);
    const hasDemoBank = companyBanks.some((b) => b.CompanyBankID === DEMO_COMPANY_BANK.id);

    console.log(`
จะเขียน (วันที่อิงวันนี้ ${today} ย้อนหลังไม่เกิน 30 วัน · ผู้สร้างทุกแถว = ${ownerName}):
  Events          ${EVENTS.length} โปรเจกต์  (${EVENTS.map((e) => `${e.name} งบ ${e.budget.toLocaleString()}`).join(" · ")})
  Payees          ${PAYEES.length} ราย      (ร้านจด VAT · ฟรีแลนซ์ช่างภาพ · ร้านกาแฟ)
  Customers       1 บริษัท    (${CUSTOMER.name})
  Payments        ${PAYMENTS.length} รายการ  (รออนุมัติ 1 · อนุมัติแล้ว 2 · จ่ายแล้ว 5 · เคลียร์แล้ว 2 — หัก ณ ที่จ่าย 3% ให้ฟรีแลนซ์ 10,000)
  Quotations      1 ใบ (converted → ใบวางบิล) + ${DOC_LINES.length} บรรทัด
  Billings        1 ใบ (paid — รับเงินครบ + เลขใบเสร็จ RC) + ${DOC_LINES.length} บรรทัด
  TaxInvoices     ${vatRegistered ? `1 ใบ (issued) + ${DOC_LINES.length} บรรทัด` : "ข้าม (org ไม่จด VAT)"}
  CompanyBanks    ${
    useExistingBank
      ? `ใช้บัญชีที่มีอยู่ ${useExistingBank.BankName} ${useExistingBank.AccountNumber} (ไม่แก้)`
      : `เพิ่มบัญชีเดโม ${DEMO_COMPANY_BANK.bankName} ${DEMO_COMPANY_BANK.accountNumber}`
  }`);

    if (!confirm) {
      console.log("\n(ยังไม่ได้เขียนอะไร — เติม --confirm เมื่อพร้อม)");
      return;
    }

    // ---------- --force: ล้างของเดิม ----------
    if (nonEmpty.length > 0) {
      console.log("\nกำลังล้างแท็บเดโม…");
      await clearDemoTabs(ownerId, org.googleSpreadsheetId);
      console.log(`  ✓ ล้าง ${nonEmpty.join(", ")}`);
    }
    if (hasDemoBank && useExistingBank) {
      // เคยสร้างบัญชีเดโมไว้แต่ตอนนี้มีบัญชีจริงแล้ว → เอาอันเดโมออก
      await sheets.deleteRowsWhere(SHEET_TABS.COMPANY_BANKS, "CompanyBankID", DEMO_COMPANY_BANK.id);
    }

    // ---------- บัญชีบริษัท (สำหรับ Account Expense — payment.router บังคับต้องมี) ----------
    let companyBankId: string;
    if (useExistingBank) {
      companyBankId = useExistingBank.CompanyBankID;
    } else {
      companyBankId = DEMO_COMPANY_BANK.id;
      if (!hasDemoBank) {
        // ลำดับคอลัมน์เดียวกับ company-bank.router create
        await sheets.appendRow(SHEET_TABS.COMPANY_BANKS, [
          DEMO_COMPANY_BANK.id,
          DEMO_COMPANY_BANK.bankName,
          DEMO_COMPANY_BANK.accountNumber,
          org.name,
          DEMO_COMPANY_BANK.branch,
          "TRUE", // IsDefault
          "TRUE", // UseForQuotation
          "TRUE", // UseForBilling
          "TRUE", // UseForPayment
          bangkokIso(addDays(today, -28), "09:30"),
        ]);
      }
    }

    // ---------- โปรเจกต์ (event.router create) ----------
    const eventRows: Row[] = EVENTS.map((e, i) => ({
      EventID: e.id,
      EventName: e.name,
      Budget: e.budget,
      StartDate: addDays(today, -e.startBack),
      EndDate: addDays(today, e.endForward),
      Status: "active",
      Description: e.desc,
      CreatedAt: bangkokIso(addDays(today, -e.startBack - 2), workTime(100 + i)),
      CreatedBy: ownerName,
    }));

    // ---------- ผู้รับเงิน (payee.router create) ----------
    const payeeRows: Row[] = PAYEES.map((p) => ({
      PayeeID: p.id,
      PayeeName: p.name,
      TaxID: p.taxId,
      BranchType: p.branchType,
      BranchNumber: p.branchNumber,
      BankAccount: p.bankAccount,
      BankName: p.bankName,
      IsVAT: p.isVAT ? "TRUE" : "FALSE",
      DefaultWTH: p.defaultWTH,
      Phone: p.phone,
      Email: p.email,
      Address: p.address,
    }));

    // ---------- ลูกค้า (customer.router create) ----------
    const customerCreatedAt = bangkokIso(addDays(today, -22), workTime(200));
    const customerRows: Row[] = [
      {
        CustomerID: CUSTOMER.id,
        CustomerName: CUSTOMER.name,
        TaxID: CUSTOMER.taxId,
        BranchType: CUSTOMER.branchType,
        BranchNumber: CUSTOMER.branchType === "HQ" ? "00000" : CUSTOMER.branchNumber,
        IsVAT: "TRUE",
        ContactPerson: CUSTOMER.contact,
        Phone: CUSTOMER.phone,
        Email: CUSTOMER.email,
        Address: CUSTOMER.address,
        BillingAddress: CUSTOMER.address,
        PaymentTerms: CUSTOMER.paymentTerms,
        DefaultWHTPercent: CUSTOMER.defaultWHTPercent,
        Notes: "",
        CreatedAt: customerCreatedAt,
        CreatedBy: ownerName,
      },
    ];

    // ---------- รายการจ่าย (payment.router create → approve → markPaid → clearReconciliation) ----------
    const paymentRows: Row[] = PAYMENTS.map((p) => {
      const payee = PAYEES[p.payee - 1];
      const event = EVENTS[p.event - 1];
      const calc = calculatePayment({
        costPerUnit: p.costPerUnit,
        days: p.days,
        numberOfPeople: p.ppl,
        pctWTH: p.pctWTH,
        isVatPayee: payee.isVAT,
      });
      const vendor = vendorSnapshot(payee);

      const createdDate = addDays(today, -p.createdBack);
      const createdAt = bangkokIso(createdDate, workTime(300 + p.n));
      let updatedAt = createdAt;

      // สถานะ "pending" = ค่าตาม create
      const row: Row = {
        PaymentID: demoId("PMT", p.n),
        EventID: event.id,
        PayeeID: payee.id,
        ExpenseType: p.expenseType,
        CompanyBankID: p.expenseType === "account" ? companyBankId : "",
        InvoiceNumber: p.invoiceNumber || "",
        InvoiceFileURL: "",
        Description: p.description,
        CostPerUnit: p.costPerUnit,
        Days: p.days,
        NoOfPPL: p.ppl,
        TTLAmount: calc.ttlAmount,
        PctWTH: p.pctWTH,
        WTHAmount: calc.wthAmount,
        VATAmount: calc.vatAmount,
        GTTLAmount: calc.gttlAmount,
        Status: "pending",
        PaymentDate: "",
        DueDate: addDays(createdDate, 7),
        ApprovedBy: "",
        ApprovedAt: "",
        PaidAt: "",
        BatchID: "",
        IsCleared: "FALSE",
        ClearedAt: "",
        ReceiptURL: "",
        ReceiptNumber: "",
        ReceiptDate: "",
        DocumentType: p.documentType || "",
        ExpenseNature: p.expenseNature || "",
        CategoryMain: p.categoryMain || "",
        CategorySub: p.categorySub || "",
        RequesterName: p.requester || ownerName,
        VendorTaxIdSnapshot: vendor.taxId,
        VendorBranchInfo: vendor.branchInfo,
        Notes: p.notes || "",
        CreatedAt: createdAt,
        CreatedBy: ownerName,
        CreatedByUserId: ownerId,
        UpdatedAt: createdAt,
      };

      // approve: Status/ApprovedBy/ApprovedAt (+PaymentDate ถ้ากำหนดวันจ่าย)
      if (p.status !== "pending" && p.approvedBack !== undefined) {
        updatedAt = bangkokIso(addDays(today, -p.approvedBack), workTime(400 + p.n));
        row.Status = "approved";
        row.ApprovedBy = ownerName;
        row.ApprovedAt = updatedAt;
        row.UpdatedAt = updatedAt;
        if (p.plannedPayForward !== undefined) {
          row.PaymentDate = addDays(today, p.plannedPayForward);
        }
      }
      // markPaid: Status/PaidAt/PaymentDate/BatchID
      if ((p.status === "paid" || p.status === "cleared") && p.paidBack !== undefined) {
        const paidDate = addDays(today, -p.paidBack);
        updatedAt = bangkokIso(paidDate, workTime(500 + p.n));
        row.Status = "paid";
        row.PaidAt = updatedAt;
        row.PaymentDate = paidDate; // วันที่จ่ายจริง → วันที่บนหนังสือรับรอง 50 ทวิ
        row.BatchID = demoId("BATCH", p.batch ?? p.n);
        row.UpdatedAt = updatedAt;
      }
      // clearReconciliation (team เท่านั้น): IsCleared/ClearedAt/Status
      if (p.status === "cleared" && p.clearedBack !== undefined) {
        updatedAt = bangkokIso(addDays(today, -p.clearedBack), workTime(600 + p.n));
        row.IsCleared = "TRUE";
        row.ClearedAt = updatedAt;
        row.Status = "cleared";
        row.UpdatedAt = updatedAt;
      }
      return row;
    });

    // ---------- เอกสารรายรับ: ใบเสนอราคา → ใบวางบิล → ใบกำกับภาษี ----------
    const issuer = await resolveIssuerBranch(orgId);
    const isVat = vatRegistered;
    const customerBranch = customerBranchLabel(CUSTOMER.branchType, CUSTOMER.branchNumber);

    const qtDate = addDays(today, -18);
    const bilDate = addDays(today, -12);
    const paidDate = addDays(today, -4);
    const tiDate = paidDate; // ภายใน 7 วัน → ไม่ติด warning backdate ของแอป

    // เลขเอกสาร: ฟังก์ชันเดียวกับแอป (prefix จาก Config + max ของเดือนนั้น + 1) — อ่านสดจาก Sheet
    // คำนวณให้ครบก่อนเขียน (ทั้ง 4 เลขอ่านคนละคอลัมน์/แท็บ จึงไม่ชนกัน)
    const fresh = { spreadsheetId: org.googleSpreadsheetId };
    const qtNo = await computeNextDocNumber(sheets, "QT", qtDate, SHEET_TABS.QUOTATIONS, undefined, "DocNumber", fresh);
    const bilNo = await computeNextDocNumber(sheets, "BIL", bilDate, SHEET_TABS.BILLINGS, undefined, "DocNumber", fresh);
    const rcNo = await computeNextDocNumber(sheets, "RC", paidDate, SHEET_TABS.BILLINGS, undefined, "ReceiptNumber", fresh);
    const tiNo = isVat
      ? await computeNextDocNumber(
          sheets,
          "TI",
          tiDate,
          SHEET_TABS.TAX_INVOICES,
          (status) => status === "issued" || status === "void",
          "DocNumber",
          fresh
        )
      : "";

    // --- ใบเสนอราคา (quotation.router create → send → accept → convertToBilling ตั้ง Status = converted)
    const quotationId = demoId("QT", 1);
    const qtTotals = computeQuotationTotals(DOC_LINES, DOC_VAT_INCLUDED, DOC_DISCOUNT, isVat);
    const qtCreatedAt = bangkokIso(qtDate, workTime(700));
    const qtConvertedAt = bangkokIso(bilDate, workTime(701));
    const quotationRows: Row[] = [
      {
        QuotationID: quotationId,
        DocNumber: qtNo,
        DocDate: qtDate,
        ValidUntil: addDays(qtDate, 30),
        CustomerID: CUSTOMER.id,
        CustomerNameSnapshot: CUSTOMER.name,
        CustomerTaxIdSnapshot: CUSTOMER.taxId,
        CustomerAddressSnapshot: CUSTOMER.address,
        IssuerBranchSnapshot: issuer.branchLabel,
        IssuerAddressSnapshot: issuer.address,
        Status: "converted",
        EventID: EVENTS[0].id,
        ProjectName: EVENTS[0].name,
        Subtotal: qtTotals.subtotal,
        DiscountAmount: DOC_DISCOUNT,
        VATAmount: qtTotals.vatAmount,
        VATIncluded: DOC_VAT_INCLUDED ? "TRUE" : "FALSE",
        IsVAT: isVat ? "TRUE" : "FALSE",
        GrandTotal: qtTotals.grandTotal,
        Notes: "",
        Terms: DOC_TERMS,
        PreparedBy: ownerName,
        PreparedByUserId: ownerId,
        CreatedAt: qtCreatedAt,
        UpdatedAt: qtConvertedAt,
        PdfUrl: "",
      },
    ];
    const quotationLineRows: Row[] = DOC_LINES.map((l, i) => ({
      LineID: demoId("QTL", i + 1),
      QuotationID: quotationId,
      LineNumber: i + 1,
      Description: l.description,
      Quantity: l.quantity,
      UnitPrice: l.unitPrice,
      DiscountPercent: l.discountPercent,
      LineTotal: qtTotals.lineTotals[i],
      Notes: "",
    }));

    // --- ใบวางบิล (quotation.router convertToBilling → billing.router send → recordPayment → issueReceipt)
    const billingId = demoId("BIL", 1);
    const bilTotals = computeBillingTotals(
      DOC_LINES,
      DOC_VAT_INCLUDED,
      DOC_DISCOUNT,
      CUSTOMER.defaultWHTPercent, // convertToBilling ใช้ DefaultWHTPercent ของลูกค้า
      isVat
    );
    const bilPaidAt = bangkokIso(paidDate, workTime(702));
    const billingRows: Row[] = [
      {
        BillingID: billingId,
        DocNumber: bilNo,
        DocDate: bilDate,
        DueDate: addDays(bilDate, 30),
        CustomerID: CUSTOMER.id,
        CustomerNameSnapshot: CUSTOMER.name,
        CustomerTaxIdSnapshot: CUSTOMER.taxId,
        CustomerAddressSnapshot: CUSTOMER.address,
        IssuerBranchSnapshot: issuer.branchLabel,
        IssuerAddressSnapshot: issuer.address,
        SourceQuotationID: quotationId,
        EventID: EVENTS[0].id,
        ProjectName: EVENTS[0].name,
        Status: "paid",
        Subtotal: bilTotals.subtotal,
        DiscountAmount: DOC_DISCOUNT,
        VATAmount: bilTotals.vatAmount,
        VATIncluded: DOC_VAT_INCLUDED ? "TRUE" : "FALSE",
        IsVAT: isVat ? "TRUE" : "FALSE",
        WHTPercent: CUSTOMER.defaultWHTPercent,
        WHTAmount: bilTotals.whtAmount,
        GrandTotal: bilTotals.grandTotal,
        AmountReceivable: bilTotals.amountReceivable,
        // recordPayment: ครบเมื่อ PaidAmount >= GrandTotal (ยอดที่เทียบคือ GrandTotal ไม่ใช่ AmountReceivable)
        PaidAmount: bilTotals.grandTotal,
        PaidDate: paidDate,
        PaymentMethod: "transfer",
        BankAccountID: companyBankId,
        Notes: "",
        Terms: DOC_TERMS,
        PreparedBy: ownerName,
        PreparedByUserId: ownerId,
        CreatedAt: qtConvertedAt,
        UpdatedAt: bilPaidAt,
        PdfUrl: "",
        // issueReceipt: เลข RC + วันที่ใบเสร็จ = วันรับเงิน
        ReceiptNumber: rcNo,
        ReceiptDate: paidDate,
      },
    ];
    const billingLineRows: Row[] = DOC_LINES.map((l, i) => ({
      LineID: demoId("BILL", i + 1),
      BillingID: billingId,
      LineNumber: i + 1,
      Description: l.description,
      Quantity: l.quantity,
      UnitPrice: l.unitPrice,
      DiscountPercent: l.discountPercent,
      LineTotal: bilTotals.lineTotals[i],
      Notes: "",
    }));

    // --- ใบกำกับภาษี (taxInvoice.router create → issue) — เฉพาะ org จด VAT
    const taxInvoiceId = demoId("TI", 1);
    const tiTotals = computeTaxInvoiceTotals(DOC_LINES, DOC_VAT_INCLUDED, DOC_DISCOUNT);
    const tiCreatedAt = bangkokIso(tiDate, workTime(703));
    const tiIssuedAt = bangkokIso(tiDate, workTime(704));
    const taxInvoiceRows: Row[] = isVat
      ? [
          {
            TaxInvoiceID: taxInvoiceId,
            DocNumber: tiNo,
            DocDate: tiDate,
            CustomerID: CUSTOMER.id,
            CustomerNameSnapshot: CUSTOMER.name,
            CustomerTaxIdSnapshot: CUSTOMER.taxId,
            CustomerBranchSnapshot: customerBranch,
            CustomerAddressSnapshot: CUSTOMER.address,
            IssuerBranchSnapshot: issuer.branchLabel,
            IssuerAddressSnapshot: issuer.address,
            SourceBillingID: billingId,
            SourceQuotationID: quotationId,
            EventID: EVENTS[0].id,
            ProjectName: EVENTS[0].name,
            Status: "issued",
            Subtotal: tiTotals.subtotal,
            DiscountAmount: DOC_DISCOUNT,
            VATAmount: tiTotals.vatAmount,
            VATIncluded: DOC_VAT_INCLUDED ? "TRUE" : "FALSE",
            GrandTotal: tiTotals.grandTotal,
            Notes: "",
            PreparedBy: ownerName,
            PreparedByUserId: ownerId,
            IssuedAt: tiIssuedAt,
            VoidedAt: "",
            VoidReason: "",
            CreditNoteID: "",
            CreatedAt: tiCreatedAt,
            UpdatedAt: tiIssuedAt,
            PdfUrl: "",
          },
        ]
      : [];
    const taxInvoiceLineRows: Row[] = isVat
      ? DOC_LINES.map((l, i) => ({
          LineID: demoId("TIL", i + 1),
          TaxInvoiceID: taxInvoiceId,
          LineNumber: i + 1,
          Description: l.description,
          ExpenseNature: l.expenseNature,
          Quantity: l.quantity,
          UnitPrice: l.unitPrice,
          DiscountPercent: l.discountPercent,
          LineTotal: tiTotals.lineTotals[i],
          Notes: "",
        }))
      : [];

    // ---------- เขียน ----------
    // appendRowsByHeaders = อ่าน header 1 + append 1 ต่อแท็บ (แมปตามชื่อคอลัมน์จริง + กัน 0 นำหน้าหาย)
    // ถ้าวนเขียนทีละแถวจะชนโควตา 60 reads/นาที ทันที
    console.log("\nกำลังเขียนลง Google Sheet…");
    const writes: [string, Row[], string][] = [
      [SHEET_TABS.EVENTS, eventRows, "โปรเจกต์"],
      [SHEET_TABS.PAYEES, payeeRows, "ผู้รับเงิน"],
      [SHEET_TABS.CUSTOMERS, customerRows, "ลูกค้า"],
      [SHEET_TABS.PAYMENTS, paymentRows, "รายการจ่าย"],
      [SHEET_TABS.QUOTATIONS, quotationRows, `ใบเสนอราคา ${qtNo}`],
      [SHEET_TABS.QUOTATION_LINES, quotationLineRows, "  บรรทัดใบเสนอราคา"],
      [SHEET_TABS.BILLINGS, billingRows, `ใบวางบิล ${bilNo} (ใบเสร็จ ${rcNo})`],
      [SHEET_TABS.BILLING_LINES, billingLineRows, "  บรรทัดใบวางบิล"],
      [SHEET_TABS.TAX_INVOICES, taxInvoiceRows, `ใบกำกับภาษี ${tiNo}`],
      [SHEET_TABS.TAX_INVOICE_LINES, taxInvoiceLineRows, "  บรรทัดใบกำกับภาษี"],
    ];
    for (const [tab, rows, label] of writes) {
      if (rows.length === 0) continue;
      await sheets.appendRowsByHeaders(tab, rows);
      console.log(`  ✓ ${label.padEnd(36)} ${rows.length} แถว`);
    }

    const spentByEvent = EVENTS.map((e) => {
      const spent = paymentRows
        .filter((r) => r.EventID === e.id)
        .reduce((a, r) => a + Number(r.GTTLAmount), 0);
      return `${e.name}: ใช้ไป ${spent.toLocaleString()} / ${e.budget.toLocaleString()}`;
    });

    console.log(`
เสร็จแล้ว ✅   ${spentByEvent.join(" · ")}

ขั้นต่อไปทำในแอป/LINE (สคริปต์ทำแทนไม่ได้):
  1. LINE → ส่งรูปใบเสร็จจริง 2–3 ใบให้ OA เลือกโปรเจกต์ → จะได้รายการที่มีรูป + ผล OCR จริง
  2. รายการ "${PAYMENTS[0].description}" ค้างสถานะรออนุมัติไว้แล้ว — กดอนุมัติสดต่อหน้าลูกค้า
  3. รายการค่าถ่ายภาพ 10,000 (หัก ณ ที่จ่าย 3%) จ่ายแล้ว → เปิดพิมพ์หนังสือรับรอง 50 ทวิ ได้ทันที
  4. ตั้งค่าองค์กร → อัปโหลดโลโก้ + ลายเซ็น เอกสารจะได้ดูเป็นของจริง

คู่มือสาธิต: DEMO_GUIDE.md
`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
