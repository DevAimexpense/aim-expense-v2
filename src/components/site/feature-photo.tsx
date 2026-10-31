// ===========================================
// ภาพประกอบของเว็บสาธารณะ — public/illustrations/{kind}.jpg (1536×1024, สไตล์เดียวกับ aim-hr)
// ยังไม่มีไฟล์รูป → แสดง placeholder ขนาดเท่าจริง (กล่อง brand-100 + ไอคอน) ไม่ให้ layout ขยับ
// พอได้รูปแล้ว: วางไฟล์ที่ public/illustrations/ แล้วเพิ่มชื่อใน AVAILABLE — ไม่ต้องแก้ที่อื่น
// prompt สำหรับสร้างรูปอยู่ใน IMAGE_PROMPTS_*.md
// ===========================================
import { Receipt, FileText, BarChart3, Users, Building2, Camera, type LucideIcon } from "lucide-react";

export type PhotoKind = "hero" | "receipt" | "documents" | "reports" | "team" | "multi";

/** ไฟล์ที่มีอยู่จริงใน public/illustrations/ — เพิ่มชื่อเมื่อวางไฟล์แล้ว */
const AVAILABLE: ReadonlySet<PhotoKind> = new Set<PhotoKind>(["hero", "receipt", "documents", "reports", "team", "multi"]);

const META: Record<PhotoKind, { icon: LucideIcon; alt: { th: string; en: string } }> = {
  hero: { icon: Camera, alt: { th: "เจ้าของร้านถือมือถือถ่ายใบเสร็จบนโต๊ะทำงาน", en: "A shop owner photographing a receipt with a phone at a desk" } },
  receipt: { icon: Receipt, alt: { th: "ใบเสร็จหลายใบวางบนโต๊ะข้างโทรศัพท์มือถือ", en: "Several receipts on a desk next to a mobile phone" } },
  documents: { icon: FileText, alt: { th: "เอกสารภาษีและใบกำกับภาษีพิมพ์ออกมาจัดเรียงเป็นระเบียบ", en: "Printed tax documents and invoices neatly arranged" } },
  reports: { icon: BarChart3, alt: { th: "แล็ปท็อปเปิดกราฟรายรับ-รายจ่ายบนโต๊ะทำงาน", en: "A laptop showing an income and expense chart on a desk" } },
  team: { icon: Users, alt: { th: "ทีมเล็ก ๆ ในออฟฟิศ SME กำลังคุยงานกัน", en: "A small team talking in an SME office" } },
  multi: { icon: Building2, alt: { th: "เจ้าของกิจการดูแลหลายสาขาหลายบริษัท", en: "A business owner managing several branches and companies" } },
};

export function FeaturePhoto({
  kind,
  lang = "th",
  priority = false,
  className = "",
}: {
  kind: PhotoKind;
  lang?: "th" | "en";
  priority?: boolean;
  className?: string;
}) {
  const m = META[kind];
  if (AVAILABLE.has(kind)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/illustrations/${kind}.jpg`}
        alt={m.alt[lang]}
        width={1536}
        height={1024}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className={`aspect-[3/2] w-full object-cover ${className}`}
      />
    );
  }
  const Icon = m.icon;
  return (
    <div
      role="img"
      aria-label={m.alt[lang]}
      className={`flex aspect-[3/2] w-full items-center justify-center bg-brand-100 ${className}`}
    >
      <div className="flex flex-col items-center gap-2 text-brand-600">
        <Icon size={48} strokeWidth={1.5} aria-hidden />
        <span className="text-xs font-medium text-brand-700/70">{kind}.jpg</span>
      </div>
    </div>
  );
}
