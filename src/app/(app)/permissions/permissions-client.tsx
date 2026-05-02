// ===========================================
// /permissions — Client component
//
// Permission grid: members on the left, permission keys grouped by
// PERMISSION_GROUPS (events / masterData / payments / reports / admin).
// Toggle any cell → optimistic update + tRPC upsert (isCustom=true).
//
// Locked cells:
//   - Self        — can't edit your own permissions (prevents lockout)
//   - Org owner   — protected
//
// "Reset to default" button per row clears isCustom and re-applies the
// role's baseline.
// ===========================================

"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  PERMISSION_LABELS,
  PERMISSION_GROUPS,
  type PermissionKey,
} from "@/types/permissions";

type Role = "admin" | "manager" | "accountant" | "staff";

const ROLE_LABEL: Record<Role, { label: string; color: string }> = {
  admin: { label: "Admin", color: "#dc2626" },
  manager: { label: "Manager", color: "#7c3aed" },
  accountant: { label: "Accountant", color: "#2563eb" },
  staff: { label: "Staff", color: "#64748b" },
};

const GROUP_ORDER: Array<keyof typeof PERMISSION_GROUPS> = [
  "events",
  "masterData",
  "payments",
  "reports",
  "admin",
];

export function PermissionsClient({ orgName }: { orgName: string }) {
  const utils = trpc.useUtils();
  const listQuery = trpc.user.listPermissions.useQuery();
  const updateMut = trpc.user.updatePermission.useMutation({
    onSuccess: () => utils.user.listPermissions.invalidate(),
    onError: (err) => alert(err.message),
  });
  const resetMut = trpc.user.resetPermissions.useMutation({
    onSuccess: () => utils.user.listPermissions.invalidate(),
    onError: (err) => alert(err.message),
  });

  const members = listQuery.data?.members ?? [];

  const [filter, setFilter] = useState<"all" | "custom">("all");
  const filteredMembers = useMemo(() => {
    if (filter === "custom") return members.filter((m) => m.isCustom);
    return members;
  }, [members, filter]);

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🔐 จัดการสิทธิ์</h1>
          <p className="app-page-subtitle">
            {orgName} • ปรับแต่งสิทธิ์ของแต่ละสมาชิกแบบละเอียด (
            {members.length} คน)
          </p>
        </div>
      </div>

      {/* Help notice */}
      <div
        style={{
          padding: "0.75rem 1rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: "0.5rem",
          marginBottom: "1rem",
          fontSize: "0.8125rem",
          color: "#1e40af",
          lineHeight: 1.6,
        }}
      >
        ℹ️ <strong>ปรับสิทธิ์ระดับละเอียด</strong> — แก้ role ทั่วไปได้ที่{" "}
        <a href="/users" style={{ color: "#1d4ed8", textDecoration: "underline" }}>
          /users
        </a>{" "}
        • หน้านี้ใช้สำหรับปลดล็อก/ล็อกสิทธิ์เฉพาะรายการ (override).
        การกด "รีเซ็ต" จะเอาสิทธิ์กลับเป็นค่ามาตรฐานของ role
      </div>

      {/* Filter */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "0.75rem",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => setFilter("all")}
          className={`app-btn app-btn-sm ${
            filter === "all" ? "app-btn-primary" : "app-btn-ghost"
          }`}
        >
          ทั้งหมด ({members.length})
        </button>
        <button
          onClick={() => setFilter("custom")}
          className={`app-btn app-btn-sm ${
            filter === "custom" ? "app-btn-primary" : "app-btn-ghost"
          }`}
        >
          ปรับ override แล้ว ({members.filter((m) => m.isCustom).length})
        </button>
      </div>

      {/* Loading / empty */}
      {listQuery.isLoading && (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "#64748b",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "0.75rem",
          }}
        >
          กำลังโหลด…
        </div>
      )}

      {!listQuery.isLoading && filteredMembers.length === 0 && (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "#64748b",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "0.75rem",
          }}
        >
          {filter === "custom"
            ? "ยังไม่มีสมาชิกที่ปรับสิทธิ์ override"
            : "ยังไม่มีสมาชิก"}
        </div>
      )}

      {/* Member cards (one per user, all groups inline) */}
      {filteredMembers.map((m) => {
        const isLocked = m.isOwner || m.isSelf;
        const lockReason = m.isOwner
          ? "เจ้าขององค์กร — ไม่สามารถแก้ไขสิทธิ์ได้"
          : m.isSelf
          ? "ไม่สามารถแก้ไขสิทธิ์ของตัวเองได้"
          : null;
        const roleMeta = ROLE_LABEL[m.role];

        return (
          <section
            key={m.memberId}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              marginBottom: "1rem",
            }}
          >
            {/* Member header row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}
              >
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatarUrl}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: "50%" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "#e2e8f0",
                    }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{m.displayName}</div>
                  <div
                    style={{ fontSize: "0.75rem", color: "#64748b" }}
                  >
                    {m.email || "—"}
                  </div>
                </div>
                <span
                  className="app-badge"
                  style={{
                    background: roleMeta.color + "20",
                    color: roleMeta.color,
                    marginLeft: "0.25rem",
                  }}
                >
                  {roleMeta.label}
                </span>
                {m.isCustom && (
                  <span className="app-badge app-badge-warning">
                    ⚙️ Override
                  </span>
                )}
                {m.isOwner && (
                  <span className="app-badge app-badge-info">👑 Owner</span>
                )}
                {m.isSelf && !m.isOwner && (
                  <span className="app-badge app-badge-neutral">คุณ</span>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                {m.isCustom && !isLocked && (
                  <button
                    onClick={() => {
                      if (
                        !confirm(
                          `รีเซ็ตสิทธิ์ของ ${m.displayName} กลับเป็น default ของ ${roleMeta.label}?`,
                        )
                      ) {
                        return;
                      }
                      resetMut.mutate({ memberId: m.memberId });
                    }}
                    className="app-btn app-btn-ghost app-btn-sm"
                    disabled={resetMut.isPending}
                  >
                    ↺ รีเซ็ตเป็น default
                  </button>
                )}
              </div>
            </div>

            {/* Lock notice */}
            {lockReason && (
              <div
                style={{
                  padding: "0.5rem 0.75rem",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginBottom: "0.875rem",
                }}
              >
                🔒 {lockReason}
              </div>
            )}

            {/* Permission groups */}
            <div style={{ display: "grid", gap: "0.875rem" }}>
              {GROUP_ORDER.map((groupKey) => {
                const group = PERMISSION_GROUPS[groupKey];
                return (
                  <div
                    key={groupKey}
                    style={{
                      borderTop: "1px dashed #e2e8f0",
                      paddingTop: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {group.label}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(220px, 1fr))",
                        gap: "0.5rem",
                      }}
                    >
                      {group.permissions.map((key) => {
                        const value = m.permissions[key];
                        return (
                          <PermissionToggle
                            key={key}
                            permKey={key}
                            value={value}
                            disabled={isLocked || updateMut.isPending}
                            onChange={(next) =>
                              updateMut.mutate({
                                memberId: m.memberId,
                                key,
                                value: next,
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------
// Toggle cell
// -------------------------------------------------------------------

function PermissionToggle({
  permKey,
  value,
  disabled,
  onChange,
}: {
  permKey: PermissionKey;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem 0.625rem",
        background: value ? "#ecfdf5" : "#f8fafc",
        border: `1px solid ${value ? "#a7f3d0" : "#e2e8f0"}`,
        borderRadius: "0.5rem",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontSize: "0.8125rem",
        transition: "background 0.15s",
      }}
    >
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ cursor: disabled ? "not-allowed" : "pointer" }}
      />
      <span style={{ color: value ? "#065f46" : "#475569" }}>
        {PERMISSION_LABELS[permKey]}
      </span>
    </label>
  );
}
