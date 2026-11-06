"use client";

// ===========================================
// ชิ้นส่วน UI ที่ใช้ร่วมกันในหลังบ้าน (ป้ายสถานะ / ข้อความวันหมดอายุ)
// วันที่ format ฝั่ง browser → แสดงเป็นเวลาไทยของผู้ใช้ (เซิร์ฟเวอร์เป็น UTC)
// ===========================================

import { formatDate } from "@/lib/utils/date";

export function Badge({
  bg,
  color,
  children,
  title,
}: {
  bg: string;
  color: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        background: bg,
        color,
        padding: "0.125rem 0.5rem",
        borderRadius: "999px",
        fontSize: "0.6875rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** แถวสถานะที่ทุกหน้าใช้ร่วมกัน (shape เดียวกับ backoffice.accounts row) */
export interface StatusRowLike {
  lifetime: boolean;
  inTrial: boolean;
  trialEndsAt: string | null;
  paying: boolean;
  hasStripe: boolean;
  stripeStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  isTeam: boolean;
  expiringSoon: boolean;
  invoice: boolean;
  invoiceActive: boolean;
}

export function StatusBadges({ r }: { r: StatusRowLike }) {
  return (
    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
      {r.isTeam && <Badge bg="#e0f2fe" color="#075985">ทีมงาน</Badge>}
      {r.lifetime && <Badge bg="#ede9fe" color="#5b21b6">ฟรีตลอดชีพ</Badge>}
      {r.inTrial && (
        <Badge bg="#fef3c7" color="#92400e">
          ฟรีถึง {r.trialEndsAt ? formatDate(r.trialEndsAt) : "—"}
        </Badge>
      )}
      {r.paying && (
        <Badge bg="#dcfce7" color="#166534">{r.invoice ? "จ่ายเงิน · วางบิล" : "จ่ายเงิน"}</Badge>
      )}
      {r.invoice && !r.invoiceActive && (
        <Badge bg="#fee2e2" color="#991b1b" title="รอบวางบิลหมดแล้ว รอ cron ลดเป็นแผนฟรี หรือต่อรอบใหม่">
          วางบิลหมดรอบ
        </Badge>
      )}
      {r.hasStripe && !r.paying && !r.lifetime && r.stripeStatus === "trialing" && (
        <Badge bg="#fef3c7" color="#92400e" title="ผูกบัตรแล้ว Stripe จะตัดเงินเมื่อหมดช่วงทดลอง — ยังไม่นับเป็นจ่ายจริง">
          ผูกบัตรแล้ว · รอตัดเงิน
        </Badge>
      )}
      {r.hasStripe && !r.paying && !r.lifetime && r.stripeStatus === "past_due" && (
        <Badge bg="#fee2e2" color="#991b1b" title="Stripe ตัดบัตรไม่ผ่าน กำลัง retry — ยังใช้งานได้แต่ไม่นับเป็นจ่ายจริง">
          บัตรถูกปฏิเสธ
        </Badge>
      )}
      {r.hasStripe && !r.paying && !r.lifetime && r.stripeStatus &&
        r.stripeStatus !== "trialing" && r.stripeStatus !== "past_due" && (
        <Badge bg="#f1f5f9" color="#475569" title="มี Stripe subscription แต่ไม่ได้อยู่ในสถานะที่เก็บเงินได้">
          Stripe: {r.stripeStatus}
        </Badge>
      )}
      {r.hasStripe && r.lifetime && (
        <Badge bg="#fee2e2" color="#991b1b">ยังผูก Stripe</Badge>
      )}
      {r.cancelAtPeriodEnd && (
        <Badge bg="#fee2e2" color="#991b1b">
          จะยกเลิก{r.currentPeriodEnd ? ` ${formatDate(r.currentPeriodEnd)}` : ""}
        </Badge>
      )}
      {r.expiringSoon && <Badge bg="#ffedd5" color="#9a3412">ใกล้หมดอายุ</Badge>}
      {!r.lifetime && !r.inTrial && !r.paying && !r.isTeam && !r.hasStripe && !r.invoice && (
        <Badge bg="#f1f5f9" color="#475569">แผนฟรี</Badge>
      )}
    </div>
  );
}

export function intervalLabel(interval: string | null, invoice = false): string {
  if (interval === "yearly") return "รายปี";
  if (interval === "monthly") return "รายเดือน";
  if (invoice) return "กำหนดวันเอง";
  return "—";
}

/** ข้อความวันหมดอายุ + ความหมาย (trial หมด / ยกเลิกสิ้นรอบ / ต่ออายุ) */
export function expiryText(r: {
  expiryKind: "trial" | "cancel" | "renew" | "invoice" | "lifetime" | "none";
  expiresAt: string | null;
  daysLeft: number | null;
}): { text: string; sub: string; warn: boolean } {
  switch (r.expiryKind) {
    case "lifetime":
      return { text: "ไม่มีวันหมดอายุ", sub: "ฟรีตลอดชีพ", warn: false };
    case "trial":
      return {
        text: formatDate(r.expiresAt),
        sub: `ฟรีหมด${daysText(r.daysLeft)}`,
        warn: (r.daysLeft ?? 99) <= 7,
      };
    case "cancel":
      return {
        text: formatDate(r.expiresAt),
        sub: `ยกเลิกสิ้นรอบ${daysText(r.daysLeft)}`,
        warn: true,
      };
    case "invoice":
      return {
        text: formatDate(r.expiresAt),
        sub: `รอบวางบิลหมด${daysText(r.daysLeft)}`,
        warn: (r.daysLeft ?? 99) <= 7,
      };
    case "renew":
      return { text: formatDate(r.expiresAt), sub: "ต่ออายุอัตโนมัติ", warn: false };
    default:
      return { text: "—", sub: "", warn: false };
  }
}

function daysText(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return " (เลยมาแล้ว)";
  if (days === 0) return " (วันนี้)";
  return ` (อีก ${days} วัน)`;
}

export function limitText(n: number, unit: string) {
  return n === -1 ? `ไม่จำกัด${unit}` : `${n.toLocaleString("th-TH")} ${unit}`;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "ผู้ดูแล",
  manager: "ผู้จัดการ",
  accountant: "บัญชี",
  project_manager: "ผู้จัดการโปรเจกต์",
  staff: "พนักงาน",
  viewer: "ดูอย่างเดียว",
};

export const MEMBER_STATUS_LABELS: Record<string, string> = {
  active: "ใช้งาน",
  pending: "รอตอบรับ",
  removed: "ถูกนำออก",
  inactive: "ปิดใช้งาน",
};
