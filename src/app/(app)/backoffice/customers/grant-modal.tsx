"use client";

// ===========================================
// Modal ให้สิทธิ์ใช้ฟรี — ใช้ทั้งหน้าลูกค้าทั้งหมดและหน้ารายละเอียดบริษัท
// ===========================================

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/utils/date";
import { PLAN_LABELS, PLAN_LIMITS, PLAN_PRICING_THB, type PlanTier } from "@/lib/plans";
import {
  GRANTABLE_PLANS,
  GRANT_MONTH_OPTIONS,
  INVOICE_PLANS,
  type InvoiceInterval,
} from "@/lib/comp";
import DateInput from "@/components/shared/date-input";
import { todayBangkok } from "@/lib/utils/date";
import { limitText } from "../shared";

type GrantKind = "invoice" | "months" | "lifetime";

export interface GrantTarget {
  orgId: string;
  orgName: string;
  lifetime: boolean;
  inTrial: boolean;
  trialEndsAt: string | null;
  hasStripe: boolean;
  stripeStatus: string | null;
  stripeEntitled: boolean;
  invoice: boolean;
  invoiceActive: boolean;
  expiresAt: string | null;
  expiryKind: string;
  planLabel: string;
}

function planOptionLabel(p: Exclude<PlanTier, "free">): string {
  const l = PLAN_LIMITS[p];
  const price = PLAN_PRICING_THB[p];
  const users = l.users === -1 ? "ไม่จำกัดผู้ใช้" : `${l.users} ผู้ใช้`;
  const priceText = price ? `฿${price.monthly.toLocaleString("th-TH")}/เดือน · ฿${price.yearly.toLocaleString("th-TH")}/ปี` : "ราคาตามตกลง";
  return `${PLAN_LABELS[p]} — ${users} · ${priceText}`;
}

// ===== Grant modal =====

const KINDS: { key: GrantKind; label: string; hint: string }[] = [
  { key: "invoice", label: "วางบิล / โอนเงิน", hint: "ลูกค้าจ่ายเงินจริงนอก Stripe · หมดอายุตามรอบ" },
  { key: "months", label: "ให้ใช้ฟรีชั่วคราว", hint: "1 / 2 / 3 เดือน — หมดแล้วกลับแพ็กเกจเดิม" },
  { key: "lifetime", label: "ฟรีตลอดชีพ", hint: "ไม่มีวันหมดอายุ · ไม่นับเป็นลูกค้าจ่ายเงิน" },
];

type IntervalChoice = InvoiceInterval | "custom";
const CYCLE_OPTIONS: { key: InvoiceInterval; label: string }[] = [
  { key: "monthly", label: "รายเดือน" },
  { key: "yearly", label: "รายปี" },
];

export function GrantModal({
  target,
  onClose,
  onDone,
}: {
  target: GrantTarget;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const grantMut = trpc.backoffice.grant.useMutation();
  const assignMut = trpc.backoffice.assignPlan.useMutation();
  // UI-04: เปิดมาที่ "ฟรีชั่วคราว" เหมือนเดิม — กันทีมกดปุ่มหลักติดนิ้วแล้วกลายเป็นลูกค้าจ่ายเงิน
  // NEW-01: ยกเว้นมีรอบวางบิลอยู่ (ฟรีชั่วคราวถูกปิด) → เปิดที่ "วางบิล" เพื่อต่อรอบ
  const [kind, setKind] = useState<GrantKind>(
    target.invoice && target.invoiceActive ? "invoice" : "months",
  );
  const [months, setMonths] = useState<(typeof GRANT_MONTH_OPTIONS)[number]>(1);
  const [plan, setPlan] = useState<Exclude<PlanTier, "free">>("pro");
  const [interval, setInterval_] = useState<IntervalChoice>("yearly");
  /** รอบบิลที่เลือกไว้ใน dropdown (จำไว้แม้สลับไปกำหนดวันเอง) */
  const [cycle, setCycle] = useState<InvoiceInterval>("yearly");
  const [endDate, setEndDate] = useState("");
  const [mode, setMode] = useState<"extend" | "today">("extend");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const limits = PLAN_LIMITS[plan];
  const pending = grantMut.isPending || assignMut.isPending;
  // Stripe ยังเก็บเงินได้ → วางบิลไม่ได้ (ค่าจาก server ชุดเดียวกับที่ assignPlan ปฏิเสธ — UI-11)
  const stripeLive = target.stripeEntitled;
  const useEndDate = interval === "custom";
  const invoiceCurrentEnd = target.invoice && target.invoiceActive ? target.expiresAt : null;
  // UI-08: มีรอบวางบิลอยู่ → ไม่ให้ซ้อน "ฟรีชั่วคราว" (จะนับเป็นทั้งจ่ายจริงและทดลอง) ให้ต่อรอบแทน
  const monthsBlocked = !!invoiceCurrentEnd;
  const canSubmit =
    kind === "months"
      ? !monthsBlocked
      : kind !== "invoice" || (!stripeLive && (!useEndDate || /^\d{4}-\d{2}-\d{2}$/.test(endDate)));

  const submit = async () => {
    setError(null);
    try {
      if (kind === "invoice") {
        const res = await assignMut.mutateAsync({
          orgId: target.orgId,
          plan,
          interval,
          mode: useEndDate ? "today" : mode,
          endDate: useEndDate ? endDate : undefined,
          note: note.trim() || undefined,
        });
        onDone(`${target.orgName}: ${res.summary}`);
        return;
      }
      const res = await grantMut.mutateAsync({
        orgId: target.orgId,
        kind,
        months,
        plan,
        note: note.trim() || undefined,
      });
      onDone(`${target.orgName}: ${res.summary}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const pill = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "0.625rem 0.75rem",
    border: `2px solid ${active ? "#2563eb" : "#e2e8f0"}`,
    background: active ? "#eff6ff" : "white",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    textAlign: "left",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 50,
      }}
    >
      <div
        className="app-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "520px", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="app-card-header">
          <div>
            <h2 className="app-card-title">กำหนดแพ็กเกจ — {target.orgName}</h2>
            <p className="app-card-subtitle">
              ตอนนี้: {target.planLabel}
              {target.lifetime
                ? " (ฟรีตลอดชีพ)"
                : target.inTrial && target.trialEndsAt
                  ? ` (ฟรีถึง ${formatDate(target.trialEndsAt)})`
                  : target.invoice && target.expiresAt
                    ? ` (วางบิลถึง ${formatDate(target.expiresAt)})`
                    : ""}
            </p>
          </div>
        </div>

        {error && <div className="app-error-msg">{error}</div>}

        <div className="app-form-group">
          <label className="app-label">รูปแบบ</label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {KINDS.map((k) => {
              const blocked = k.key === "months" && monthsBlocked;
              return (
                <button
                  key={k.key}
                  type="button"
                  disabled={blocked}
                  onClick={() => setKind(k.key)}
                  style={{ ...pill(kind === k.key), opacity: blocked ? 0.5 : 1 }}
                >
                  <div style={{ fontWeight: 600 }}>{k.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {blocked ? "มีรอบวางบิลอยู่ — ต่อรอบแทน" : k.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="app-form-group">
          <label className="app-label">แพ็กเกจ / เพดานผู้ใช้ / ราคา</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as Exclude<PlanTier, "free">)}
            className="app-select"
          >
            {(kind === "invoice" ? INVOICE_PLANS : GRANTABLE_PLANS).map((p) => (
              <option key={p} value={p}>
                {planOptionLabel(p)}
              </option>
            ))}
          </select>
          <p className="app-hint">
            {limitText(limits.users, "ผู้ใช้")} · {limitText(limits.businesses, "ธุรกิจ")} ·{" "}
            {limitText(limits.events, "โปรเจกต์")} · OCR {limitText(limits.ocrPerMonth, "ครั้ง/เดือน")}
          </p>
        </div>

        {kind === "invoice" && (
          <>
            <div className="app-form-group">
              {/* เหมือน Aim HR: วิทยุ 2 แถว — ตามรอบบิล (dropdown) / กำหนดวันหมดอายุเอง (ช่องวันที่ในบรรทัดเดียว) */}
              <label
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.625rem", fontSize: "0.9375rem", cursor: "pointer" }}
              >
                <input
                  type="radio"
                  name="invoice-cycle"
                  checked={!useEndDate}
                  onChange={() => setInterval_(cycle)}
                  style={{ width: "1.125rem", height: "1.125rem", accentColor: "#2563eb" }}
                />
                <span>ตามรอบบิล</span>
                <select
                  value={cycle}
                  disabled={useEndDate}
                  onChange={(e) => {
                    const v = e.target.value as InvoiceInterval;
                    setCycle(v);
                    setInterval_(v);
                  }}
                  className="app-select"
                  style={{ width: "auto", minWidth: "8.5rem", opacity: useEndDate ? 0.6 : 1 }}
                >
                  {CYCLE_OPTIONS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9375rem", cursor: "pointer", flexWrap: "wrap" }}
              >
                <input
                  type="radio"
                  name="invoice-cycle"
                  checked={useEndDate}
                  onChange={() => setInterval_("custom")}
                  style={{ width: "1.125rem", height: "1.125rem", accentColor: "#2563eb" }}
                />
                <span>กำหนดวันหมดอายุเอง</span>
                <span style={{ width: "12rem", opacity: useEndDate ? 1 : 0.6 }} onClick={() => setInterval_("custom")}>
                  <DateInput value={endDate} onChange={setEndDate} min={todayBangkok()} className="app-input" disabled={!useEndDate} />
                </span>
              </label>
              <p className="app-hint">
                {useEndDate
                  ? `สิทธิ์ถึงสิ้นวันที่เลือก (เวลาไทย) · รอบใหม่เริ่มวันนี้${invoiceCurrentEnd ? ` — แทนรอบเดิมที่ถึง ${formatDate(invoiceCurrentEnd)}` : ""}`
                  : `รายเดือน = +1 เดือน · รายปี = +12 เดือน · หมดอายุสิ้นวัน (เวลาไทย)`}
              </p>
            </div>
            {invoiceCurrentEnd && !useEndDate && (
              <div className="app-form-group">
                <label className="app-label">รอบเดิมยังไม่หมด (ถึง {formatDate(invoiceCurrentEnd)})</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" onClick={() => setMode("extend")} style={{ ...pill(mode === "extend"), textAlign: "center" }}>
                    ต่อท้ายรอบเดิม
                  </button>
                  <button type="button" onClick={() => setMode("today")} style={{ ...pill(mode === "today"), textAlign: "center" }}>
                    เริ่มนับวันนี้
                  </button>
                </div>
              </div>
            )}
            {stripeLive && (
              <div className="app-error-msg">
                บริษัทนี้มี Stripe subscription ที่ยังเก็บเงินอยู่ — วางบิลไม่ได้ ให้ลูกค้ายกเลิกใน Stripe ก่อน
              </div>
            )}
          </>
        )}

        {kind === "months" && (
          <div className="app-form-group">
            <label className="app-label">ระยะเวลาที่ให้ฟรี</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {GRANT_MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  style={{ ...pill(months === m), textAlign: "center", fontWeight: 600 }}
                >
                  ฟรี {m} เดือน
                </button>
              ))}
            </div>
            {target.inTrial && target.trialEndsAt && (
              <p className="app-hint">
                ยังมีสิทธิ์ฟรีเหลือถึง {formatDate(target.trialEndsAt)} — จะต่อท้ายจากวันนั้น
              </p>
            )}
          </div>
        )}

        <div className="app-form-group">
          <label className="app-label">เลขที่ใบแจ้งหนี้ / เหตุผล / หมายเหตุ (เก็บใน audit log)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="เช่น INV-2569-0012 โอนแล้ว 18 ก.ย. / ฟรีให้ลูกค้าอ้างอิง"
            className="app-input"
          />
        </div>

        {target.hasStripe && kind !== "invoice" && (
          <div
            style={{
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              color: "#92400e",
              padding: "0.625rem 0.875rem",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
              marginBottom: "1rem",
            }}
          >
            ⚠️ บริษัทนี้ยังผูกบัตรกับ Stripe อยู่ — การให้สิทธิ์ฟรีไม่ได้หยุดการตัดบัตร
            ต้องยกเลิก subscription ใน Stripe แยกต่างหาก
          </div>
        )}
        {kind !== "lifetime" && target.lifetime && (
          <p className="app-hint" style={{ color: "#b45309" }}>
            บริษัทนี้เป็นฟรีตลอดชีพอยู่ — ถ้าบันทึก สถานะตลอดชีพจะถูกปิด
          </p>
        )}
        {kind === "invoice" && (
          <p className="app-hint">
            หมดรอบแล้วระบบลดเป็นแผนฟรีอัตโนมัติ (cron ทุกเช้า) — ต่อรอบใหม่ได้จากหน้านี้ · ลูกค้าจะเห็น
            &ldquo;ชำระผ่านการวางบิลกับทีมงาน&rdquo; ในหน้าแพ็กเกจ
          </p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" className="app-btn app-btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="app-btn app-btn-primary"
            disabled={pending || !canSubmit}
            onClick={submit}
          >
            {pending
              ? "กำลังบันทึก…"
              : kind === "invoice"
                ? "บันทึกแพ็กเกจ"
                : kind === "lifetime"
                  ? "ให้ฟรีตลอดชีพ"
                  : `ให้ฟรี ${months} เดือน`}
          </button>
        </div>
      </div>
    </div>
  );
}
