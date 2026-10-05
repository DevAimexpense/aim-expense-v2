"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  action: "cancel" | "resume";
  periodEnd?: string | null;
}

export function CancelPlanButton({ action, periodEnd }: Props) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCancel = action === "cancel";

  const onClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "ดำเนินการไม่สำเร็จ");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {isCancel && (
        <label
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-start",
            fontSize: "0.875rem",
            color: "#334155",
            marginBottom: "1rem",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            ฉันเข้าใจว่าแพ็กเกจจะสิ้นสุด
            {periodEnd ? `วันที่ ${periodEnd}` : "เมื่อสิ้นรอบบิลปัจจุบัน"}{" "}
            และบัญชีจะกลับเป็น Free Forever
          </span>
        </label>
      )}
      {error && <div className="app-error-msg">{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Link href="/account/billing" className="app-btn app-btn-secondary">
          {isCancel ? "ไม่ยกเลิก — กลับหน้าแพ็กเกจ" : "← กลับหน้าแพ็กเกจ"}
        </Link>
        <button
          type="button"
          onClick={onClick}
          disabled={loading || (isCancel && !agreed)}
          className={isCancel ? "app-btn app-btn-ghost" : "app-btn app-btn-primary"}
          style={isCancel ? { color: "#dc2626", border: "1px solid #fecaca" } : undefined}
        >
          {loading
            ? "กำลังดำเนินการ…"
            : isCancel
              ? "ยืนยันยกเลิกแพ็กเกจ"
              : "ใช้แพ็กเกจต่อ (ยกเลิกคำขอยกเลิก)"}
        </button>
      </div>
    </div>
  );
}
