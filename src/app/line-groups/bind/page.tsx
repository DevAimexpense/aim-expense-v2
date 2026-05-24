"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

function BindInner() {
  const params = useSearchParams();
  const groupId = params.get("g") || "";

  const orgsQuery = trpc.org.mine.useQuery(undefined, { retry: false });
  const bindMut = trpc.lineGroup.bind.useMutation();

  const [selected, setSelected] = useState<string>("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgs = (orgsQuery.data || []).filter((o) => o.role === "admin");

  const handleBind = async () => {
    setError(null);
    if (!selected) {
      setError("กรุณาเลือกบริษัท");
      return;
    }
    try {
      await bindMut.mutateAsync({ groupId, orgId: selected });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const card: React.CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: "2rem",
    maxWidth: 480,
    width: "100%",
    boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
  };

  if (!groupId) {
    return (
      <Shell>
        <div style={card}>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>ลิงก์ไม่ถูกต้อง</h1>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
            ไม่พบรหัสกลุ่ม — กรุณาเปิดลิงก์จากข้อความที่บอทส่งในกลุ่ม LINE อีกครั้ง
          </p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>✅</div>
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>เชื่อมกลุ่มสำเร็จ</h1>
          <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
            กลับไปที่กลุ่ม LINE แล้วส่งรูปใบเสร็จ/พิมพ์รายการได้เลย —
            ระบบจะบันทึกเข้าบริษัทที่เลือกค่ะ
          </p>
        </div>
      </Shell>
    );
  }

  // Not logged in → org.mine errors out.
  if (orgsQuery.isError) {
    const next = encodeURIComponent(`/line-groups/bind?g=${groupId}`);
    return (
      <Shell>
        <div style={{ ...card, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>กรุณาเข้าสู่ระบบ</h1>
          <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
            เข้าสู่ระบบด้วยบัญชี Admin เพื่อเลือกบริษัทที่จะเชื่อมกับกลุ่มนี้
          </p>
          <a
            href={`/login?next=${next}`}
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              background: "#06c755",
              color: "white",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            เข้าสู่ระบบ
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={card}>
        <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.375rem" }}>เชื่อมกลุ่ม LINE</h1>
        <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          เลือกบริษัทที่จะรับใบเสร็จ/รายจ่ายจากกลุ่มนี้
        </p>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              padding: "0.625rem 0.875rem",
              borderRadius: 8,
              fontSize: "0.8125rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        {orgsQuery.isLoading ? (
          <p style={{ color: "#64748b" }}>กำลังโหลด...</p>
        ) : orgs.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
            คุณยังไม่ได้เป็น Admin ของบริษัทใด — เฉพาะ Admin เท่านั้นที่เชื่อมกลุ่มได้
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gap: "0.5rem", marginBottom: "1.25rem" }}>
              {orgs.map((o) => (
                <label
                  key={o.orgId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.875rem 1rem",
                    border: `2px solid ${selected === o.orgId ? "#06c755" : "#e2e8f0"}`,
                    borderRadius: 10,
                    background: selected === o.orgId ? "#f0fdf4" : "white",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="org"
                    value={o.orgId}
                    checked={selected === o.orgId}
                    onChange={() => setSelected(o.orgId)}
                  />
                  <span style={{ fontWeight: 600 }}>{o.orgName}</span>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {o.entityType === "personal" ? "👤 ส่วนตัว" : "🏢 บริษัท"}
                  </span>
                </label>
              ))}
            </div>
            <button
              onClick={handleBind}
              disabled={bindMut.isPending || !selected}
              style={{
                width: "100%",
                padding: "0.875rem",
                background: selected ? "#06c755" : "#86efac",
                color: "white",
                border: "none",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: "0.9375rem",
                cursor: selected ? "pointer" : "not-allowed",
              }}
            >
              {bindMut.isPending ? "กำลังเชื่อม..." : "เชื่อมกลุ่มนี้"}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f1f5f9",
        padding: "2rem 1rem",
      }}
    >
      {children}
    </div>
  );
}

export default function LineGroupBindPage() {
  return (
    <Suspense fallback={null}>
      <BindInner />
    </Suspense>
  );
}
