"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "#dc2626" },
  manager: { label: "Manager", color: "#7c3aed" },
  accountant: { label: "Accountant", color: "#2563eb" },
  staff: { label: "Staff", color: "#64748b" },
};

export default function SelectOrgPage() {
  const router = useRouter();
  const orgsQuery = trpc.org.mine.useQuery();
  const setActiveMut = trpc.org.setActive.useMutation();

  const orgs = orgsQuery.data || [];

  // Auto-redirect if user has no orgs → onboarding
  useEffect(() => {
    if (!orgsQuery.isLoading && orgs.length === 0) {
      router.replace("/onboarding/company");
    }
  }, [orgsQuery.isLoading, orgs.length, router]);

  const handleSelect = async (orgId: string) => {
    try {
      await setActiveMut.mutateAsync({ orgId });
      router.push("/dashboard");
    } catch (e) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

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
          borderRadius: 16,
          padding: "2rem",
          maxWidth: 560,
          width: "100%",
          boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ margin: "0 0 0.25rem 0", fontSize: "1.5rem" }}>เลือกบริษัท</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.875rem" }}>
            เลือกบริษัทที่ต้องการใช้งานก่อนเข้าสู่ระบบ
          </p>
        </div>

        {orgsQuery.isLoading ? (
          <p style={{ textAlign: "center", color: "#64748b" }}>กำลังโหลด...</p>
        ) : (
          <>
            <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {orgs.map((org) => {
                const role = ROLE_BADGE[org.role] || ROLE_BADGE.staff;
                return (
                  <button
                    key={org.orgId}
                    onClick={() => handleSelect(org.orgId)}
                    disabled={setActiveMut.isPending}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.875rem",
                      padding: "1rem",
                      border: "2px solid #e2e8f0",
                      borderRadius: 10,
                      background: "white",
                      cursor: "pointer",
                      transition: "all 150ms",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#2563eb";
                      (e.currentTarget as HTMLButtonElement).style.background = "#eff6ff";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0";
                      (e.currentTarget as HTMLButtonElement).style.background = "white";
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 10,
                        background: org.logoUrl ? "transparent" : "#f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        color: "#64748b",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {org.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={org.logoUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        org.orgName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                        {org.orgName}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.125rem 0.5rem",
                            background: role.color + "20",
                            color: role.color,
                            borderRadius: 4,
                            fontWeight: 600,
                            marginRight: "0.5rem",
                          }}
                        >
                          {role.label}
                        </span>
                        เข้าร่วมเมื่อ{" "}
                        {org.joinedAt
                          ? new Date(org.joinedAt).toLocaleDateString("th-TH")
                          : "-"}
                      </div>
                    </div>
                    <span style={{ fontSize: "1.25rem", color: "#94a3b8" }}>→</span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                borderTop: "1px solid #e2e8f0",
                paddingTop: "1rem",
                display: "flex",
                gap: "0.5rem",
              }}
            >
              <a
                href="/onboarding/google"
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  background: "white",
                  border: "2px dashed #cbd5e1",
                  borderRadius: 10,
                  textAlign: "center",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#475569",
                  textDecoration: "none",
                }}
              >
                ➕ สร้างบริษัทใหม่
              </a>
              <a
                href="/api/auth/logout"
                style={{
                  padding: "0.75rem 1rem",
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  fontSize: "0.875rem",
                  color: "#64748b",
                  textDecoration: "none",
                }}
              >
                ออกจากระบบ
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
