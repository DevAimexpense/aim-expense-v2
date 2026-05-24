"use client";

import { trpc } from "@/lib/trpc/client";

export default function LineGroupsPage() {
  const utils = trpc.useUtils();
  const listQuery = trpc.lineGroup.list.useQuery();
  const unbindMut = trpc.lineGroup.unbind.useMutation();
  const groups = listQuery.data || [];

  const handleUnbind = async (id: string, name: string | null) => {
    if (!confirm(`ยกเลิกการเชื่อมกลุ่ม${name ? ` "${name}"` : ""} ใช่หรือไม่?`)) return;
    try {
      await unbindMut.mutateAsync({ id });
      utils.lineGroup.list.invalidate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.375rem" }}>💬 LINE กลุ่มที่เชื่อม</h1>
          <a href="/dashboard" style={{ fontSize: "0.875rem", color: "#2563eb", textDecoration: "none" }}>
            ← กลับแดชบอร์ด
          </a>
        </div>

        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 10,
            padding: "0.875rem 1rem",
            fontSize: "0.8125rem",
            color: "#1e3a8a",
            marginBottom: "1.25rem",
          }}
        >
          💡 วิธีเชื่อม: เชิญ LINE OA <strong>Aim Expense</strong> เข้ากลุ่ม →
          บอทจะส่งลิงก์ → Admin กดเลือกบริษัท → เสร็จ. จากนั้นสมาชิกในกลุ่มส่งรูปใบเสร็จ/พิมพ์รายการได้เลย
        </div>

        {listQuery.isLoading ? (
          <p style={{ color: "#64748b" }}>กำลังโหลด...</p>
        ) : groups.length === 0 ? (
          <div
            style={{
              background: "white",
              border: "1px dashed #cbd5e1",
              borderRadius: 12,
              padding: "2rem",
              textAlign: "center",
              color: "#64748b",
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>💬</div>
            <p style={{ margin: 0, fontWeight: 600 }}>ยังไม่มีกลุ่มที่เชื่อม</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem" }}>
              เชิญ OA เข้ากลุ่มเพื่อเริ่มเชื่อม
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {groups.map((g) => (
              <div
                key={g.id}
                style={{
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {g.groupName || "กลุ่ม LINE"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                    เชื่อมโดย {g.boundByName} ·{" "}
                    {new Date(g.createdAt).toLocaleDateString("th-TH")}
                  </div>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      color: "#94a3b8",
                      fontFamily: "ui-monospace",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {g.groupId}
                  </div>
                </div>
                <button
                  onClick={() => handleUnbind(g.id, g.groupName)}
                  disabled={unbindMut.isPending}
                  style={{
                    flexShrink: 0,
                    padding: "0.5rem 0.875rem",
                    background: "white",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    borderRadius: 8,
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ยกเลิก
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
