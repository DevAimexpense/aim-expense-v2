// ===========================================
// SALE-17: ใบกำกับภาษีที่ออกแทนฉบับที่ยกเลิก (เอกสารต้นทางเดียวกัน) ต้องอ้างฉบับเดิม
//
// แนวปฏิบัติสรรพากรเรื่องยกเลิกใบกำกับภาษีที่ผิดแล้วออกใหม่: ฉบับใหม่ระบุว่าออกแทนฉบับเลขที่ใด
// และเหตุผล (ฉบับเดิมเก็บไว้ครบชุด) · ใช้ทั้งใบกำกับจากใบวางบิล/ใบเสร็จออกตรง และจากใบเสนอราคา
// ===========================================

type Row = Record<string, string | undefined>;

/** ข้อความอ้างฉบับเดิม — ฉบับที่ยกเลิกล่าสุดของเอกสารต้นทางเดียวกัน · "" = ไม่ใช่ใบออกแทน */
export function replacementNote(sameSourceTis: Row[]): string {
  const voided = sameSourceTis
    .filter((t) => t.Status === "void" && t.DocNumber)
    .sort((a, b) => (b.VoidedAt || b.UpdatedAt || "").localeCompare(a.VoidedAt || a.UpdatedAt || ""));
  const last = voided[0];
  if (!last) return "";
  const reason = (last.VoidReason || "").trim();
  return `ออกแทนใบกำกับภาษีเลขที่ ${last.DocNumber} ซึ่งยกเลิกแล้ว${reason ? ` (เหตุผล: ${reason})` : ""}`;
}

/** ต่อข้อความอ้างฉบับเดิมไว้หน้าหมายเหตุเดิม */
export function withReplacementNote(notes: string, note: string): string {
  if (!note) return notes;
  // ผู้ใช้เขียนอ้างฉบับเดิมไว้เองแล้ว → ไม่ซ้ำ
  if (notes.includes("ออกแทน")) return notes;
  return notes ? `${note}\n${notes}` : note;
}
