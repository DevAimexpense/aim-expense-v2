"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";

const STATUS_LABEL: Record<string, { label: string; class: string }> = {
  active: { label: "ดำเนินการ", class: "app-badge-success" },
  completed: { label: "เสร็จสิ้น", class: "app-badge-info" },
  cancelled: { label: "ยกเลิก", class: "app-badge-neutral" },
};

export default function EventsPage() {
  const utils = trpc.useUtils();
  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assigningEvent, setAssigningEvent] = useState<{ eventId: string; eventName: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = events.filter((e) => {
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (search && !e.eventName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const editingEvent = events.find((e) => e.eventId === editingId);

  const handleSuccess = () => {
    setShowModal(false);
    setEditingId(null);
    utils.event.list.invalidate();
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📋 จัดการโปรเจกต์</h1>
          <p className="app-page-subtitle">
            สร้างและติดตามโปรเจกต์/กิจกรรม พร้อมงบประมาณ
          </p>
        </div>
        <button
          className="app-btn app-btn-primary"
          onClick={() => {
            setEditingId(null);
            setShowModal(true);
          }}
        >
          + สร้างโปรเจกต์ใหม่
        </button>
      </div>

      {/* Filters */}
      <div className="app-filter-row">
        <input
          type="text"
          placeholder="🔍 ค้นหาชื่อโปรเจกต์..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="app-input"
          style={{ minWidth: "240px" }}
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกสถานะ" },
            { value: "active", label: "ดำเนินการ" },
            { value: "completed", label: "เสร็จสิ้น" },
            { value: "cancelled", label: "ยกเลิก" },
          ]}
          value={filterStatus}
          onChange={(val) => setFilterStatus(val)}
          className="app-select"
          emptyLabel="ทุกสถานะ"
        />
      </div>

      {/* Events Table */}
      {eventsQuery.isLoading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">📋</div>
            <p className="app-empty-title">
              {events.length === 0 ? "ยังไม่มีโปรเจกต์" : "ไม่พบโปรเจกต์ที่ค้นหา"}
            </p>
            <p className="app-empty-desc">
              {events.length === 0
                ? "เริ่มต้นจากสร้างโปรเจกต์แรกของคุณ"
                : "ลองเปลี่ยนตัวกรอง หรือล้างคำค้นหา"}
            </p>
            {events.length === 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="app-btn app-btn-primary"
              >
                + สร้างโปรเจกต์แรก
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>ชื่อโปรเจกต์</th>
                <th>สถานะ</th>
                <th className="text-right">งบประมาณ</th>
                <th className="text-right">ใช้ไป</th>
                <th>การใช้งบ</th>
                <th>ระยะเวลา</th>
                <th className="text-center">รายการ</th>
                <th className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => {
                const statusInfo = STATUS_LABEL[event.status] || STATUS_LABEL.active;
                const fillClass =
                  event.percentage >= 100
                    ? "danger"
                    : event.percentage >= 80
                    ? "warning"
                    : "";
                return (
                  <tr key={event.eventId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{event.eventName}</div>
                      {event.description && (
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.125rem" }}>
                          {event.description.slice(0, 60)}
                          {event.description.length > 60 ? "..." : ""}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`app-badge ${statusInfo.class}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="text-right num">
                      ฿{formatNumber(event.budget)}
                    </td>
                    <td
                      className="text-right num"
                      style={{ color: event.isOverBudget ? "#dc2626" : "#0f172a" }}
                    >
                      ฿{formatNumber(event.totalSpent)}
                    </td>
                    <td style={{ minWidth: "140px" }}>
                      <div className="budget-bar-wrap">
                        <div
                          className={`budget-bar-fill ${fillClass}`}
                          style={{ width: `${Math.min(event.percentage, 100)}%` }}
                        />
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "#64748b", marginTop: "0.25rem" }}>
                        {event.percentage.toFixed(1)}%
                      </div>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {formatDate(event.startDate)}
                      <br />
                      {formatDate(event.endDate)}
                    </td>
                    <td className="text-center">
                      <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                        {event.paymentCount}
                      </span>
                    </td>
                    <td className="text-center" style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="app-btn app-btn-ghost app-btn-sm"
                        onClick={() => setAssigningEvent({ eventId: event.eventId, eventName: event.eventName })}
                        title="มอบหมายสมาชิก"
                      >
                        👥
                      </button>
                      <button
                        className="app-btn app-btn-ghost app-btn-sm"
                        onClick={() => {
                          setEditingId(event.eventId);
                          setShowModal(true);
                        }}
                      >
                        ✏️ แก้ไข
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Event Modal */}
      {showModal && (
        <EventModal
          event={editingEvent}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onSuccess={handleSuccess}
        />
      )}

      {/* Assignment Modal */}
      {assigningEvent && (
        <AssignmentModal
          eventId={assigningEvent.eventId}
          eventName={assigningEvent.eventName}
          onClose={() => setAssigningEvent(null)}
        />
      )}
    </div>
  );
}

// ===== Modal =====

function EventModal({
  event,
  onClose,
  onSuccess,
}: {
  event?: {
    eventId: string;
    eventName: string;
    budget: number;
    startDate: string;
    endDate: string;
    description: string;
    status: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!event;
  const utils = trpc.useUtils();
  const createMut = trpc.event.create.useMutation();
  const updateMut = trpc.event.update.useMutation();
  const deleteMut = trpc.event.delete.useMutation();

  const [form, setForm] = useState({
    eventName: event?.eventName || "",
    budget: event?.budget || 0,
    startDate: event?.startDate || todayISO(),
    endDate: event?.endDate || addDaysISO(30),
    description: event?.description || "",
    status: event?.status || "active",
  });
  const [error, setError] = useState<string | null>(null);

  const isLoading = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.eventName.trim()) {
      setError("กรุณากรอกชื่อโปรเจกต์");
      return;
    }
    if (form.budget < 0) {
      setError("งบประมาณต้องไม่ติดลบ");
      return;
    }

    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          eventId: event.eventId,
          eventName: form.eventName.trim(),
          budget: form.budget,
          startDate: form.startDate,
          endDate: form.endDate,
          description: form.description.trim(),
          status: form.status as "active" | "completed" | "cancelled",
        });
      } else {
        await createMut.mutateAsync({
          eventName: form.eventName.trim(),
          budget: form.budget,
          startDate: form.startDate,
          endDate: form.endDate,
          description: form.description.trim() || undefined,
        });
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirm(`ลบโปรเจกต์ "${event.eventName}" ใช่หรือไม่?`)) return;
    setError(null);
    try {
      await deleteMut.mutateAsync({ eventId: event.eventId });
      utils.event.list.invalidate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="app-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="app-modal modal-lg">
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">
              {isEdit ? "แก้ไขโปรเจกต์" : "สร้างโปรเจกต์ใหม่"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="app-btn app-btn-ghost app-btn-icon"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>

          <div className="app-modal-body">
            {error && <div className="app-error-msg">{error}</div>}

            <div className="app-form-group">
              <label className="app-label app-label-required">ชื่อโปรเจกต์</label>
              <input
                type="text"
                value={form.eventName}
                onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                placeholder="เช่น งานแต่งงานลูกค้า A, อีเวนต์ Marketing Q2"
                className="app-input"
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">งบประมาณ (บาท)</label>
                <input
                  type="number"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: parseFloat(e.target.value) || 0 })}
                  min={0}
                  step={1000}
                  className="app-input num"
                />
              </div>

              {isEdit && (
                <div className="app-form-group">
                  <label className="app-label">สถานะ</label>
                  <SearchableSelect
                    options={[
                      { value: "active", label: "ดำเนินการ" },
                      { value: "completed", label: "เสร็จสิ้น" },
                      { value: "cancelled", label: "ยกเลิก" },
                    ]}
                    value={form.status}
                    onChange={(val) => setForm({ ...form, status: val })}
                    className="app-select"
                  />
                </div>
              )}
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">วันเริ่ม</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="app-input"
                />
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">วันสิ้นสุด</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="app-input"
                />
              </div>
            </div>

            <div className="app-form-group">
              <label className="app-label">รายละเอียด (ไม่บังคับ)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="คำอธิบาย, ที่อยู่งาน, รายละเอียดเพิ่มเติม..."
                className="app-textarea"
                rows={3}
                maxLength={1000}
              />
            </div>
          </div>

          <div className="app-modal-footer">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isLoading}
                className="app-btn app-btn-ghost"
                style={{ color: "#dc2626", marginRight: "auto" }}
              >
                🗑️ ลบ
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="app-btn app-btn-secondary"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="app-btn app-btn-primary"
            >
              {isLoading ? (
                <>
                  <span className="app-spinner" />
                  กำลังบันทึก...
                </>
              ) : isEdit ? (
                "บันทึกการแก้ไข"
              ) : (
                "สร้างโปรเจกต์"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===== Assignment Modal =====

function AssignmentModal({
  eventId,
  eventName,
  onClose,
}: {
  eventId: string;
  eventName: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const assignmentsQuery = trpc.eventAssignment.listByEvent.useQuery({ eventId });
  const availableQuery = trpc.eventAssignment.availableMembers.useQuery({ eventId });
  const assignMut = trpc.eventAssignment.assign.useMutation();
  const removeMut = trpc.eventAssignment.remove.useMutation();

  const assignments = assignmentsQuery.data || [];
  const available = availableQuery.data || [];

  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refreshData = () => {
    utils.eventAssignment.listByEvent.invalidate({ eventId });
    utils.eventAssignment.availableMembers.invalidate({ eventId });
  };

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setError(null);
    try {
      await assignMut.mutateAsync({ eventId, userId: selectedUserId });
      setSelectedUserId("");
      refreshData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleRemove = async (assignmentId: string, displayName: string) => {
    if (!confirm(`ถอน "${displayName}" ออกจากโปรเจกต์นี้?`)) return;
    setError(null);
    try {
      await removeMut.mutateAsync({ assignmentId });
      refreshData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const ROLE_LABEL: Record<string, string> = {
    admin: "แอดมิน",
    manager: "ผู้จัดการ",
    accountant: "บัญชี",
    staff: "สต๊าฟ",
  };

  const dropdownOptions = available.map((m) => ({
    value: m.userId,
    label: `${m.displayName} (${ROLE_LABEL[m.role] || m.role})`,
  }));

  return (
    <div className="app-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="app-modal modal-lg">
        <div className="app-modal-header">
          <h3 className="app-modal-title">👥 สมาชิกโปรเจกต์</h3>
          <button
            type="button"
            onClick={onClose}
            className="app-btn app-btn-ghost app-btn-icon"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div className="app-modal-body">
          {/* Event name */}
          <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", background: "#f1f5f9", borderRadius: "0.5rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>โปรเจกต์</div>
            <div style={{ fontWeight: 600, fontSize: "1rem" }}>{eventName}</div>
          </div>

          {error && <div className="app-error-msg">{error}</div>}

          {/* Add member */}
          <div className="app-form-group">
            <label className="app-label">เพิ่มสมาชิก</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <div style={{ flex: 1 }}>
                <SearchableSelect
                  options={dropdownOptions}
                  value={selectedUserId}
                  onChange={setSelectedUserId}
                  placeholder="เลือกสมาชิก..."
                  emptyLabel="เลือกสมาชิก"
                />
              </div>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!selectedUserId || assignMut.isPending}
                className="app-btn app-btn-primary"
              >
                {assignMut.isPending ? (
                  <><span className="app-spinner" /> กำลังเพิ่ม...</>
                ) : (
                  "+ เพิ่ม"
                )}
              </button>
            </div>
            {available.length === 0 && !availableQuery.isLoading && (
              <p className="app-hint" style={{ marginTop: "0.375rem" }}>
                สมาชิกทั้งหมดถูกมอบหมายแล้ว หรือยังไม่มีสมาชิกในองค์กร
              </p>
            )}
          </div>

          {/* Current assignments */}
          <div style={{ marginTop: "1.25rem" }}>
            <label className="app-label" style={{ marginBottom: "0.5rem", display: "block" }}>
              สมาชิกปัจจุบัน ({assignments.length} คน)
            </label>

            {assignmentsQuery.isLoading ? (
              <div className="app-skeleton" style={{ height: "80px" }} />
            ) : assignments.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "2rem 1rem",
                color: "#94a3b8",
                fontSize: "0.875rem",
                background: "#f8fafc",
                borderRadius: "0.5rem",
              }}>
                ยังไม่มีสมาชิกในโปรเจกต์นี้
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {assignments.map((a) => (
                  <div
                    key={a.assignmentId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.625rem 0.75rem",
                      background: "#f8fafc",
                      borderRadius: "0.5rem",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: "#dbeafe",
                        color: "#2563eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                    >
                      {a.avatarUrl ? (
                        <img
                          src={a.avatarUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        a.displayName.charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                        {a.displayName}
                      </div>
                      {a.email && (
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.email}
                        </div>
                      )}
                    </div>

                    {/* Assigned date */}
                    <div style={{ fontSize: "0.6875rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {formatDate(a.assignedAt)}
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => handleRemove(a.assignmentId, a.displayName)}
                      disabled={removeMut.isPending}
                      className="app-btn app-btn-ghost app-btn-icon"
                      style={{ color: "#dc2626", flexShrink: 0 }}
                      title="ถอนออก"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="app-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="app-btn app-btn-secondary"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="app-card">
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="app-skeleton" style={{ height: "60px" }} />
        ))}
      </div>
    </div>
  );
}

// ===== Helpers =====

function formatNumber(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatDate(s: string): string {
  if (!s) return "-";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" });
  } catch {
    return s;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
