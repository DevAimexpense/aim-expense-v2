"use client";

// ===========================================
// สถานะ "บันทึก PDF ลง Drive" บนแถบเครื่องมือของหน้าเอกสาร (ไม่พิมพ์ออก)
// บันทึกเองเมื่อเปิดหน้า ถ้าไฟล์ใน Drive ยังไม่มีหรือเก่ากว่าข้อมูล — ดู useSalesDocAutoSave
// ===========================================

import { useSalesDocAutoSave, type SalesDocKind } from "@/lib/utils/sales-doc-autosave";

export interface DriveSaveProps {
  kind: SalesDocKind;
  id: string;
  version: string;
  savedFor: string;
  savedUrl: string;
  enabled: boolean;
}

export function DriveSaveStatus(props: DriveSaveProps) {
  // ?download=1 = แท็บดาวน์โหลดที่ปิดตัวเองทันที — ไม่บันทึกซ้อน (หน้ารายละเอียดสั่งบันทึกให้อยู่แล้ว)
  const downloadOnly =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("download") === "1";
  const { state, fileUrl, error } = useSalesDocAutoSave({ ...props, enabled: props.enabled && !downloadOnly });

  if (!props.enabled || downloadOnly || state === "idle" || state === "skipped") return null;
  const chip: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0 0.75rem",
    borderRadius: "0.5rem",
    fontSize: "0.8125rem",
    whiteSpace: "nowrap",
  };
  if (state === "saving") {
    return <span style={{ ...chip, background: "#f1f5f9", color: "#475569" }}>⏳ กำลังบันทึกลง Drive…</span>;
  }
  if (state === "saved" && fileUrl) {
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...chip, background: "#dcfce7", color: "#166534", textDecoration: "none" }}
      >
        ☁️ บันทึกลง Drive แล้ว
      </a>
    );
  }
  return (
    <span title={error} style={{ ...chip, background: "#fef2f2", color: "#b91c1c" }}>
      ⚠️ บันทึกลง Drive ไม่สำเร็จ — เปิดหน้านี้ใหม่เพื่อลองอีกครั้ง
    </span>
  );
}
