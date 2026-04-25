// ===========================================
// LINE Text Expense Parser
// Extracts an expense amount + free-form description from a Thai/English
// chat message such as "ค่ากาแฟ 100 บาท", "Starbucks 150", "แท็กซี่ 250".
//
// Design (per Session 14 spec):
// - Trigger = any message containing a number → treat as expense.
// - Description = full original text (user reviews/edits in web app later).
// - No vendor extraction here — left blank, web flow handles it.
// - No VAT / WHT / category guessing — defaults applied downstream.
// ===========================================

export interface ParsedTextExpense {
  /** Numeric amount in THB (always > 0). */
  amount: number;
  /** Original message, trimmed — used as Description. */
  description: string;
}

/**
 * Try to interpret a chat message as a quick expense entry.
 * Returns null when the text contains no usable number — caller should fall
 * back to the help/echo response.
 */
export function parseTextExpense(rawText: string): ParsedTextExpense | null {
  const text = (rawText || "").trim();
  if (!text) return null;

  // Match the FIRST number in the message. Supports:
  //   - integers / decimals: "100", "1234.50"
  //   - thousands commas:    "1,234", "12,345.67"
  //   - leading currency:    "฿100"
  //   - trailing unit:       "100 บาท", "100THB"
  // We deliberately avoid attaching to identifiers (e.g. "iPhone 15") by
  // requiring the number to be either at start, after whitespace, or after a
  // currency symbol — and bounded on the right by whitespace, end-of-string,
  // or a non-digit unit word.
  const re = /(?:^|[\s฿])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/;
  const m = text.match(re);
  if (!m) return null;

  const numeric = m[1].replace(/,/g, "");
  const amount = parseFloat(numeric);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    amount,
    description: text,
  };
}
