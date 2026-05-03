// ===========================================
// /permissions — Client component (master-detail split view)
//
// Layout:
//   - Left: scrollable user list (compact rows + role/override badges)
//   - Right: permission grid of the selected user (grouped by PERMISSION_GROUPS)
//
// Toggle any cell → tRPC upsert (isCustom=true).
//
// Locked rows:
//   - Self        — can't edit your own permissions (prevents lockout)
//   - Org owner   — protected
//
// "Reset to default" button per user clears isCustom.
// ===========================================

"use client";

import { useEffect, useMemo, useState } from "react";
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
  "revenue",
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
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    let arr = members;
    if (filter === "custom") arr = arr.filter((m) => m.isCustom);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (m) =>
          m.displayName.toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [members, filter, search]);

  // Auto-select on first load: prefer self, else first member in filtered list
  useEffect(() => {
    if (members.length === 0) return;
    if (selectedMemberId) {
      const stillExists = members.some((m) => m.memberId === selectedMemberId);
      if (stillExists) return;
    }
    const self = members.find((m) => m.isSelf);
    setSelectedMemberId(self?.memberId || members[0].memberId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const selected = members.find((m) => m.memberId === selectedMemberId);

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🔐 จัดการสิทธิ์</h1>
          <p className="app-page-subtitle">
            {orgName} • คลิกเลือกสมาชิกทางซ้ายเพื่อปรับสิทธิ์รายคน (
            {members.length} คน)
          </p>
        </div>
      </div>

      {/* Help notice */}
      <div
        style={{
          padding: "0.625rem 0.875rem",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: "0.5rem",
          marginBottom: "1rem",
          fontSize: "0.8125rem",
          color: "#1e40af",
          lineHeight: 1.5,
        }}
      >
        ℹ️ ปรับสิทธิ์ระดับละเอียด — แก้ role ทั่วไปได้ที่{" "}
        <a
          href="/users"
          style={{ color: "#1d4ed8", textDecoration: "underline" }}
        >
          /users
        </a>{" "}
        • หน้านี้สำหรับ override ราย key. กด "รีเซ็ต" = กลับ default ของ role
      </div>

      {listQuery.isLoading ? (
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
      ) : members.length === 0 ? (
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
          ยังไม่มีสมาชิก
        </div>
      ) : (
        <div className="perm-split">
          {/* ===== LEFT: User list ===== */}
          <aside className="perm-list">
            {/* Filter + search */}
            <div className="perm-list-filter">
              <input
                type="text"
                placeholder="🔍 ค้นหาสมาชิก..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="app-input"
                style={{ fontSize: "0.8125rem" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "0.25rem",
                  marginTop: "0.5rem",
                }}
              >
                <button
                  onClick={() => setFilter("all")}
                  className={`app-btn app-btn-sm ${
                    filter === "all" ? "app-btn-primary" : "app-btn-ghost"
                  }`}
                  style={{ flex: 1 }}
                >
                  ทั้งหมด ({members.length})
                </button>
                <button
                  onClick={() => setFilter("custom")}
                  className={`app-btn app-btn-sm ${
                    filter === "custom" ? "app-btn-primary" : "app-btn-ghost"
                  }`}
                  style={{ flex: 1 }}
                >
                  Override ({members.filter((m) => m.isCustom).length})
                </button>
              </div>
            </div>

            {/* Member rows */}
            <div className="perm-list-scroll">
              {filteredMembers.length === 0 ? (
                <div
                  style={{
                    padding: "1.5rem",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: "0.8125rem",
                  }}
                >
                  ไม่พบสมาชิก
                </div>
              ) : (
                filteredMembers.map((m) => {
                  const roleMeta = ROLE_LABEL[m.role];
                  const isActive = m.memberId === selectedMemberId;
                  return (
                    <button
                      key={m.memberId}
                      onClick={() => setSelectedMemberId(m.memberId)}
                      className={`perm-list-item ${
                        isActive ? "perm-list-item-active" : ""
                      }`}
                      type="button"
                    >
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.avatarUrl}
                          alt=""
                          className="perm-list-avatar"
                        />
                      ) : (
                        <div
                          className="perm-list-avatar"
                          style={{
                            background: "#e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.875rem",
                            color: "#64748b",
                          }}
                        >
                          {m.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "0.875rem",
                            display: "flex",
                            gap: "0.25rem",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {m.displayName}
                          </span>
                          {m.isOwner && (
                            <span title="เจ้าขององค์กร">👑</span>
                          )}
                          {m.isSelf && !m.isOwner && (
                            <span
                              style={{
                                fontSize: "0.6875rem",
                                color: "#64748b",
                                fontWeight: 400,
                              }}
                            >
                              (คุณ)
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "0.6875rem",
                            color: "#94a3b8",
                            display: "flex",
                            gap: "0.375rem",
                            alignItems: "center",
                            marginTop: "0.125rem",
                          }}
                        >
                          <span
                            style={{
                              padding: "0.0625rem 0.375rem",
                              borderRadius: "0.25rem",
                              background: roleMeta.color + "20",
                              color: roleMeta.color,
                              fontWeight: 600,
                            }}
                          >
                            {roleMeta.label}
                          </span>
                          {m.isCustom && (
                            <span
                              style={{
                                color: "#b45309",
                                fontWeight: 600,
                              }}
                              title="ปรับ override แล้ว"
                            >
                              ⚙️
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* ===== RIGHT: Selected user detail ===== */}
          <section className="perm-detail">
            {!selected ? (
              <div
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "#94a3b8",
                }}
              >
                เลือกสมาชิกทางซ้ายเพื่อดู / แก้ไขสิทธิ์
              </div>
            ) : (
              <SelectedUserDetail
                member={selected}
                isResetting={resetMut.isPending}
                isUpdating={updateMut.isPending}
                onToggle={(key, value) =>
                  updateMut.mutate({
                    memberId: selected.memberId,
                    key,
                    value,
                  })
                }
                onReset={() => {
                  if (
                    !confirm(
                      `รีเซ็ตสิทธิ์ของ ${selected.displayName} กลับเป็น default ของ ${
                        ROLE_LABEL[selected.role].label
                      }?`
                    )
                  ) {
                    return;
                  }
                  resetMut.mutate({ memberId: selected.memberId });
                }}
              />
            )}
          </section>
        </div>
      )}

      <style jsx>{`
        .perm-split {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 1rem;
          align-items: start;
        }
        .perm-list {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          overflow: hidden;
          position: sticky;
          top: 1rem;
          max-height: calc(100vh - 2rem);
          display: flex;
          flex-direction: column;
        }
        .perm-list-filter {
          padding: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .perm-list-scroll {
          overflow-y: auto;
          flex: 1;
        }
        :global(.perm-list-item) {
          display: flex;
          gap: 0.625rem;
          align-items: center;
          padding: 0.625rem 0.75rem;
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid #f1f5f9;
          text-align: left;
          cursor: pointer;
          transition: background 0.1s;
        }
        :global(.perm-list-item:hover) {
          background: #f8fafc;
        }
        :global(.perm-list-item-active) {
          background: #eff6ff !important;
          border-left: 3px solid #2563eb;
          padding-left: calc(0.75rem - 3px);
        }
        :global(.perm-list-avatar) {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          flex-shrink: 0;
          object-fit: cover;
        }
        .perm-detail {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 1.25rem;
          min-height: 400px;
        }
        @media (max-width: 768px) {
          .perm-split {
            grid-template-columns: 1fr;
          }
          .perm-list {
            position: static;
            max-height: 320px;
          }
        }
      `}</style>
    </div>
  );
}

// -------------------------------------------------------------------
// Selected user detail (right panel)
// -------------------------------------------------------------------

interface MemberData {
  memberId: string;
  userId: string;
  role: Role;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  isOwner: boolean;
  isSelf: boolean;
  isCustom: boolean;
  permissions: Record<PermissionKey, boolean>;
}

function SelectedUserDetail({
  member,
  isResetting,
  isUpdating,
  onToggle,
  onReset,
}: {
  member: MemberData;
  isResetting: boolean;
  isUpdating: boolean;
  onToggle: (key: PermissionKey, value: boolean) => void;
  onReset: () => void;
}) {
  const isLocked = member.isOwner || member.isSelf;
  const lockReason = member.isOwner
    ? "เจ้าขององค์กร — ไม่สามารถแก้ไขสิทธิ์ได้"
    : member.isSelf
    ? "ไม่สามารถแก้ไขสิทธิ์ของตัวเองได้ (กันลืม lockout)"
    : null;
  const roleMeta = ROLE_LABEL[member.role];

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {member.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatarUrl}
              alt=""
              style={{ width: 48, height: 48, borderRadius: "50%" }}
            />
          ) : (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.125rem",
                color: "#64748b",
              }}
            >
              {member.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "1rem",
                display: "flex",
                gap: "0.375rem",
                alignItems: "center",
              }}
            >
              {member.displayName}
              <span
                className="app-badge"
                style={{
                  background: roleMeta.color + "20",
                  color: roleMeta.color,
                }}
              >
                {roleMeta.label}
              </span>
              {member.isCustom && (
                <span className="app-badge app-badge-warning">⚙️ Override</span>
              )}
              {member.isOwner && (
                <span className="app-badge app-badge-info">👑 Owner</span>
              )}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#64748b",
                marginTop: "0.125rem",
              }}
            >
              {member.email || "—"}
            </div>
          </div>
        </div>

        {member.isCustom && !isLocked && (
          <button
            onClick={onReset}
            className="app-btn app-btn-ghost app-btn-sm"
            disabled={isResetting}
          >
            ↺ รีเซ็ตเป็น default
          </button>
        )}
      </div>

      {/* Lock notice */}
      {lockReason && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
            fontSize: "0.8125rem",
            color: "#475569",
            marginBottom: "1rem",
          }}
        >
          🔒 {lockReason}
        </div>
      )}

      {/* Permission groups */}
      <div style={{ display: "grid", gap: "1rem" }}>
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
                {group.permissions.map((key) => (
                  <PermissionToggle
                    key={key}
                    permKey={key}
                    value={member.permissions[key]}
                    disabled={isLocked || isUpdating}
                    onChange={(next) => onToggle(key, next)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
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
