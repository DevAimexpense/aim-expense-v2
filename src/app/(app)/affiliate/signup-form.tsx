"use client";

// ===========================================
// Affiliate self-signup form — choose/generate a code + PromptPay account,
// then create the AffiliatePartner (partner_affiliate / cash). On success the
// server page re-renders into the dashboard.
// ===========================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { AFFILIATE_CODE_REGEX } from "@/lib/affiliate";
import { AFFILIATE_COMMISSION_SCHEDULE, REFERRAL_DISCOUNT } from "@/lib/plans";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  border: "1px solid #cbd5e1",
  borderRadius: "0.5rem",
  fontSize: "0.9375rem",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#334155",
  marginBottom: "0.375rem",
};

export function SignupForm() {
  const router = useRouter();
  const signupMut = trpc.affiliate.signup.useMutation();
  const genMut = trpc.affiliate.generateCode.useMutation();

  const [code, setCode] = useState("");
  const [payoutAccount, setPayoutAccount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    try {
      const res = await genMut.mutateAsync();
      setCode(res.code);
    } catch {
      setError("สร้างโค้ดไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!AFFILIATE_CODE_REGEX.test(code)) {
      setError("โค้ดต้องเป็น A-Z, 0-9, - ยาว 4-16 ตัว");
      return;
    }
    if (payoutAccount.trim().length < 4) {
      setError("กรุณากรอกเบอร์ PromptPay สำหรับรับค่าคอมมิชชั่น");
      return;
    }
    try {
      await signupMut.mutateAsync({ code, payoutAccount: payoutAccount.trim() });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  };

  const commissionMonths = AFFILIATE_COMMISSION_SCHEDULE.filter(
    (e) => e.percent > 0,
  );

  return (
    <section
      className="app-card"
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "0.75rem",
        padding: "1.5rem",
        maxWidth: "560px",
      }}
    >
      <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
        สมัครเป็นพันธมิตร
      </h2>
      <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0 0 1rem" }}>
        รับค่าคอมมิชชั่นเป็นเงินสด (โอนผ่าน PromptPay) เมื่อผู้ที่คุณแนะนำสมัครแพ็กเกจแบบเสียเงิน
        — จ่ายเดือนที่{" "}
        {commissionMonths.map((m) => m.monthIndex).join("/")} (
        {commissionMonths.map((m) => `${m.percent}%`).join("/")})
        ผู้ที่คุณแนะนำได้ส่วนลด {REFERRAL_DISCOUNT.firstInvoicePercentOff}% เดือนแรก
      </p>

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            style={{
              padding: "0.625rem 0.875rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "0.5rem",
              color: "#991b1b",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="aff-code" style={labelStyle}>
            โค้ดแนะนำของคุณ
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              id="aff-code"
              type="text"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 16),
                )
              }
              placeholder="เช่น SOMCHAI2025"
              style={{ ...inputStyle, textTransform: "uppercase" }}
              maxLength={16}
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={genMut.isPending}
              className="app-btn app-btn-ghost"
              style={{ whiteSpace: "nowrap" }}
            >
              🎲 สุ่มโค้ด
            </button>
          </div>
          <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.375rem" }}>
            A-Z, 0-9, ขีดกลาง (-) ยาว 4-16 ตัว — เปลี่ยนไม่ได้หลังสมัคร
          </p>
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor="aff-payout" style={labelStyle}>
            เบอร์ PromptPay (รับค่าคอมมิชชั่น)
          </label>
          <input
            id="aff-payout"
            type="text"
            inputMode="numeric"
            value={payoutAccount}
            onChange={(e) => setPayoutAccount(e.target.value)}
            placeholder="เบอร์มือถือ หรือ เลขบัตรประชาชน"
            style={inputStyle}
            maxLength={64}
          />
        </div>

        <button
          type="submit"
          disabled={signupMut.isPending}
          className="app-btn app-btn-primary"
        >
          {signupMut.isPending ? "กำลังสมัคร..." : "สมัครเป็นพันธมิตร"}
        </button>
      </form>
    </section>
  );
}
