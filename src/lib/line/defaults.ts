// ===========================================
// Get-or-create default Event + Payee for LINE quick capture
// ===========================================

import {
  GoogleSheetsService,
  SHEET_TABS,
} from "@/server/services/google-sheets.service";

const LINE_DEFAULT_EVENT_NAME = "LINE Quick Capture";
const LINE_DEFAULT_PAYEE_NAME = "ไม่ระบุผู้รับเงิน (LINE)";

export interface LineDefaults {
  eventId: string;
  payeeId: string;
}

/**
 * Ensure a default Event + Payee exist in the org's Sheet for LINE bookings.
 * Creates them if missing.
 */
export async function ensureLineDefaults(
  sheets: GoogleSheetsService
): Promise<LineDefaults> {
  await sheets.ensureAllTabsExist();

  // Find or create event
  const events = await sheets.getAll(SHEET_TABS.EVENTS);
  let event = events.find((e) => e.EventName === LINE_DEFAULT_EVENT_NAME);
  if (!event) {
    const eventId = GoogleSheetsService.generateId("EVT");
    const now = new Date().toISOString();
    await sheets.appendRow(SHEET_TABS.EVENTS, [
      eventId,
      LINE_DEFAULT_EVENT_NAME,
      "0",
      "",
      "",
      "active",
      "Auto-created สำหรับการบันทึกผ่าน LINE OA",
      now,
      "system",
    ]);
    event = { EventID: eventId, EventName: LINE_DEFAULT_EVENT_NAME };
  }

  // Find or create payee
  const payees = await sheets.getAll(SHEET_TABS.PAYEES);
  let payee = payees.find((p) => p.PayeeName === LINE_DEFAULT_PAYEE_NAME);
  if (!payee) {
    const payeeId = GoogleSheetsService.generateId("PAY");
    await sheets.appendRowByHeaders(SHEET_TABS.PAYEES, {
      PayeeID: payeeId,
      PayeeName: LINE_DEFAULT_PAYEE_NAME,
      TaxID: "",
      BranchType: "HQ",
      BranchNumber: "",
      BankAccount: "",
      BankName: "",
      IsVAT: "FALSE",
      DefaultWTH: "0",
      Phone: "",
      Email: "",
      Address: "",
    });
    payee = { PayeeID: payeeId, PayeeName: LINE_DEFAULT_PAYEE_NAME };
  }

  return {
    eventId: event.EventID,
    payeeId: payee.PayeeID,
  };
}
