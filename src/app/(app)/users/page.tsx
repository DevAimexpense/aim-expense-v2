"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { PERMISSION_LABELS } from "@/types/permissions";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";

type Role = "admin" | "manager" | "accountant" | "staff";

const ROLE_LABEL: Record<Role, { label: string; color: string; desc: string }> = {
  admin: { label: "Admin", color: "#dc2626", desc: "ทุกอย่าง รวมจัดการผู้ใช้" },
  manager: { label: "Manager", color: "#7c3aed", desc: "จัดการ + อนุมัติ + รายงาน" },
  accountant: { label: "Accountant", color: "#2563eb", desc: "จ่ายเงิน + รายงาน" },
  staff: { label: "Staff", color: "#64748b", desc: "ดูข้อมูลพื้นฐาน" },
};

export default function UsersPage() {
  const utils = trpc.useUtils();
  const usersQuery = trpc.user.list.useQuery();
  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  const [showInvite, setShowInvite] = useState(false);
  const [invitedLink, setInvitedLink] = useState<string | null>(null);

  const members = usersQuery.data?.members || [];
  const invitations = usersQuery.data?.invitations || [];

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">👥 จัดการผู้ใช้</h1>
          <p className="app-page-subtitle">
            สมาชิกในองค์กร + ส่งคำเชิญผ่าน LINE ({members.length}/
            {usersQuery.data ? members.length + invitations.length : "-"} คน)
          </p>
        </div>
        <button onClick={() => setShowInvite(true)} className="app-btn app-btn-primary">
          + เชิญสมาชิกใหม่
        </button>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="app-card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem 0" }}>
            📮 คำเชิญที่รอรับ ({invitations.length})
          </h3>
          <div className="app-table-wrap">
            <table className="app-table">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>Role</th>
                  <th>Event Scope</th>
                  <th>หมดอายุ</th>
                  <th className="text-right"></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <InvitationRow
                    key={inv.invitationId}
                    invitation={inv}
                    events={events}
                    onChange={() => utils.user.list.invalidate()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>Email</th>
              <th>Role</th>
              <th>Event Scope</th>
              <th>สถานะ</th>
              <th>เข้าร่วม</th>
              <th className="text-right"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <MemberRow
                key={m.memberId}
                member={m}
                events={events}
                onChange={() => utils.user.list.invalidate()}
              />
            ))}
            {members.length === 0 && !usersQuery.isLoading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                  ยังไม่มีสมาชิก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          events={events}
          onClose={() => {
            setShowInvite(false);
            setInvitedLink(null);
          }}
          onSuccess={(link) => {
            setInvitedLink(link);
            utils.user.list.invalidate();
          }}
          invitedLink={invitedLink}
        />
      )}
    </div>
  );
}

// ===== Invitation Row =====
function InvitationRow({
  invitation,
  events,
  onChange,
}: {
  invitation: {
    invitationId: string;
    token: string;
    displayName: string;
    role: Role;
    eventScope: string[];
    expiresAt: Date | string;
  };
  events: Array<{ eventId: string; eventName: string }>;
  onChange: () => void;
}) {
  const cancelMut = trpc.user.cancelInvitation.useMutation();
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/${invitation.token}`
      : "";

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    alert("คัดลอก link แล้ว — วางใน LINE chat/group ให้ผู้ได้รับเชิญ");
  };

  const scopeText =
    invitation.eventScope.length === 0
      ? "ทุกโปรเจกต์"
      : invitation.eventScope
          .map((id) => events.find((e) => e.eventId === id)?.eventName || id)
          .join(", ");

  const label = ROLE_LABEL[invitation.role];

  return (
    <tr>
      <td>{invitation.displayName}</td>
      <td>
        <span
          className="app-badge"
          style={{ background: label.color + "20", color: label.color }}
        >
          {label.label}
        </span>
      </td>
      <td style={{ fontSize: "0.8125rem", color: "#475569" }}>{scopeText}</td>
      <td style={{ fontSize: "0.75rem", color: "#64748b" }}>
        {new Date(invitation.expiresAt).toLocaleString("th-TH")}
      </td>
      <td className="text-right">
        <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end" }}>
          <button onClick={copyLink} className="app-btn app-btn-secondary app-btn-sm">
            📋 Copy Link
          </button>
          <button
            onClick={async () => {
              if (!confirm("ยกเลิกคำเชิญนี้?")) return;
              await cancelMut.mutateAsync({ invitationId: invitation.invitationId });
              onChange();
            }}
            className="app-btn app-btn-ghost app-btn-sm"
            style={{ color: "#dc2626" }}
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ===== Member Row =====
function MemberRow({
  member,
  events,
  onChange,
}: {
  member: {
    memberId: string;
    userId: string;
    role: Role;
    status: string;
    eventScope: string[];
    joinedAt: Date | string | null;
    displayName: string;
    avatarUrl: string | null;
    email: string;
  };
  events: Array<{ eventId: string; eventName: string }>;
  onChange: () => void;
}) {
  const updateMut = trpc.user.updateMember.useMutation();
  const removeMut = trpc.user.removeMember.useMutation();
  const [editing, setEditing] = useState(false);

  const label = ROLE_LABEL[member.role];
  const scopeText =
    member.eventScope.length === 0
      ? "ทุกโปรเจกต์"
      : member.eventScope
          .map((id) => events.find((e) => e.eventId === id)?.eventName || id)
          .join(", ");

  return (
    <>
      <tr>
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {member.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.avatarUrl}
                alt=""
                style={{ width: 28, height: 28, borderRadius: "50%" }}
              />
            ) : (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#e2e8f0",
                  display: "inline-block",
                }}
              />
            )}
            {member.displayName}
          </div>
        </td>
        <td style={{ fontSize: "0.8125rem", color: "#475569" }}>{member.email || "-"}</td>
        <td>
          <span
            className="app-badge"
            style={{ background: label.color + "20", color: label.color }}
          >
            {label.label}
          </span>
        </td>
        <td style={{ fontSize: "0.8125rem", color: "#475569" }}>{scopeText}</td>
        <td>
          <span
            className={`app-badge ${
              member.status === "active" ? "app-badge-success" : "app-badge-warning"
            }`}
          >
            {member.status === "active" ? "Active" : member.status}
          </span>
        </td>
        <td style={{ fontSize: "0.75rem", color: "#64748b" }}>
          {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("th-TH") : "-"}
        </td>
        <td className="text-right">
          <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end" }}>
            <button
              onClick={() => setEditing(!editing)}
              className="app-btn app-btn-ghost app-btn-sm"
            >
              ✏️
            </button>
            <button
              onClick={async () => {
                if (!confirm(`ลบ ${member.displayName} ออกจากองค์กร?`)) return;
                try {
                  await removeMut.mutateAsync({ memberId: member.memberId });
                  onChange();
                } catch (e) {
                  alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
                }
              }}
              className="app-btn app-btn-ghost app-btn-sm"
              style={{ color: "#dc2626" }}
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7} style={{ background: "#f8fafc", padding: "1rem" }}>
            <MemberEditForm
              member={member}
              events={events}
              onSave={async (patch) => {
                try {
                  await updateMut.mutateAsync({ memberId: member.memberId, ...patch });
                  setEditing(false);
                  onChange();
                } catch (e) {
                  alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
                }
              }}
              onCancel={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function MemberEditForm({
  member,
  events,
  onSave,
  onCancel,
}: {
  member: { role: Role; eventScope: string[] };
  events: Array<{ eventId: string; eventName: string }>;
  onSave: (patch: { role?: Role; eventScope?: string[] }) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  const [scope, setScope] = useState<string[]>(member.eventScope);
  const [scopeAll, setScopeAll] = useState(member.eventScope.length === 0);

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="app-label">Role</label>
          <SearchableSelect
            options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({
              value: r,
              label: `${ROLE_LABEL[r].label} — ${ROLE_LABEL[r].desc}`,
            }))}
            value={role}
            onChange={(val) => setRole(val as Role)}
            className="app-select"
          />
        </div>
        <div>
          <label className="app-label">Event Scope</label>
          <label className="app-checkbox" style={{ fontSize: "0.8125rem" }}>
            <input
              type="checkbox"
              checked={scopeAll}
              onChange={(e) => {
                setScopeAll(e.target.checked);
                if (e.target.checked) setScope([]);
              }}
            />
            เห็นทุกโปรเจกต์
          </label>
          {!scopeAll && (
            <div
              style={{
                maxHeight: 120,
                overflow: "auto",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "0.5rem",
                marginTop: "0.25rem",
              }}
            >
              {events.map((e) => (
                <label
                  key={e.eventId}
                  className="app-checkbox"
                  style={{ display: "flex", fontSize: "0.8125rem", padding: "0.125rem 0" }}
                >
                  <input
                    type="checkbox"
                    checked={scope.includes(e.eventId)}
                    onChange={(ev) => {
                      if (ev.target.checked) setScope([...scope, e.eventId]);
                      else setScope(scope.filter((id) => id !== e.eventId));
                    }}
                  />
                  {e.eventName}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={onCancel} className="app-btn app-btn-secondary app-btn-sm">
          ยกเลิก
        </button>
        <button
          onClick={() => onSave({ role, eventScope: scopeAll ? [] : scope })}
          className="app-btn app-btn-primary app-btn-sm"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}

// ===== Invite Modal =====
function InviteModal({
  events,
  onClose,
  onSuccess,
  invitedLink,
}: {
  events: Array<{ eventId: string; eventName: string }>;
  onClose: () => void;
  onSuccess: (link: string) => void;
  invitedLink: string | null;
}) {
  const inviteMut = trpc.user.invite.useMutation();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [error, setError] = useState<string | null>(null);

  const handleInvite = async () => {
    setError(null);
    if (!name.trim()) {
      setError("กรุณากรอกชื่อ");
      return;
    }
    try {
      const result = await inviteMut.mutateAsync({
        displayName: name.trim(),
        role,
        eventScope: [], // assign โปรเจกต์ทีหลังจากหน้า /users หรือหน้า Event
      });
      const link = `${window.location.origin}/invite/${result.token}`;
      onSuccess(link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const copyLink = async () => {
    if (!invitedLink) return;
    await navigator.clipboard.writeText(invitedLink);
    alert("คัดลอก link แล้ว — วางใน LINE chat/group");
  };

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="app-modal modal-lg">
        <div className="app-modal-header">
          <h3 className="app-modal-title">
            {invitedLink ? "✅ สร้างคำเชิญแล้ว" : "➕ เชิญสมาชิกใหม่"}
          </h3>
          <button onClick={onClose} className="app-btn app-btn-ghost app-btn-icon">
            ✕
          </button>
        </div>
        <div className="app-modal-body">
          {!invitedLink ? (
            <>
              {error && <div className="app-error-msg">{error}</div>}
              <div className="app-form-group">
                <label className="app-label app-label-required">ชื่อ (ที่จะแสดงในระบบ)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น พิมพ์รตา อ."
                  className="app-input"
                  autoFocus
                />
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">Role</label>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <label
                      key={r}
                      style={{
                        padding: "0.625rem 0.875rem",
                        border: `2px solid ${role === r ? ROLE_LABEL[r].color : "#e2e8f0"}`,
                        borderRadius: 8,
                        cursor: "pointer",
                        background: role === r ? ROLE_LABEL[r].color + "10" : "white",
                      }}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        checked={role === r}
                        onChange={() => setRole(r)}
                        style={{ marginRight: "0.5rem" }}
                      />
                      <b style={{ color: ROLE_LABEL[r].color }}>{ROLE_LABEL[r].label}</b>
                      <span style={{ fontSize: "0.8125rem", color: "#64748b", marginLeft: "0.5rem" }}>
                        — {ROLE_LABEL[r].desc}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "0.75rem",
                  borderRadius: 6,
                  fontSize: "0.8125rem",
                  color: "#1e3a8a",
                }}
              >
                ℹ️ หลังสร้างคำเชิญ → copy link → วางใน LINE → ผู้ได้รับเชิญ login ด้วย LINE → เข้าร่วมอัตโนมัติ (หมดอายุ 24 ชม.)
                <br />
                💡 <b>มอบหมายโปรเจกต์</b>: ทำทีหลังหลังสมาชิกเข้าร่วม — กดปุ่ม ✏️ ข้างชื่อสมาชิก หรือจัดการที่หน้า Event
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  padding: "1rem",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 6,
                  marginBottom: "1rem",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, color: "#166534" }}>
                  ✅ คำเชิญถูกสร้างแล้ว — หมดอายุใน 24 ชม.
                </p>
              </div>
              <label className="app-label">Link คำเชิญ</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={invitedLink}
                  readOnly
                  className="app-input"
                  style={{ flex: 1, fontFamily: "monospace", fontSize: "0.75rem" }}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button onClick={copyLink} className="app-btn app-btn-primary">
                  📋 Copy
                </button>
              </div>
              <p className="app-hint">วาง link นี้ใน LINE chat/group ให้ผู้ได้รับเชิญคลิก</p>
            </>
          )}
        </div>
        <div className="app-modal-footer">
          {!invitedLink ? (
            <>
              <button onClick={onClose} className="app-btn app-btn-secondary">
                ยกเลิก
              </button>
              <button
                onClick={handleInvite}
                disabled={inviteMut.isPending}
                className="app-btn app-btn-primary"
              >
                {inviteMut.isPending ? (
                  <>
                    <span className="app-spinner" /> กำลังสร้าง...
                  </>
                ) : (
                  "📧 สร้างคำเชิญ"
                )}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="app-btn app-btn-primary">
              เสร็จสิ้น
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
