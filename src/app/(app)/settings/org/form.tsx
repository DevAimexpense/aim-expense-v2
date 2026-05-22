"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { imageFileToDataUrl } from "@/lib/utils/image-to-dataurl";
import { CompanyBanksSection } from "./company-banks-section";
import { BranchesSection } from "./branches-section";
import { DocPrefixSection } from "./doc-prefix-section";

interface Props {
  org: {
    id: string;
    name: string;
    ownerId: string;
    entityType: string;
    taxId: string;
    branchType: string;
    branchNumber: string;
    address: string;
    phone: string | null;
    logoUrl: string | null;
    signatureUrl: string | null;
    signatoryName: string | null;
  };
  isAdmin: boolean;
  isOwner: boolean;
  sheetUrl: string | null;
  driveUrl: string | null;
}

export function OrgSettingsForm({ org, isAdmin, isOwner, sheetUrl, driveUrl }: Props) {
  const utils = trpc.useUtils();
  const updateMut = trpc.org.update.useMutation();
  const isPersonal = org.entityType === "personal";

  const [form, setForm] = useState({
    name: org.name,
    taxId: org.taxId,
    branchType: (org.branchType === "Branch" ? "Branch" : "HQ") as "HQ" | "Branch",
    branchNumber: org.branchNumber || "00000",
    address: org.address,
    phone: org.phone || "",
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logoUrl);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(
    org.signatureUrl,
  );
  const [signatoryName, setSignatoryName] = useState(org.signatoryName || "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!form.name.trim()) {
      setError(isPersonal ? "กรุณากรอกชื่อ-นามสกุล" : "กรุณากรอกชื่อบริษัท");
      return;
    }
    if (!/^\d{13}$/.test(form.taxId)) {
      setError(
        isPersonal
          ? "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"
          : "เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก",
      );
      return;
    }
    if (!isPersonal && form.branchType === "Branch" && !/^\d{5}$/.test(form.branchNumber)) {
      setError("เลขสาขาต้องเป็นตัวเลข 5 หลัก");
      return;
    }
    try {
      await updateMut.mutateAsync({
        name: form.name.trim(),
        taxId: form.taxId.trim(),
        branchType: isPersonal ? "HQ" : form.branchType,
        branchNumber:
          isPersonal || form.branchType === "HQ" ? "00000" : form.branchNumber,
        address: form.address.trim(),
        phone: form.phone.trim() || undefined,
        logoUrl,
        signatureUrl,
        signatoryName: signatoryName.trim() || null,
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
              <label className="app-label app-label-required">
                {isPersonal ? "ชื่อ-นามสกุล" : "ชื่อบริษัท"}
              </label>
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
                {isPersonal ? "เลขบัตรประชาชน" : "เลขประจำตัวผู้เสียภาษี"}
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

            {!isPersonal && (
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
            )}

            {!isPersonal && form.branchType === "Branch" && (
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

            <div
              style={{
                marginTop: "0.5rem",
                marginBottom: "1rem",
                paddingTop: "1rem",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <h3
                style={{
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  color: "#0f172a",
                  marginBottom: "0.25rem",
                }}
              >
                โลโก้ และลายเซ็น
              </h3>
              <p className="app-card-subtitle" style={{ marginTop: 0 }}>
                ใช้แสดงบนใบเสนอราคา ใบวางบิล ใบเสร็จ และเอกสารต่าง ๆ
              </p>
            </div>

            <ImageUploadField
              label="โลโก้บริษัท"
              hint="แสดงที่มุมซ้ายบนของเอกสาร — แนะนำพื้นหลังโปร่งใส (PNG)"
              value={logoUrl}
              onChange={setLogoUrl}
              disabled={!isAdmin}
              maxDim={320}
            />

            <ImageUploadField
              label="ลายเซ็นผู้รับมอบอำนาจ"
              hint="แสดงในช่องลงนามของเอกสาร — แนะนำพื้นหลังโปร่งใส (PNG)"
              value={signatureUrl}
              onChange={setSignatureUrl}
              disabled={!isAdmin}
              maxDim={400}
            />

            <div className="app-form-group">
              <label className="app-label">ชื่อผู้รับมอบอำนาจ</label>
              <input
                type="text"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                disabled={!isAdmin}
                className="app-input"
                placeholder="เช่น นายสมชาย ใจดี"
                maxLength={120}
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

          {!isPersonal && (
            <div style={{ marginTop: "1rem" }}>
              <BranchesSection isAdmin={isAdmin} />
            </div>
          )}

          <div style={{ marginTop: "1rem" }}>
            <DocPrefixSection isAdmin={isAdmin} />
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

          {isOwner && (
            <div style={{ marginTop: "1rem" }}>
              <DangerZone orgId={org.id} orgName={org.name} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Danger zone: delete organization (owner-only, irreversible) =====

function DangerZone({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter();
  const deleteMut = trpc.org.delete.useMutation();
  const [showModal, setShowModal] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    try {
      await deleteMut.mutateAsync({ orgId, confirmName: confirmName.trim() });
      // Org is gone — session active-org was repointed server-side.
      // Send the user to the picker (it redirects to onboarding if 0 orgs left).
      router.push("/select-org");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="app-card" style={{ borderColor: "#fecaca" }}>
      <div className="app-card-header">
        <div>
          <h2 className="app-card-title" style={{ color: "#dc2626" }}>
            ⚠️ พื้นที่อันตราย
          </h2>
          <p className="app-card-subtitle">
            ลบบริษัทนี้ออกถาวร — ข้อมูลในระบบ (สมาชิก สิทธิ์ สาขา การตั้งค่า)
            จะถูกลบทั้งหมด กู้คืนไม่ได้ · ไฟล์ใน Google Sheet/Drive ของคุณจะยังอยู่
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setConfirmName("");
          setError(null);
          setShowModal(true);
        }}
        className="app-btn"
        style={{ background: "#dc2626", color: "white" }}
      >
        🗑️ ลบบริษัทนี้
      </button>

      {showModal && (
        <div
          className="app-modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="app-modal modal-lg">
            <div className="app-modal-header">
              <h3 className="app-modal-title">ลบบริษัท “{orgName}”</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="app-btn app-btn-ghost app-btn-icon"
              >
                ✕
              </button>
            </div>
            <div className="app-modal-body">
              {error && <div className="app-error-msg">{error}</div>}
              <p style={{ fontSize: "0.875rem", color: "#475569", marginBottom: "0.75rem" }}>
                การลบนี้ <strong>ถาวรและกู้คืนไม่ได้</strong>. พิมพ์ชื่อบริษัท{" "}
                <strong>{orgName}</strong> เพื่อยืนยัน:
              </p>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={orgName}
                className="app-input"
                autoFocus
              />
            </div>
            <div className="app-modal-footer">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={deleteMut.isPending}
                className="app-btn app-btn-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMut.isPending || confirmName.trim() !== orgName}
                className="app-btn"
                style={{
                  background:
                    confirmName.trim() === orgName ? "#dc2626" : "#fca5a5",
                  color: "white",
                }}
              >
                {deleteMut.isPending ? (
                  <>
                    <span className="app-spinner" /> กำลังลบ...
                  </>
                ) : (
                  "ลบถาวร"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Reusable image upload field (logo / signature) =====

function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  disabled,
  maxDim,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (v: string | null) => void;
  disabled: boolean;
  maxDim: number;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("ไฟล์ใหญ่เกิน 5MB");
      return;
    }
    setBusy(true);
    try {
      onChange(await imageFileToDataUrl(file, maxDim));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-form-group">
      <label className="app-label">{label}</label>
      <p className="app-card-subtitle" style={{ marginTop: 0, marginBottom: "0.5rem" }}>
        {hint}
      </p>
      {value && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.5rem 0.75rem",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
            background:
              "repeating-conic-gradient(#f1f5f9 0% 25%, #ffffff 0% 50%) 50% / 16px 16px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            style={{ maxWidth: "180px", maxHeight: "80px", objectFit: "contain" }}
          />
        </div>
      )}
      {!disabled && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            marginTop: "0.5rem",
          }}
        >
          <label
            className="app-btn app-btn-secondary app-btn-sm"
            style={{ cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "กำลังประมวลผล…" : value ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
            <input
              type="file"
              accept="image/*"
              onChange={handleFile}
              disabled={busy}
              style={{ display: "none" }}
            />
          </label>
          {value && (
            <button
              type="button"
              className="app-btn app-btn-ghost app-btn-sm"
              onClick={() => onChange(null)}
            >
              ลบ
            </button>
          )}
        </div>
      )}
      {err && (
        <div className="app-error-msg" style={{ marginTop: "0.5rem" }}>
          {err}
        </div>
      )}
    </div>
  );
}
