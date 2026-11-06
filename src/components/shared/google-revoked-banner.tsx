// ===========================================
// CO-08: แบนเนอร์ "การเชื่อมต่อ Google ของเจ้าของบริษัทถูกยกเลิก"
//
// ไม่มี hook — ใช้ได้ทั้ง server component (settings/google, dashboard shell)
// และ client component. ผู้ที่เป็นเจ้าของเห็นปุ่มเชื่อมต่อใหม่; สมาชิกคนอื่น
// เห็นแค่ข้อความให้ไปแจ้งเจ้าของ (token ของ org = token ของเจ้าของเท่านั้น)
// ===========================================

import { GOOGLE_REVOKED_MESSAGE } from "@/lib/google/errors";

export function GoogleRevokedBanner({
  isOwner,
  ownerEmail,
  reconnectHref = "/api/auth/google",
}: {
  /** ผู้ที่กำลังดูคือเจ้าของ org (คนเดียวที่เชื่อมต่อใหม่แล้วแก้ปัญหาได้) */
  isOwner: boolean;
  /** อีเมล Google ของเจ้าของ (ถ้ามี) ให้คนอื่นรู้ว่าต้องแจ้งใคร */
  ownerEmail?: string | null;
  reconnectHref?: string;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: "0.875rem 1rem",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: "0.5rem",
        marginBottom: "1rem",
        color: "#991b1b",
        fontSize: "0.875rem",
        lineHeight: 1.6,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <div>
        ⛔ <strong>{GOOGLE_REVOKED_MESSAGE}</strong>
        <br />
        <span style={{ fontSize: "0.8125rem" }}>
          {isOwner
            ? "ระหว่างนี้ทุกคนในบริษัทจะบันทึก/อ่านข้อมูลจาก Google Sheets ไม่ได้ — กดปุ่มด้านขวาเพื่อเชื่อมต่อใหม่ (ติ๊กสิทธิ์ Google Drive ให้ครบ)"
            : `ระหว่างนี้ระบบบันทึก/อ่านข้อมูลจาก Google Sheets ไม่ได้ — แจ้งเจ้าของบริษัท${
                ownerEmail ? ` (${ownerEmail})` : ""
              }ให้เชื่อมต่อ Google ใหม่`}
        </span>
      </div>
      {isOwner && (
        <a href={reconnectHref} className="app-btn app-btn-primary">
          🔄 เชื่อมต่อ Google ใหม่
        </a>
      )}
    </div>
  );
}
