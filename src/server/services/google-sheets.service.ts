// ===========================================
// Aim Expense — Google Sheets Service
// Proxy ทุก CRUD operation ไปยัง Google Sheets ของ user
// ข้อมูลธุรกิจทั้งหมดอยู่ที่นี่ ไม่ได้อยู่ server
// ===========================================

import { google, sheets_v4 } from "googleapis";

// ===== Sheet Tab Names =====
export const SHEET_TABS = {
  EVENTS: "Events",
  PAYEES: "Payees",
  BANKS: "Banks", // Master list of bank names (for Payee dropdown)
  COMPANY_BANKS: "CompanyBanks", // Company's own bank accounts (for Quotation/Invoice/Payment source)
  PAYMENTS: "Payments",
  EVENT_ASSIGNMENTS: "EventAssignments",
  CONFIG: "Config",
  // ===== S23: Revenue module =====
  CUSTOMERS: "Customers",
  QUOTATIONS: "Quotations",
  QUOTATION_LINES: "QuotationLines",
  // ===== S24: Billings =====
  BILLINGS: "Billings",
  BILLING_LINES: "BillingLines",
} as const;

// ===== Column Headers per Tab =====
export const SHEET_HEADERS: Record<string, string[]> = {
  [SHEET_TABS.EVENTS]: [
    "EventID",
    "EventName",
    "Budget",
    "StartDate",
    "EndDate",
    "Status",
    "Description",
    "CreatedAt",
    "CreatedBy",
  ],
  [SHEET_TABS.PAYEES]: [
    "PayeeID",
    "PayeeName",
    "TaxID",
    "BranchType", // "HQ" | "Branch" — สำนักงานใหญ่ / สาขา
    "BranchNumber", // เลขสาขา 5 หลัก (เช่น "00000" สำหรับ HQ, "00001" สำหรับสาขา 1)
    "BankAccount",
    "BankName",
    "IsVAT",
    "DefaultWTH",
    "Phone",
    "Email",
    "Address",
  ],
  [SHEET_TABS.BANKS]: [
    // Master Bank List (used as dropdown in Payee form)
    // Note: AccountNumber/AccountName/Branch/IsDefault kept for backward compat
    // but not used in new "Master List" model. Company's own banks are in CompanyBanks tab.
    "BankID",
    "BankName",
    "AccountNumber",
    "AccountName",
    "Branch",
    "IsDefault",
  ],
  [SHEET_TABS.COMPANY_BANKS]: [
    "CompanyBankID",
    "BankName",
    "AccountNumber",
    "AccountName",
    "Branch",
    "IsDefault",
    "UseForQuotation", // แสดงในใบเสนอราคา
    "UseForBilling",   // แสดงในใบวางบิล
    "UseForPayment",   // ใช้เป็น source สำหรับ Account expense
    "CreatedAt",
  ],
  [SHEET_TABS.PAYMENTS]: [
    "PaymentID",
    "EventID",
    "PayeeID",
    "ExpenseType", // "team" | "account"
    "CompanyBankID", // bank source (for account expense)
    "InvoiceNumber", // เลขที่ invoice/ใบแจ้งหนี้
    "InvoiceFileURL", // Stage 1: ใบแจ้งหนี้/ใบเสนอราคา
    "Description",
    "CostPerUnit",
    "Days",
    "NoOfPPL",
    "TTLAmount",
    "PctWTH",
    "WTHAmount",
    "VATAmount",
    "GTTLAmount",
    "Status", // "pending" | "approved" | "paid" | "rejected" | "cleared"
    "PaymentDate", // วันที่ชำระจริง
    "DueDate",
    "ApprovedBy",
    "ApprovedAt",
    "PaidAt",
    "BatchID",
    "IsCleared",
    "ClearedAt",
    "ReceiptURL", // Stage 2: ใบเสร็จ/ใบกำกับภาษี (หลังชำระ)
    "ReceiptNumber", // Stage 2: เลขที่ใบเสร็จ/ใบกำกับ (จาก OCR หรือ user กรอก)
    "ReceiptDate", // Stage 2: วันที่ออกใบเสร็จ
    // ===== R5: Tax compliance fields (ภพ.30) =====
    "DocumentType", // "receipt" | "tax_invoice" — ใบเสร็จรับเงิน vs ใบกำกับภาษี
    "ExpenseNature", // "goods" | "service" — สินค้า vs บริการ
    "CategoryMain", // หมวดหมู่หลัก เช่น "ค่าใช้จ่ายสำนักงาน"
    "CategorySub", // หมวดหมู่ย่อย เช่น "เครื่องเขียน"
    "RequesterName", // ผู้ขออนุญาตเบิกจ่าย (display name)
    "VendorTaxIdSnapshot", // เลขผู้เสียภาษีของร้าน (snapshot from Payee at create time)
    "VendorBranchInfo", // "สำนักงานใหญ่" / "สาขา 00001" snapshot
    // ===== End R5 =====
    "ActualExpense", // ค่าใช้จ่ายจริงหลังจบงาน (staff กรอก — เทียบกับ GTTLAmount ที่ตั้งเบิก)
    "GeneratedDocUrl", // Phase 3: URL ของ PDF เอกสารระบบออก ใน Drive (WHT cert / ใบรับรองแทน / ใบสำคัญรับเงิน)
    "GeneratedDocType", // "wht-cert" | "substitute-receipt" | "receipt-voucher"
    "Notes",
    "CreatedAt",
    "CreatedBy", // display name (denormalized) — สำหรับโชว์ใน UI
    "CreatedByUserId", // R6: stable userId — ใช้เช็ค ownership permission (display name เปลี่ยนได้)
    "UpdatedAt",
  ],
  [SHEET_TABS.EVENT_ASSIGNMENTS]: [
    "AssignmentID",
    "EventID",
    "UserID",
    "AssignedBy",
    "AssignedAt",
  ],
  [SHEET_TABS.CONFIG]: ["Key", "Value"],
  // ===== S23: Revenue module =====
  [SHEET_TABS.CUSTOMERS]: [
    "CustomerID",
    "CustomerName",
    "TaxID",
    "BranchType", // "HQ" | "Branch"
    "BranchNumber", // 5 หลัก
    "IsVAT", // info-only — ไม่ block ออก tax invoice
    "ContactPerson",
    "Phone",
    "Email",
    "Address", // ที่อยู่ตามทะเบียน (สำหรับ tax invoice)
    "BillingAddress", // ที่อยู่จัดส่งใบวางบิล
    "PaymentTerms", // "NET 30" | "COD" | custom
    "DefaultWHTPercent", // % ลูกค้าหัก ณ ที่จ่ายเรา (1/3/5)
    "Notes",
    "CreatedAt",
    "CreatedBy",
  ],
  [SHEET_TABS.QUOTATIONS]: [
    "QuotationID",
    "DocNumber", // QT-2026-0001 (per-org prefix configurable)
    "DocDate",
    "ValidUntil",
    "CustomerID",
    "CustomerNameSnapshot",
    "CustomerTaxIdSnapshot",
    "CustomerAddressSnapshot",
    "Status", // draft | sent | accepted | rejected | void | converted
    "EventID", // optional — link to internal Event/project
    "ProjectName",
    "Subtotal",
    "DiscountAmount",
    "VATAmount",
    "VATIncluded", // TRUE = ราคารวม VAT แล้ว
    "GrandTotal",
    "Notes",
    "Terms",
    "PreparedBy",
    "PreparedByUserId",
    "CreatedAt",
    "UpdatedAt",
    "PdfUrl", // defer S24+
  ],
  [SHEET_TABS.QUOTATION_LINES]: [
    "LineID",
    "QuotationID", // FK
    "LineNumber",
    "Description",
    "Quantity",
    "UnitPrice",
    "DiscountPercent",
    "LineTotal",
    "Notes",
  ],
  // ===== S24: Billings =====
  [SHEET_TABS.BILLINGS]: [
    "BillingID",
    "DocNumber", // BIL-2026-0001 (per-org prefix configurable)
    "DocDate",
    "DueDate",
    "CustomerID",
    "CustomerNameSnapshot",
    "CustomerTaxIdSnapshot",
    "CustomerAddressSnapshot",
    "SourceQuotationID", // optional — if converted from Quotation
    "EventID",
    "ProjectName",
    "Status", // draft | sent | partial | paid | void
    "Subtotal",
    "DiscountAmount",
    "VATAmount",
    "VATIncluded",
    "WHTPercent", // ลูกค้าหัก ณ ที่จ่ายเรา
    "WHTAmount", // = Subtotal × WHTPercent / 100
    "GrandTotal", // Subtotal + VAT
    "AmountReceivable", // GrandTotal - WHTAmount
    "PaidAmount", // running — อัปเดตเมื่อรับเงิน
    "PaidDate", // วันรับเงินครั้งล่าสุด
    "PaymentMethod", // transfer | cash | cheque | creditCard | other
    "BankAccountID", // ref → CompanyBanks (ถ้าโอน)
    "Notes",
    "Terms",
    "PreparedBy",
    "PreparedByUserId",
    "CreatedAt",
    "UpdatedAt",
    "PdfUrl",
  ],
  [SHEET_TABS.BILLING_LINES]: [
    "LineID",
    "BillingID",
    "LineNumber",
    "Description",
    "Quantity",
    "UnitPrice",
    "DiscountPercent",
    "LineTotal",
    "Notes",
  ],
};

// ===== Default Thai Banks (Master List Seed) =====
export const DEFAULT_BANKS = [
  { bankId: "BANK001", bankName: "ธนาคารกรุงเทพ" },
  { bankId: "BANK002", bankName: "ธนาคารกสิกรไทย" },
  { bankId: "BANK003", bankName: "ธนาคารไทยพาณิชย์" },
  { bankId: "BANK004", bankName: "ธนาคารกรุงไทย" },
  { bankId: "BANK005", bankName: "ธนาคารกรุงศรีอยุธยา" },
  { bankId: "BANK006", bankName: "ธนาคารทหารไทยธนชาต" },
  { bankId: "BANK007", bankName: "ธนาคารออมสิน" },
  { bankId: "BANK008", bankName: "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)" },
  { bankId: "BANK009", bankName: "ธนาคารยูโอบี" },
  { bankId: "BANK010", bankName: "ธนาคารซีไอเอ็มบีไทย" },
  { bankId: "BANK011", bankName: "ธนาคารแลนด์ แอนด์ เฮ้าส์" },
  { bankId: "BANK012", bankName: "ธนาคารเกียรตินาคินภัทร" },
  { bankId: "BANK013", bankName: "ธนาคารไอซีบีซี (ไทย)" },
  { bankId: "BANK014", bankName: "ธนาคารทิสโก้" },
];

/**
 * GoogleSheetsService
 * ทุก method ใช้ owner's OAuth token เพื่อ access Google Sheets
 */
export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(accessToken: string, spreadsheetId: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    this.sheets = google.sheets({ version: "v4", auth });
    this.spreadsheetId = spreadsheetId;
  }

  // ===== MASTER SHEET CREATION =====

  /**
   * สร้าง Master Spreadsheet พร้อม tabs + headers ทั้งหมด
   * เรียกครั้งเดียวตอน setup org
   */
  static async createMasterSheet(
    accessToken: string,
    orgName: string
  ): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: "v4", auth });

    // 1. Create spreadsheet with all tabs
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: `Aim Expense — ${orgName}`,
        },
        sheets: Object.values(SHEET_TABS).map((tabName) => ({
          properties: { title: tabName },
        })),
      },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId!;
    const spreadsheetUrl = spreadsheet.data.spreadsheetUrl!;

    // 2. Write headers to each tab
    const headerRequests = Object.entries(SHEET_HEADERS).map(
      ([tabName, headers]) => ({
        range: `${tabName}!A1:${columnLetter(headers.length)}1`,
        values: [headers],
      })
    );

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: headerRequests,
      },
    });

    // 3. Format header row (bold, freeze)
    const sheetIds = spreadsheet.data.sheets!.map(
      (s) => s.properties!.sheetId!
    );

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: sheetIds.flatMap((sheetId) => [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: {
                    red: 0.93,
                    green: 0.96,
                    blue: 1,
                  },
                },
              },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: "gridProperties.frozenRowCount",
            },
          },
        ]),
      },
    });

    return { spreadsheetId, spreadsheetUrl };
  }

  /**
   * Seed default banks (master list) ลง Banks tab
   * Use 6-column schema for backward compat (other fields empty)
   */
  async seedDefaultBanks(): Promise<void> {
    const rows = DEFAULT_BANKS.map((bank) => [
      bank.bankId,
      bank.bankName,
      "", // AccountNumber (unused in master list mode)
      "", // AccountName (unused)
      "", // Branch (unused)
      "FALSE", // IsDefault (unused)
    ]);
    await this.appendRows(SHEET_TABS.BANKS, rows);
  }

  /**
   * Ensure all required tabs exist in spreadsheet (auto-migration)
   * Add missing tabs + headers without affecting existing data
   */
  async ensureAllTabsExist(): Promise<{ added: string[]; columnsAdded: Record<string, string[]> }> {
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const existingTabs = new Set(
      (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[]
    );
    const requiredTabs = Object.values(SHEET_TABS);
    const missing = requiredTabs.filter((t) => !existingTabs.has(t));

    // Auto-extend: เช็ค existing tabs ว่ามี column ครบตาม SHEET_HEADERS หรือไม่
    // ถ้าขาด → append column ใหม่ที่ปลาย row 1 (header)
    const columnsAdded: Record<string, string[]> = {};
    const existingRequired = requiredTabs.filter((t) => existingTabs.has(t));
    for (const tabName of existingRequired) {
      const expectedHeaders = SHEET_HEADERS[tabName];
      const actualResp = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${tabName}!1:1`,
      });
      const actual = (actualResp.data.values?.[0] as string[] | undefined) || [];
      const missingCols = expectedHeaders.filter((h) => !actual.includes(h));
      if (missingCols.length > 0) {
        const startCol = actual.length + 1;
        const endCol = actual.length + missingCols.length;

        // R6 fix: ขยาย grid ก่อนถ้าจำนวนคอลัมน์ที่ต้องการเกิน grid ปัจจุบัน
        const sheetMeta = (meta.data.sheets || []).find(
          (s) => s.properties?.title === tabName
        );
        const currentGridCols = sheetMeta?.properties?.gridProperties?.columnCount || 26;
        if (endCol > currentGridCols) {
          const sheetId = sheetMeta?.properties?.sheetId;
          if (sheetId !== undefined && sheetId !== null) {
            await this.sheets.spreadsheets.batchUpdate({
              spreadsheetId: this.spreadsheetId,
              requestBody: {
                requests: [
                  {
                    appendDimension: {
                      sheetId,
                      dimension: "COLUMNS",
                      length: endCol - currentGridCols,
                    },
                  },
                ],
              },
            });
          }
        }

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${tabName}!${columnLetter(startCol)}1:${columnLetter(endCol)}1`,
          valueInputOption: "RAW",
          requestBody: { values: [missingCols] },
        });
        columnsAdded[tabName] = missingCols;
      }
    }

    if (missing.length === 0) return { added: [], columnsAdded };

    // Create missing tabs
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: missing.map((title) => ({
          addSheet: { properties: { title } },
        })),
      },
    });

    // Write headers for missing tabs
    const headerData = missing.map((tabName) => ({
      range: `${tabName}!A1:${columnLetter(SHEET_HEADERS[tabName].length)}1`,
      values: [SHEET_HEADERS[tabName]],
    }));
    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: headerData,
      },
    });

    // Format header rows + freeze
    const updatedMeta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const newSheets = (updatedMeta.data.sheets || []).filter(
      (s) => missing.includes((s.properties?.title || "") as (typeof missing)[number])
    );

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: newSheets.flatMap((sheet) => {
          const sheetId = sheet.properties!.sheetId!;
          return [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true },
                    backgroundColor: { red: 0.93, green: 0.96, blue: 1 },
                  },
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
              },
            },
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ];
        }),
      },
    });

    return { added: missing, columnsAdded };
  }

  // ===== GENERIC CRUD OPERATIONS =====

  /**
   * อ่านข้อมูลทั้ง tab (ยกเว้น header)
   */
  async getAll(tabName: string): Promise<Record<string, string>[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tabName}!A:ZZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) return [];

    const headers = rows[0];
    return rows.slice(1).map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, i) => {
        record[header] = row[i] || "";
      });
      return record;
    });
  }

  /**
   * อ่านข้อมูลหลาย tabs ใน 1 HTTP call (Sheets values.batchGet)
   *
   * เร็วกว่าทำ Promise.all ของ getAll() เพราะ:
   * - 1 HTTPS handshake แทน N
   * - 1 connection establish แทน N
   * - Save ~50-100ms ต่อ request
   *
   * Returns: map of tabName → row records
   */
  async getAllBatch(
    tabNames: string[]
  ): Promise<Record<string, Record<string, string>[]>> {
    if (tabNames.length === 0) return {};

    const ranges = tabNames.map((t) => `${t}!A:ZZ`);
    const response = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges,
    });

    const valueRanges = response.data.valueRanges || [];
    const result: Record<string, Record<string, string>[]> = {};

    for (let i = 0; i < tabNames.length; i++) {
      const tabName = tabNames[i];
      const rows = (valueRanges[i]?.values as string[][] | undefined) || [];
      if (rows.length < 2) {
        result[tabName] = [];
        continue;
      }
      const headers = rows[0];
      result[tabName] = rows.slice(1).map((row) => {
        const record: Record<string, string> = {};
        headers.forEach((header, idx) => {
          record[header] = row[idx] || "";
        });
        return record;
      });
    }

    return result;
  }

  /**
   * อ่านข้อมูลโดย filter ตาม column
   */
  async getFiltered(
    tabName: string,
    filterColumn: string,
    filterValue: string
  ): Promise<Record<string, string>[]> {
    const all = await this.getAll(tabName);
    return all.filter((row) => row[filterColumn] === filterValue);
  }

  /**
   * หาข้อมูล 1 row โดย ID column
   */
  async getById(
    tabName: string,
    idColumn: string,
    idValue: string
  ): Promise<Record<string, string> | null> {
    const all = await this.getAll(tabName);
    return all.find((row) => row[idColumn] === idValue) || null;
  }

  /**
   * เพิ่มแถวใหม่ (append)
   */
  async appendRows(tabName: string, rows: (string | number)[][]): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${tabName}!A:A`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  }

  /**
   * เพิ่ม 1 แถว
   */
  async appendRow(tabName: string, row: (string | number)[]): Promise<void> {
    await this.appendRows(tabName, [row]);
  }

  /**
   * เพิ่ม 1 แถว โดยแมปตาม "header name" ที่อยู่ใน Sheet จริง
   *
   * ปลอดภัยกว่า `appendRow(array)` เพราะ:
   * - ถ้า column order ใน Sheet จริง ต่างจาก SHEET_HEADERS ใน code → ค่าจะยังไปถูกช่อง
   * - ถ้า Sheet มี column ใหม่/หายไป → ยังเขียนถูกเท่าที่ Sheet มี
   *
   * ใช้กับข้อมูลสำคัญที่ column order อาจไม่ตรงกัน (เช่น Payments)
   */
  async appendRowByHeaders(
    tabName: string,
    data: Record<string, string | number | boolean>
  ): Promise<void> {
    // อ่าน header แถวแรกจาก Sheet จริง
    const headerResponse = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tabName}!1:1`,
    });
    const sheetHeaders = headerResponse.data.values?.[0] as string[] | undefined;

    if (!sheetHeaders || sheetHeaders.length === 0) {
      throw new Error(
        `Sheet "${tabName}" ไม่มี header row — โปรดเรียก ensureAllTabsExist() ก่อน`
      );
    }

    // Map ข้อมูลเข้ากับ column order จริง
    const row: (string | number)[] = sheetHeaders.map((header) => {
      const value = data[header];
      if (value === undefined || value === null) return "";
      if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
      return preserveLeadingZeros(value);
    });

    await this.appendRow(tabName, row);
  }

  /**
   * อัปเดตข้อมูล โดยหา row จาก ID column
   */
  async updateById(
    tabName: string,
    idColumn: string,
    idValue: string,
    updates: Record<string, string | number>
  ): Promise<boolean> {
    // Get all data including headers
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tabName}!A:ZZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) return false;

    const headers = rows[0];
    const idColIndex = headers.indexOf(idColumn);
    if (idColIndex === -1) return false;

    // Find row index (1-based, +1 for header)
    const rowIndex = rows.findIndex(
      (row, i) => i > 0 && row[idColIndex] === idValue
    );
    if (rowIndex === -1) return false;

    // Apply updates
    const updatedRow = [...rows[rowIndex]];
    for (const [key, value] of Object.entries(updates)) {
      const colIndex = headers.indexOf(key);
      if (colIndex !== -1) {
        updatedRow[colIndex] = String(preserveLeadingZeros(value));
      }
    }

    // Write back
    const range = `${tabName}!A${rowIndex + 1}:${columnLetter(headers.length)}${rowIndex + 1}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });

    return true;
  }

  /**
   * ลบแถว โดยหาจาก ID column
   */
  async deleteById(
    tabName: string,
    idColumn: string,
    idValue: string
  ): Promise<boolean> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tabName}!A:ZZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) return false;

    const headers = rows[0];
    const idColIndex = headers.indexOf(idColumn);
    if (idColIndex === -1) return false;

    const rowIndex = rows.findIndex(
      (row, i) => i > 0 && row[idColIndex] === idValue
    );
    if (rowIndex === -1) return false;

    // Get sheet ID for the tab
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === tabName
    );
    if (!sheet?.properties?.sheetId) return false;

    // Delete the row
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheet.properties.sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    });

    return true;
  }

  // ===== DOMAIN-SPECIFIC METHODS =====

  /**
   * ดึง Events ทั้งหมด
   */
  async getEvents() {
    return this.getAll(SHEET_TABS.EVENTS);
  }

  /**
   * ดึง Event ตาม ID
   */
  async getEventById(eventId: string) {
    return this.getById(SHEET_TABS.EVENTS, "EventID", eventId);
  }

  /**
   * ดึง Payments ของ Event
   */
  async getPaymentsByEvent(eventId: string) {
    return this.getFiltered(SHEET_TABS.PAYMENTS, "EventID", eventId);
  }

  /**
   * ดึง Payments ทั้งหมด
   */
  async getPayments() {
    return this.getAll(SHEET_TABS.PAYMENTS);
  }

  /**
   * ดึง Pending Payments (รอ approve)
   */
  async getPendingPayments() {
    return this.getFiltered(SHEET_TABS.PAYMENTS, "Status", "pending");
  }

  /**
   * ดึง Payees ทั้งหมด
   */
  async getPayees() {
    return this.getAll(SHEET_TABS.PAYEES);
  }

  /**
   * ดึง Payee ตาม ID
   */
  async getPayeeById(payeeId: string) {
    return this.getById(SHEET_TABS.PAYEES, "PayeeID", payeeId);
  }

  /**
   * ดึง Banks ทั้งหมด
   */
  async getBanks() {
    return this.getAll(SHEET_TABS.BANKS);
  }

  /**
   * ดึง Event Assignments
   */
  async getEventAssignments(eventId: string) {
    return this.getFiltered(SHEET_TABS.EVENT_ASSIGNMENTS, "EventID", eventId);
  }

  /**
   * ดึง EventID ทั้งหมดที่ user คนนี้ได้รับ assigned
   * ใช้สำหรับ filter project picker ใน LINE OA
   *
   * Resilient match: tries to match any of the user's identifiers (id/email/
   * lineUserId/displayName) against the UserID column — recovers from cases
   * where assignments were entered in the sheet using a friendlier label
   * (email, LINE display name) instead of the canonical Prisma user.id.
   *
   * EventID is trimmed on read so trailing whitespace in the sheet doesn't
   * break Set membership downstream.
   */
  async getEventIdsAssignedToUser(
    user: string | { id: string; email?: string | null; lineUserId?: string | null; lineDisplayName?: string | null },
  ): Promise<string[]> {
    // Normalize to a list of candidate identifiers (lowercased + trimmed)
    const candidates = new Set<string>();
    const add = (v?: string | null) => {
      if (!v) return;
      const t = String(v).trim();
      if (t) candidates.add(t.toLowerCase());
    };
    if (typeof user === "string") {
      add(user);
    } else {
      add(user.id);
      add(user.email);
      add(user.lineUserId);
      add(user.lineDisplayName);
    }

    const all = await this.getAll(SHEET_TABS.EVENT_ASSIGNMENTS);
    const matched = all.filter((row) => {
      const cell = String(row.UserID || "").trim().toLowerCase();
      return cell.length > 0 && candidates.has(cell);
    });

    // Diagnostic log when we find nothing — helps surface UserID format mismatch
    if (matched.length === 0 && all.length > 0) {
      const sampleUserIds = [
        ...new Set(all.slice(0, 5).map((r) => String(r.UserID || ""))),
      ].map((v) => JSON.stringify(v));
      console.warn(
        `[Sheets] EventAssignments: 0 rows matched ${candidates.size} candidate identifier(s) ` +
          `(of ${all.length} total rows). Sample UserIDs in sheet: ${sampleUserIds.join(", ")}`,
      );
    }

    return matched.map((a) => String(a.EventID || "").trim()).filter(Boolean);
  }

  /**
   * ดึง Config tab ทั้งหมด (Key → Value map)
   * Config tab ใช้เก็บ org-level settings เช่น BUYER_NAME, BUYER_TAX_ID,
   * BUYER_BRANCH, BUYER_ADDRESS — สำหรับ auto-correct buyer info จาก OCR
   *
   * Robust against:
   *   - Missing tab (returns {})
   *   - User-created tab without proper "Key"/"Value" headers
   *   - Header row with case variations ("key"/"Key"/"KEY")
   *   - Data starting on row 1 instead of row 2
   */
  /**
   * Upsert key/value ลง Config tab
   * - ถ้ามี key อยู่แล้ว → update Value
   * - ถ้าไม่มี → append row ใหม่
   *
   * Resilient: ถ้า Config tab ไม่มี header ให้สร้างเอง (Key/Value)
   */
  async setConfig(key: string, value: string): Promise<void> {
    // อ่านทั้ง tab เพื่อหา row index
    let rows: string[][] = [];
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${SHEET_TABS.CONFIG}!A:B`,
      });
      rows = (response.data.values as string[][] | undefined) || [];
    } catch {
      // tab ไม่มี — ปล่อยให้ ensureAllTabsExist() เรียกก่อน (caller responsibility)
      throw new Error(`Sheet "${SHEET_TABS.CONFIG}" not found`);
    }

    // Detect header row
    const firstA = String(rows[0]?.[0] ?? "").trim().toLowerCase();
    const hasHeader = firstA === "key" || firstA === "keys";
    const startIdx = hasHeader ? 1 : 0;

    // Find existing row
    let existingRow = -1;
    for (let i = startIdx; i < rows.length; i++) {
      if (String(rows[i]?.[0] ?? "").trim() === key) {
        existingRow = i;
        break;
      }
    }

    if (existingRow !== -1) {
      // Update Value column (B) only — preserve Key
      const range = `${SHEET_TABS.CONFIG}!B${existingRow + 1}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[value]] },
      });
      return;
    }

    // Append new row (Key, Value)
    await this.appendRow(SHEET_TABS.CONFIG, [key, value]);
  }

  async getConfigMap(): Promise<Record<string, string>> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${SHEET_TABS.CONFIG}!A:B`,
      });
      const rows = (response.data.values as string[][] | undefined) || [];
      if (rows.length === 0) return {};

      // Detect header row: if A1 looks like a header label, skip it.
      const firstA = String(rows[0]?.[0] ?? "").trim().toLowerCase();
      const startIdx = firstA === "key" || firstA === "keys" ? 1 : 0;

      const map: Record<string, string> = {};
      for (let i = startIdx; i < rows.length; i++) {
        const key = String(rows[i]?.[0] ?? "").trim();
        const value = String(rows[i]?.[1] ?? "").trim();
        if (key) map[key] = value;
      }
      return map;
    } catch (err) {
      console.warn("[Sheets] getConfigMap failed (tab missing/no access):", err);
      return {};
    }
  }

  // ===== Revenue module (S23+) =====

  /**
   * ดึง Customers ทั้งหมด
   */
  async getCustomers() {
    return this.getAll(SHEET_TABS.CUSTOMERS);
  }

  /**
   * ดึง Customer ตาม ID
   */
  async getCustomerById(customerId: string) {
    return this.getById(SHEET_TABS.CUSTOMERS, "CustomerID", customerId);
  }

  /**
   * ดึง Quotations ทั้งหมด (header rows)
   */
  async getQuotations() {
    return this.getAll(SHEET_TABS.QUOTATIONS);
  }

  /**
   * ดึง Quotation ตาม ID
   */
  async getQuotationById(quotationId: string) {
    return this.getById(SHEET_TABS.QUOTATIONS, "QuotationID", quotationId);
  }

  /**
   * ดึง Quotation lines ของ quotation นั้น (FK = QuotationID)
   */
  async getQuotationLines(quotationId: string) {
    return this.getFiltered(
      SHEET_TABS.QUOTATION_LINES,
      "QuotationID",
      quotationId
    );
  }

  // ===== Billings (S24) =====

  async getBillings() {
    return this.getAll(SHEET_TABS.BILLINGS);
  }

  async getBillingById(billingId: string) {
    return this.getById(SHEET_TABS.BILLINGS, "BillingID", billingId);
  }

  async getBillingLines(billingId: string) {
    return this.getFiltered(SHEET_TABS.BILLING_LINES, "BillingID", billingId);
  }

  // ===== ID GENERATION =====

  /**
   * สร้าง unique ID (prefix + timestamp + random)
   */
  static generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
  }
}

// ===== Helper =====

/**
 * Force text-mode for values that look like numbers but need to keep leading zeros
 * (e.g. taxId "0123456789012", branchNumber "00001", phone "0812345678")
 *
 * Sheets API USER_ENTERED parses pure-digit strings as numbers → drops leading 0.
 * Prefix with apostrophe (') tells Sheets "store as text" — apostrophe consumed,
 * value still reads back as the original string.
 */
function preserveLeadingZeros(value: string | number): string | number {
  if (typeof value !== "string") return value;
  if (/^0\d+$/.test(value)) return `'${value}`;
  return value;
}

/**
 * Convert column number to letter (1 = A, 26 = Z, 27 = AA, etc.)
 */
function columnLetter(colNum: number): string {
  let letter = "";
  let num = colNum;
  while (num > 0) {
    const remainder = (num - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}
