// ===========================================
// RPT-09: ปัดเศษเงิน 2 ตำแหน่ง — ตัวเดียวทั้งระบบ (หน้าจอ = server = เอกสาร = รายงาน)
//
// เดิม Math.round(x * 100) / 100 คลาดกรณี .xx5 เพราะเลขทศนิยมฐานสอง
//   10.515 * 100 = 1051.4999999999998 → 10.51 (ควรเป็น 10.52)
// วิธีนี้เลื่อนจุดทศนิยมด้วยสตริง (ตัดเศษ binary ที่ 15 หลักสำคัญ) แล้วปัดครึ่งขึ้น (half away from zero)
// ===========================================

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const abs = Math.abs(n);
  if (abs < 0.000001) return 0;
  const p = abs.toPrecision(15);
  const scaled = p.includes("e") ? abs * 100 : Number(`${p}e2`);
  const r = Math.round(scaled) / 100;
  return n < 0 ? -r : r;
}
