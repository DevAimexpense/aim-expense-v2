"use client";

import { useState } from "react";

export function CustomerPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Portal failed");
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="app-btn app-btn-secondary"
      >
        {loading ? "กำลังเปิด Stripe…" : "เปิด Customer Portal →"}
      </button>
      {error && (
        <p
          style={{
            marginTop: "0.375rem",
            fontSize: "0.75rem",
            color: "#dc2626",
          }}
        >
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
