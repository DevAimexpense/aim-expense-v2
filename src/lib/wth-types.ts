// ===========================================
// Withholding Tax Types (หัก ณ ที่จ่าย)
// Reference: ภ.ง.ด. 3 / 53
// ===========================================

export interface WthType {
  id: string;
  label: string;
  rate: number; // %
  form: "3" | "53" | "both"; // ภ.ง.ด. 3 (บุคคล) / 53 (นิติบุคคล)
  description: string;
}

export const WTH_TYPES: WthType[] = [
  {
    id: "none",
    label: "ไม่หัก ณ ที่จ่าย",
    rate: 0,
    form: "both",
    description: "ไม่ต้องออกใบหัก ณ ที่จ่าย",
  },
  {
    id: "service-1",
    label: "ค่ารับเหมา (นิติบุคคล) 1%",
    rate: 1,
    form: "53",
    description: "ค่าจ้างทำของ / รับเหมา จากนิติบุคคล",
  },
  {
    id: "transport-1",
    label: "ค่าขนส่ง 1%",
    rate: 1,
    form: "both",
    description: "ค่าขนส่งสินค้า",
  },
  {
    id: "ad-2",
    label: "ค่าโฆษณา 2%",
    rate: 2,
    form: "both",
    description: "ค่าโฆษณา/ประชาสัมพันธ์",
  },
  {
    id: "service-3",
    label: "ค่าบริการ 3%",
    rate: 3,
    form: "both",
    description: "ค่าบริการทั่วไป (พบบ่อยที่สุด)",
  },
  {
    id: "contract-3",
    label: "ค่ารับเหมา (บุคคล) 3%",
    rate: 3,
    form: "3",
    description: "ค่าจ้างทำของ / รับเหมา จากบุคคลธรรมดา",
  },
  {
    id: "commission-3",
    label: "ค่านายหน้า 3%",
    rate: 3,
    form: "both",
    description: "ค่านายหน้า / คอมมิชชั่น",
  },
  {
    id: "rental-5",
    label: "ค่าเช่า 5%",
    rate: 5,
    form: "both",
    description: "ค่าเช่าอสังหาริมทรัพย์ / ทรัพย์สิน",
  },
  {
    id: "professional-5",
    label: "ค่าวิชาชีพอิสระ 3-5%",
    rate: 5,
    form: "3",
    description: "แพทย์ / ทนายความ / วิศวกร / สถาปนิก",
  },
  {
    id: "show-5",
    label: "ค่าแสดงสาธารณะ 5%",
    rate: 5,
    form: "3",
    description: "นักแสดง / นักร้อง / ศิลปิน",
  },
  {
    id: "custom",
    label: "กำหนดเอง",
    rate: 0,
    form: "both",
    description: "ระบุอัตรา % เอง",
  },
];

export function getWthTypeById(id: string): WthType | undefined {
  return WTH_TYPES.find((t) => t.id === id);
}

export function findWthTypeByRate(rate: number): WthType | undefined {
  return WTH_TYPES.find((t) => t.rate === rate && t.id !== "custom" && t.id !== "none") ||
    (rate === 0 ? WTH_TYPES[0] : undefined);
}
