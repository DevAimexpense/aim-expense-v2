// ===========================================
// LINE Text Expense Parser
// Extracts an expense amount + free-form description from a Thai/English
// chat message such as "ค่ากาแฟ 100 บาท", "Starbucks 150", "แท็กซี่ 250".
//
// Amount selection (LINE-03):
//   (a) a number tagged with a currency unit — followed by บาท / บ. / ฿ / thb
//       (case-insensitive) or preceded by ฿. If several, the LAST tagged one
//       wins (Thai chat usually ends with the total: "...รวม 180 บาท").
//   (b) otherwise the LAST valid number in the message.
//   strict mode (group chats): only (a), or (b) when the number is the last
//       token of the message — so "ห้อง 302" is still accepted (limitation:
//       a trailing bare number is indistinguishable from an amount).
//
// Rejected candidates (never an amount):
//   - ≥ 9 consecutive digits (phone numbers, tax IDs, doc numbers)
//   - part of a date/time: digit[/.-:]digit on either side ("2024-11-01", "3:30")
//   - followed by a count/time word: โมง น. นาฬิกา ชม. ชั่วโมง นาที คน ชิ้น ครั้ง %
//   - amount ≤ 0 or > 9,999,999
//   - glued to Latin letters that are not a unit ("iPhone 15pro")
// Comma thousands and decimals are kept ("1,234.50" → 1234.5).
//
// Description = full original text (user reviews/edits in web app later).
// No vendor / VAT / WHT / category guessing — defaults applied downstream.
// ===========================================

export interface ParsedTextExpense {
  /** Numeric amount in THB (always > 0). */
  amount: number;
  /** Original message, trimmed — used as Description. */
  description: string;
}

export interface ParseTextExpenseOptions {
  /** Group mode: accept only unit-tagged numbers or a trailing bare number. */
  strict?: boolean;
}

const MAX_AMOUNT = 9_999_999;

/** Number token: "1,234", "1,234.50", "100", "100.5" */
const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
/** Currency unit right after the number (optional whitespace). */
const UNIT_AFTER_RE = /^\s*(?:บาท|บ\.|฿|thb)/i;
/** Words that mark the number as a count / time, not money. */
// LINE-28: ภาษาไทยไม่มีช่องว่างระหว่างคำ → คำนับต้องจบคำพอดี (ตามด้วยช่องว่าง/จบข้อความ/เครื่องหมาย)
// ไม่งั้น "วัน" จะกิน "วันนี้", "ที่" กิน "ที่ร้าน", "ใบ" กิน "ใบเสร็จ" แล้วทิ้งยอดเงินจริง
const NOT_MONEY_AFTER_RE =
  /^\s*(?:โมง|น\.|นาฬิกา|ชม\.|ชั่วโมง|นาที|วัน|คืน|มื้อ|คน|ท่าน|ชิ้น|อัน|ขวด|แก้ว|ใบ|ชุด|กล่อง|ถุง|แผ่น|ที่|เที่ยว|ครั้ง|รอบ|กก\.|กิโล|ลิตร|%)(?=\s|$|[.,!)\]])/;
/** LINE-29: เลขที่นำหน้าด้วย "วันที่/เลขที่/ลำดับที่/No./#" คือลำดับหรือวันที่ ไม่ใช่เงิน */
// LINE-30: คำละติน (no / no. / #) ต้องเป็น token แยก (ต้นข้อความหรือหลังช่องว่าง) —
// ไม่งั้นจะจับท้ายชื่อร้าน "Domino 450", "Casino 300", "Techno 1,200" แล้วทิ้งยอดจริง
// คำไทยคงเดิม (ภาษาไทยไม่มีช่องว่างระหว่างคำ)
const NOT_MONEY_BEFORE_RE = /(?:วันที่|เลขที่|ลำดับที่|งวดที่|ครั้งที่|(?:^|\s)(?:no\.?|#))\s*$/i;
/** Only whitespace / closing punctuation may follow the last token. */
const TRAILING_RE = /^[\s.,!)\]]*$/;
const THAI_CHAR_RE = /[฀-๿]/;
const LATIN_RE = /[A-Za-z]/;

/**
 * Heuristic: does this message look like INCOME (รายรับ) rather than an
 * expense? The LINE chat flow only records expenses, so an income-looking
 * message must NOT be booked as an expense (that silently flips the sign of
 * the entry). We keep this conservative — only fire on phrases that clearly
 * mean income, never on the bare word "รับ" which appears in many expenses
 * (ค่ารับรอง, รับเหมา, รับของ...).
 */
export function looksLikeIncome(rawText: string): boolean {
  const t = (rawText || "").trim();
  if (!t) return false;
  return /เงินเดือน|รายรับ|ได้รับเงิน|ได้รับค่า|^รับเงิน|^รับค่า|^รับโอน|^รับงาน/.test(
    t
  );
}

/**
 * Does the message contain at least one non-numeric word (a description)?
 * Group chats must not book a bare "300" or "300 บาท" — there is nothing to
 * describe the expense with.
 */
export function hasDescriptionWord(rawText: string): boolean {
  const stripped = (rawText || "")
    .replace(/[\d,.]+/g, " ")
    .replace(/บาท|บ\.|thb|฿/gi, " ");
  return /[฀-๿A-Za-z]{2,}/.test(stripped);
}

/**
 * Pure amount extractor — see the rules in the header comment.
 * Returns null when no candidate survives.
 */
export function extractAmount(
  rawText: string,
  opts: ParseTextExpenseOptions = {},
): number | null {
  const text = (rawText || "").trim();
  if (!text) return null;

  let tagged: number | null = null; // last unit-tagged candidate
  let lastBare: number | null = null; // last untagged candidate
  let lastBareIsFinalToken = false;

  NUMBER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUMBER_RE.exec(text)) !== null) {
    const token = m[0];
    const start = m.index;
    const end = start + token.length;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const prev = before.slice(-1);
    const next = after.slice(0, 1);

    // Left boundary: start / whitespace / ฿ / "(" / a Thai letter ("ค่ากาแฟ100บาท").
    // A digit before cannot happen (regex is greedy) except via a separator.
    const hasPrevCurrency = /฿\s*$/.test(before);
    if (
      prev !== "" &&
      !/\s/.test(prev) &&
      prev !== "(" &&
      !hasPrevCurrency &&
      !THAI_CHAR_RE.test(prev)
    ) {
      continue; // glued to a Latin word / punctuation → identifier, not money
    }

    // Phone / tax-id / document numbers: 9+ digits in a row.
    if (/^\d{9,}/.test(token)) continue;

    // Date / time fragments: "2024-11-01", "15/11", "3:30", "1.5.2024".
    if (/\d[/.\-:]$/.test(before) || /^[/\-:]\d/.test(after)) continue;

    const hasUnitAfter = UNIT_AFTER_RE.test(after);
    if (!hasUnitAfter) {
      if (NOT_MONEY_AFTER_RE.test(after)) continue;
      if (NOT_MONEY_BEFORE_RE.test(before)) continue; // "วันที่ 5", "เลขที่ 12"
      if (next !== "" && LATIN_RE.test(next)) continue; // "15pro"
    }

    const amount = parseFloat(token.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) continue;

    if (hasUnitAfter || hasPrevCurrency) {
      tagged = amount;
    } else {
      lastBare = amount;
      lastBareIsFinalToken = TRAILING_RE.test(after);
    }
  }

  if (tagged !== null) return tagged;
  if (lastBare === null) return null;
  if (opts.strict && !lastBareIsFinalToken) return null;
  return lastBare;
}

/**
 * Try to interpret a chat message as a quick expense entry.
 * Returns null when the text contains no usable amount — caller should fall
 * back to the help/echo response.
 */
export function parseTextExpense(
  rawText: string,
  opts: ParseTextExpenseOptions = {},
): ParsedTextExpense | null {
  const text = (rawText || "").trim();
  if (!text) return null;
  const amount = extractAmount(text, opts);
  if (amount === null) return null;
  return { amount, description: text };
}
