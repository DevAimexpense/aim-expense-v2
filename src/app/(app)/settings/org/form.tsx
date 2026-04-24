"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { CompanyBanksSection } from "./company-banks-section";

interface Props {
  org: {
    id: string;
    name: string;
    taxId: string;
    branchType: string;
    branchNumber: string;
    address: string;
    phone: string | null;
  };
  isAdmin: boolean;
  sheetUrl: string | null;
  driveUrl: string | null;
}

export function OrgSettingsForm({ org, isAdmin, sheetUrl, driveUrl }: Props) {
  const utils = trpc.useUtils();
  const updateMut = trpc.org.update.useMutation();

  const [form, setForm] = useState({
    name: org.name,
    taxId: org.taxId,
    branchType: (org.branchType === "Branch" ? "Branch" : "HQ") as "HQ" | "Branch",
    branchNumber: org.branchNumber || "00000",
    address: org.address,
    phone: org.phone || "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!form.name.trim()) {
      setError("กรุณากรอกชื่อบริษัท");
      return;
    }
    if (!/^\d{13}$/.test(form.taxId)) {
      setError("เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
      return;
    }
    if (form.branchType === "Branch" && !/^\d{5}$/.test(form.branchNumber)) {
      setError("เลขสาขาต้องเป็นตัวเลข 5 หลัก");
      return;
    }
    try {
      await updateMut.mutateAsync({
        name: form.name.trim(),
        taxId: form.taxId.trim(),
        branchType: form.branchType,
        branchNumber:
          form.branchType === "HQ" ? "00000" : form.branchNumber,
        address: form.address.trim(),
        phone: form.phone.trim() || undefined,
      });
      setSuccess(true);
      utils.org.current.invalidate();
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">⚙️ ตั้งค่าองค์กร</h1>
          <p className="app-page-subtitle">
            จัดการข้อมูลบริษัท ที่ใช้ในเอกสารและรายงาน
          </p>
        </div>
      </div>

      <div className="app-section cols-2">
        {/* Company Info Form */}
        <form onSubmit={handleSubmit}>
          <div className="app-card">
            <div className="app-card-header">
              <div>
                <h2 className="app-card-title">ข้อมูลบริษัท</h2>
                <p className="app-card-subtitle">
                  {isAdmin
                    ? "แก้ไขข้อมูลที่ใช้ในเอกสาร"
                    : "เฉพาะ Admin เท่านั้นที่แก้ไขได้"}
                </p>
              </div>
            </div>

            {error && <div className="app-error-msg">{error}</div>}
            {success && (
              <div
                style={{
                  background: "#dcfce7",
                  border: "1px solid #86efac",
                  color: "#166534",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  marginBottom: "1rem",
                }}
              >
                ✓ บันทึกสำเร็จ
              </div>
            )}

            <div className="app-form-group">
              <label className="app-label app-label-required">ชื่อบริษัท</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!isAdmin}
                className="app-input"
                maxLength={200}
              />
            </div>

            <div className="app-form-group">
              <label className="app-label app-label-required">
                เลขประจำตัวผู้เสียภาษี
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.taxId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    taxId: e.target.value.replace(/\D/g, "").slice(0, 13),
                  })
                }
                disabled={!isAdmin}
                className="app-input mono"
                maxLength={13}
              />
            </div>

            <div className="app-form-group">
              <label className="app-label app-label-required">
                ประเภทสำนักงาน
              </label>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem" }}>
                <label
                  style={{
                    flex: 1,
                    padding: "0.625rem 0.875rem",
                    border: `2px solid ${form.branchType === "HQ" ? "#2563eb" : "#e2e8f0"}`,
                    borderRadius: "0.5rem",
                    background: form.branchType === "HQ" ? "#eff6ff" : "white",
                    cursor: isAdmin ? "pointer" : "not-allowed",
                    opacity: isAdmin ? 1 : 0.6,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <input
                    type="radio"
                    name="branchType"
                    value="HQ"
                    checked={form.branchType === "HQ"}
                    onChange={(e) =>
                      setForm({ ...form, branchType: e.target.value as "HQ" })
                    }
                    disabled={!isAdmin}
                  />
                  สำนักงานใหญ่
                </label>
                <label
                  style={{
                    flex: 1,
                    padding: "0.625rem 0.875rem",
                    border: `2px solid ${form.branchType === "Branch" ? "#2563eb" : "#e2e8f0"}`,
                    borderRadius: "0.5rem",
                    background: form.branchType === "Branch" ? "#eff6ff" : "white",
                    cursor: isAdmin ? "pointer" : "not-allowed",
                    opacity: isAdmin ? 1 : 0.6,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <input
                    type="radio"
                    name="branchType"
                    value="Branch"
                    checked={form.branchType === "Branch"}
                    onChange={(e) =>
                      setForm({ ...form, branchType: e.target.value as "Branch" })
                    }
                    disabled={!isAdmin}
                  />
                  สาขา
                </label>
              </div>
            </div>

            {form.branchType === "Branch" && (
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  เลขสาขา (5 หลัก)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.branchNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      branchNumber: e.target.value.replace(/\D/g, "").slice(0, 5),
                    })
                  }
                  disabled={!isAdmin}
                  className="app-input mono"
                  placeholder="00001"
                  maxLength={5}
                />
              </div>
            )}

            <div className="app-form-group">
              <label className="app-label app-label-required">ที่อยู่</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                disabled={!isAdmin}
                className="app-textarea"
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="app-form-group">
              <label className="app-label">เบอร์โทร</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                disabled={!isAdmin}
                className="app-input"
                placeholder="02-xxx-xxxx"
                maxLength={20}
              />
            </div>

            {isAdmin && (
              <button
                type="submit"
                disabled={updateMut.isPending}
                className="app-btn app-btn-primary"
              >
                {updateMut.isPending ? (
                  <>
                    <span className="app-spinner" />
                    กำลังบันทึก...
                  </>
                ) : (
                  "💾 บันทึกการเปลี่ยนแปลง"
                )}
              </button>
            )}
          </div>
        </form>

        {/* Google Resources */}
        <div>
          <div className="app-card">
            <div className="app-card-header">
              <div>
                <h2 className="app-card-title">📊 ข้อมูลใน Google ของคุณ</h2>
                <p className="app-card-subtitle">
                  ข้อมูลธุรกิจทั้งหมดอยู่ใน Google Drive ของคุณเอง
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.75rem" }}>
              {sheetUrl && (
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-btn app-btn-secondary"
                  style={{ justifyContent: "flex-start" }}
                >
                  📊 เปิด Master Sheet
                </a>
              )}
              {driveUrl && (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-btn app-btn-secondary"
                  style={{ justifyContent: "flex-start" }}
                >
                  📁 เปิดโฟลเดอร์ Drive
                </a>
              )}
            </div>

            <div
              style={{
                marginTop: "1rem",
                padding: "0.875rem",
                background: "#eff6ff",
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
                color: "#1e3a8a",
              }}
            >
              💡 คุณเข้าถึงข้อมูลได้ตลอดเวลาแม้ยกเลิก subscription
            </div>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <CompanyBanksSection isAdmin={isAdmin} />
          </div>

          <div className="app-card" style={{ marginTop: "1rem" }}>
            <div className="app-card-header">
              <div>
                <h2 className="app-card-title">🔗 หน้าตั้งค่าอื่นๆ</h2>
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.5rem" }}>
              <a href="/settings/billing" className="app-btn app-btn-ghost" style={{ justifyContent: "space-between" }}>
                <span>💳 Subscription &amp; Billing</span>
                <span>→</span>
              </a>
              <a href="/settings/google" className="app-btn app-btn-ghost" style={{ justifyContent: "space-between" }}>
                <span>🔗 เชื่อมต่อ Google</span>
                <span>→</span>
              </a>
              <a href="/users" className="app-btn app-btn-ghost" style={{ justifyContent: "space-between" }}>
                <span>👥 จัดการสมาชิก</span>
                <span>→</span>
              </a>
              <a href="/permissions" className="app-btn app-btn-ghost" style={{ justifyContent: "space-between" }}>
                <span>🔐 จัดการสิทธิ์</span>
                <span>→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
