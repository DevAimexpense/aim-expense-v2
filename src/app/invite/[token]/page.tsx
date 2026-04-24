"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  accountant: "Accountant",
  staff: "Staff",
};

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params?.token === "string" ? params.token : "";

  const invitationQuery = trpc.user.getInvitation.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );
  const acceptMut = trpc.user.acceptInvitation.useMutation();

  // Check if user logged in (via session cookie check — simple heuristic)
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setIsAuthed(!!data?.userId))
      .catch(() => setIsAuthed(false))
      .finally(() => setCheckingAuth(false));
  }, []);

  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const handleAccept = async () => {
    setError(null);
    setAccepting(true);
    try {
      await acceptMut.mutateAsync({ token });
      setAccepted(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setAccepting(false);
    }
  };

  const handleLogin = () => {
    window.location.href = `/api/auth/line?next=${encodeURIComponent(`/invite/${token}`)}`;
  };

  if (invitationQuery.isLoading || checkingAuth) {
    return <CenterCard><p>กำลังโหลด...</p></CenterCard>;
  }

  const inv = invitationQuery.data;

  if (!inv) {
    return (
      <CenterCard>
        <h2 style={{ margin: "0 0 0.5rem 0" }}>❌ ไม่พบคำเชิญ</h2>
        <p style={{ color: "#64748b", margin: 0 }}>Link คำเชิญไม่ถูกต้อง หรือถูกลบแล้ว</p>
      </CenterCard>
    );
  }

  if (inv.status === "cancelled" || inv.status === "expired") {
    return (
      <CenterCard>
        <h2 style={{ margin: "0 0 0.5rem 0" }}>⚠️ คำเชิญถูกยกเลิก/หมดอายุ</h2>
        <p style={{ color: "#64748b", margin: 0 }}>กรุณาติดต่อผู้ส่งคำเชิญให้สร้างใหม่</p>
      </CenterCard>
    );
  }

  if (inv.status === "accepted") {
    return (
      <CenterCard>
        <h2 style={{ margin: "0 0 0.5rem 0" }}>✅ คำเชิญนี้ถูกใช้ไปแล้ว</h2>
        <p style={{ color: "#64748b", margin: 0 }}>
          หากคุณเป็นผู้รับเชิญ สามารถเข้าใช้งานได้จาก{" "}
          <a href="/dashboard" style={{ color: "#2563eb" }}>Dashboard</a>
        </p>
      </CenterCard>
    );
  }

  if (inv.isExpired) {
    return (
      <CenterCard>
        <h2 style={{ margin: "0 0 0.5rem 0" }}>⏰ คำเชิญหมดอายุ</h2>
        <p style={{ color: "#64748b", margin: 0 }}>คำเชิญนี้หมดอายุไปแล้ว กรุณาขอใหม่</p>
      </CenterCard>
    );
  }

  if (accepted) {
    return (
      <CenterCard>
        <h2 style={{ margin: "0 0 0.5rem 0", color: "#16a34a" }}>🎉 เข้าร่วมสำเร็จ!</h2>
        <p style={{ color: "#64748b", margin: 0 }}>กำลังพาไปที่หน้า Dashboard...</p>
      </CenterCard>
    );
  }

  return (
    <CenterCard>
      {inv.orgLogoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={inv.orgLogoUrl}
          alt=""
          style={{ width: 64, height: 64, borderRadius: 12, margin: "0 auto 1rem" }}
        />
      )}
      <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "1.375rem" }}>คำเชิญเข้าร่วมองค์กร</h2>
      <p style={{ margin: "0 0 1.5rem 0", color: "#64748b" }}>
        <b style={{ color: "#0f172a" }}>{inv.orgName}</b>
      </p>

      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "1rem",
          marginBottom: "1.5rem",
          textAlign: "left",
        }}
      >
        <InfoRow label="ชื่อที่ผู้เชิญตั้งให้" value={inv.displayName} />
        <InfoRow label="Role" value={ROLE_LABEL[inv.role] || inv.role} />
        <InfoRow
          label="หมดอายุ"
          value={new Date(inv.expiresAt).toLocaleString("th-TH")}
        />
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: "0.75rem",
            borderRadius: 6,
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      {!isAuthed ? (
        <>
          <button
            onClick={handleLogin}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              background: "#06C755",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            เข้าสู่ระบบด้วย LINE
          </button>
          <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.75rem" }}>
            คุณต้อง login ด้วย LINE account เพื่อเข้าร่วมองค์กรนี้
          </p>
        </>
      ) : (
        <>
          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: "0.9375rem",
              fontWeight: 600,
              cursor: accepting ? "not-allowed" : "pointer",
              opacity: accepting ? 0.6 : 1,
            }}
          >
            {accepting ? "กำลังเข้าร่วม..." : "✅ ยืนยันเข้าร่วมองค์กร"}
          </button>
        </>
      )}
    </CenterCard>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
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
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: "2rem",
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.375rem 0",
        fontSize: "0.875rem",
      }}
    >
      <span style={{ color: "#64748b" }}>{label}</span>
      <b style={{ color: "#0f172a" }}>{value}</b>
    </div>
  );
}
