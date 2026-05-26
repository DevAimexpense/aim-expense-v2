"use client";

// ===========================================
// /businesses/new — client form for creating an additional business.
// Mirrors the onboarding company form, minus the wizard chrome + terms
// (the account already accepted terms during first onboarding).
// ===========================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { PLAN_LABELS } from "@/lib/plans";
import { EntityTypePicker } from "@/components/forms/entity-type-picker";
import type { BusinessQuotaResult } from "@/server/lib/business-quota";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="onb-root">
      <div className="onb-container">
        <header className="onb-header">
          <Link
            href="/select-org"
            className="onb-brand"
            style={{ textDecoration: "none" }}
          >
            <div className="onb-logo">A</div>
            <div>
              <div className="onb-brand-title">Aim Expense</div>
              <div className="onb-brand-sub">สร้างบริษัทใหม่</div>
            </div>
          </Link>
          <Link href="/select-org" className="onb-logout">
            ← กลับไปเลือกบริษัท
          </Link>
        </header>
        <div className="onb-step-wrap">{children}</div>
      </div>
    </main>
  );
}

export function NewBusinessForm({
  quota,
  googleConnected = true,
}: {
  quota: BusinessQuotaResult;
  googleConnected?: boolean;
}) {
  const router = useRouter();
  const createMut = trpc.org.create.useMutation();
  const setActiveMut = trpc.org.setActive.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    entityType: "company" as "company" | "personal",
    name: "",
    taxId: "",
    branchType: "HQ" as "HQ" | "Branch",
    branchNumber: "00000",
    address: "",
    phone: "",
  });

  const isPersonal = form.entityType === "personal";

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const loading = createMut.isPending || setActiveMut.isPending;

  // Quota exhausted — show an upgrade prompt instead of the form.
  if (!quota.ok) {
    return (
      <Shell>
        <div className="onb-card">
          <h1 className="onb-title">ถึงขีดจำกัดจำนวนบริษัทแล้ว</h1>
          <p className="onb-subtitle" style={{ marginBottom: "1.25rem" }}>
            แผน <strong>{PLAN_LABELS[quota.plan]}</strong> ของคุณสร้างได้สูงสุด{" "}
            <strong>{quota.limit}</strong> บริษัท — ตอนนี้สร้างไปแล้ว{" "}
            {quota.current} บริษัท อัปเกรดแผนเพื่อสร้างเพิ่ม
          </p>
          <Link
            href="/pricing"
            className="onb-btn-primary"
            style={{ textDecoration: "none" }}
          >
            ดูแผนและอัปเกรด
          </Link>
        </div>
      </Shell>
    );
  }

  // Needs a Google connection — the new workspace's master sheet is created in
  // the user's own Drive. Invited staff may not have connected Google yet.
  if (!googleConnected) {
    return (
      <Shell>
        <div className="onb-card">
          <h1 className="onb-title">เชื่อมต่อ Google ก่อน</h1>
          <p className="onb-subtitle" style={{ marginBottom: "1.25rem" }}>
            การสร้างพื้นที่ทำงานจะสร้าง Google Sheet ในไดรฟ์ของคุณ —
            กรุณาเชื่อมต่อบัญชี Google ของคุณก่อน แล้วกลับมาสร้างได้เลย
          </p>
          <a
            href="/api/auth/google"
            className="onb-btn-primary"
            style={{ textDecoration: "none" }}
          >
            🔗 เชื่อมต่อ Google
          </a>
        </div>
      </Shell>
    );
  }

  const validate = (): string | null => {
    if (!form.name.trim())
      return isPersonal ? "โปรดกรอกชื่อ-นามสกุล" : "โปรดกรอกชื่อบริษัท";
    if (!/^\d{13}$/.test(form.taxId.trim()))
      return isPersonal
        ? "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"
        : "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก";
    if (!isPersonal && form.branchType === "Branch" && !/^\d{5}$/.test(form.branchNumber))
      return "เลขสาขาต้องเป็นตัวเลข 5 หลัก";
    if (!form.address.trim()) return "โปรดกรอกที่อยู่";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    try {
      const res = await createMut.mutateAsync({
        name: form.name.trim(),
        entityType: form.entityType,
        taxId: form.taxId.trim(),
        branchType: isPersonal ? "HQ" : form.branchType,
        branchNumber:
          isPersonal || form.branchType === "HQ" ? "00000" : form.branchNumber,
        address: form.address.trim(),
        phone: form.phone.trim() || null,
      });
      // Switch into the new business, then land on its dashboard.
      await setActiveMut.mutateAsync({ orgId: res.orgId });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <Shell>
      <form onSubmit={handleSubmit} className="onb-card">
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 className="onb-title">
            {isPersonal ? "ตั้งค่าพื้นที่ทำงานใหม่" : "ตั้งค่าบริษัทใหม่"}
          </h1>
          <p className="onb-subtitle">
            {isPersonal
              ? "ข้อมูลนี้จะใช้ในเอกสารและรายงานของคุณ"
              : "ข้อมูลนี้จะใช้ในเอกสาร ใบกำกับภาษี และรายงานของบริษัท"}
            {quota.limit !== -1 && (
              <>
                {" "}
                · สร้างได้อีก {quota.remaining} จาก {quota.limit} พื้นที่ทำงาน
              </>
            )}
          </p>
        </div>

        {error && (
          <div className="onb-error">
            {error}
            {/(google|token|โทเคน|เชื่อมต่อ)/i.test(error) && (
              <>
                {" "}
                <a
                  href="/api/auth/google"
                  style={{ color: "#2563eb", textDecoration: "underline" }}
                >
                  เชื่อมต่อ Google ใหม่
                </a>
              </>
            )}
          </div>
        )}

        <EntityTypePicker
          value={form.entityType}
          onChange={(v) => update("entityType", v)}
        />

        <div className="onb-field">
          <label htmlFor="company-name" className="onb-label">
            {isPersonal ? "ชื่อ-นามสกุล" : "ชื่อบริษัท"}
            <span className="onb-label-required">*</span>
          </label>
          <p className="onb-hint">ชื่อที่จะแสดงในเอกสารและระบบ</p>
          <input
            id="company-name"
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder={isPersonal ? "เช่น นายสมชาย ใจดี" : "บริษัท ของคุณ จำกัด"}
            className="onb-input"
            required
            maxLength={200}
          />
        </div>

        <div className="onb-field">
          <label htmlFor="tax-id" className="onb-label">
            {isPersonal ? "เลขบัตรประชาชน" : "เลขประจำตัวผู้เสียภาษี"}
            <span className="onb-label-required">*</span>
          </label>
          <p className="onb-hint">
            {isPersonal ? "เลขบัตรประชาชน 13 หลัก" : "ตัวเลข 13 หลักจากกรมสรรพากร"}
          </p>
          <input
            id="tax-id"
            type="text"
            inputMode="numeric"
            value={form.taxId}
            onChange={(e) =>
              update("taxId", e.target.value.replace(/\D/g, "").slice(0, 13))
            }
            placeholder="0123456789012"
            className="onb-input mono"
            required
            maxLength={13}
          />
        </div>

        {!isPersonal && (
          <div className="onb-field">
            <label className="onb-label">
              ประเภทสำนักงาน<span className="onb-label-required">*</span>
            </label>
            <p className="onb-hint">ใช้ในเอกสารทางภาษี (ใบกำกับภาษี, ภพ.30)</p>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
              <label
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  border: `2px solid ${form.branchType === "HQ" ? "#2563eb" : "#e2e8f0"}`,
                  borderRadius: "0.5rem",
                  background: form.branchType === "HQ" ? "#eff6ff" : "white",
                  cursor: "pointer",
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
                  onChange={(e) => update("branchType", e.target.value)}
                />
                สำนักงานใหญ่
              </label>
              <label
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  border: `2px solid ${form.branchType === "Branch" ? "#2563eb" : "#e2e8f0"}`,
                  borderRadius: "0.5rem",
                  background: form.branchType === "Branch" ? "#eff6ff" : "white",
                  cursor: "pointer",
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
                  onChange={(e) => update("branchType", e.target.value)}
                />
                สาขา
              </label>
            </div>
          </div>
        )}

        {!isPersonal && form.branchType === "Branch" && (
          <div className="onb-field">
            <label htmlFor="branch-number" className="onb-label">
              เลขสาขา<span className="onb-label-required">*</span>
            </label>
            <p className="onb-hint">
              5 หลัก เช่น 00001 (ตามที่กรมสรรพากรออกให้)
            </p>
            <input
              id="branch-number"
              type="text"
              inputMode="numeric"
              value={form.branchNumber}
              onChange={(e) =>
                update(
                  "branchNumber",
                  e.target.value.replace(/\D/g, "").slice(0, 5),
                )
              }
              placeholder="00001"
              className="onb-input mono"
              maxLength={5}
              required
            />
          </div>
        )}

        <div className="onb-field">
          <label htmlFor="address" className="onb-label">
            {isPersonal ? "ที่อยู่" : "ที่อยู่บริษัท"}
            <span className="onb-label-required">*</span>
          </label>
          <textarea
            id="address"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="เลขที่ หมู่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
            rows={3}
            className="onb-input onb-textarea"
            required
            maxLength={500}
          />
        </div>

        <div className="onb-field">
          <label htmlFor="phone" className="onb-label">
            {isPersonal ? "เบอร์โทร" : "เบอร์โทรบริษัท"}
          </label>
          <p className="onb-hint">ไม่บังคับ</p>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="02-xxx-xxxx"
            className="onb-input"
            maxLength={20}
          />
        </div>

        <div className="onb-auto-list">
          <p className="onb-auto-title">ระบบจะดำเนินการอัตโนมัติ</p>
          <ul>
            <li>• สร้าง Master Sheet ใน Google Drive ของคุณ</li>
            <li>• สร้างโฟลเดอร์สำหรับใบเสร็จ/เอกสาร/รายงาน</li>
            <li>• เพิ่มข้อมูลธนาคารไทย 8 แห่งเริ่มต้น</li>
            <li>• ตั้งค่าสิทธิ์ให้คุณเป็น Admin</li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="onb-btn-primary"
          style={{ marginTop: "1rem" }}
        >
          {loading ? (
            <>
              <div
                style={{
                  height: "1.25rem",
                  width: "1.25rem",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "white",
                  borderRadius: "50%",
                  animation: "spin 0.6s linear infinite",
                }}
              />
              <span>กำลังสร้างบริษัท...</span>
            </>
          ) : (
            <span>สร้างบริษัท และเริ่มใช้งาน</span>
          )}
        </button>
      </form>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Shell>
  );
}
