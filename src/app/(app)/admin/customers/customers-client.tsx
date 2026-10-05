"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/utils/date";
import { PLAN_LABELS, PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import { GRANTABLE_PLANS, GRANT_MONTH_OPTIONS } from "@/lib/comp";

type Filter = "all" | "paying" | "trialing" | "lifetime" | "free";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "paying", label: "จ่ายเงิน" },
  { key: "trialing", label: "ทดลอง / ฟรีชั่วคราว" },
  { key: "lifetime", label: "ฟรีตลอดชีพ" },
  { key: "free", label: "แผนฟรี" },
];

type GrantKind = "months" | "lifetime";

interface Target {
  orgId: string;
  orgName: string;
  lifetime: boolean;
  inTrial: boolean;
  trialEndsAt: string | null;
  hasStripe: boolean;
  planLabel: string;
}

function limitText(n: number, unit: string) {
  return n === -1 ? `ไม่จำกัด${unit}` : `${n.toLocaleString("th-TH")} ${unit}`;
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        background: bg,
        color,
        padding: "0.125rem 0.5rem",
        borderRadius: "999px",
        fontSize: "0.6875rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function CustomersClient() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = trpc.backoffice.accounts.useQuery({ filter });
  const revokeMut = trpc.backoffice.revoke.useMutation();

  const rows = useMemo(() => {
    const all = q.data?.rows || [];
    const s = search.trim().toLowerCase();
    if (!s) return all;
    return all.filter((r) =>
      [r.orgName, r.ownerName, r.ownerEmail]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(s)),
    );
  }, [q.data, search]);

  const refresh = () => utils.backoffice.accounts.invalidate();

  const handleRevoke = async (orgId: string, orgName: string, lifetime: boolean) => {
    if (
      !window.confirm(
        `ยกเลิกสิทธิ์${lifetime ? "ฟรีตลอดชีพ" : "ใช้ฟรีชั่วคราว"}ของ "${orgName}" ทันที?`,
      )
    )
      return;
    setError(null);
    setNotice(null);
    try {
      await revokeMut.mutateAsync({ orgId });
      setNotice(`ยกเลิกสิทธิ์ของ "${orgName}" แล้ว`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <>
      {/* Filters + search */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                padding: "0.375rem 0.75rem",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                fontSize: "0.8125rem",
                fontWeight: 500,
                background: active ? "#2563eb" : "#e2e8f0",
                color: active ? "white" : "#475569",
              }}
            >
              {f.label}
              {q.data && (
                <span style={{ marginLeft: "0.375rem", opacity: 0.7 }}>
                  {q.data.counts[f.key]}
                </span>
              )}
            </button>
          );
        })}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อบริษัท / เจ้าของ / อีเมล"
          className="app-input"
          style={{ marginLeft: "auto", maxWidth: "280px" }}
        />
      </div>

      {error && <div className="app-error-msg">{error}</div>}
      {notice && (
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
          ✓ {notice}
        </div>
      )}

      <div className="app-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="app-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>บริษัท</th>
              <th>เจ้าของ</th>
              <th>แพ็กเกจ</th>
              <th>สถานะ</th>
              <th className="num">สมาชิก</th>
              <th>สมัครเมื่อ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                  กำลังโหลด…
                </td>
              </tr>
            )}
            {q.error && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "#dc2626" }}>
                  {q.error.message}
                </td>
              </tr>
            )}
            {!q.isLoading && !q.error && rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                  ไม่พบลูกค้า
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.orgId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.orgName}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {r.entityType === "personal" ? "บุคคลธรรมดา" : "นิติบุคคล"}
                  </div>
                </td>
                <td>
                  <div>{r.ownerName || "—"}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {r.ownerEmail || ""}
                  </div>
                </td>
                <td style={{ fontWeight: 600 }}>{r.planLabel}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    {r.lifetime && (
                      <Badge bg="#ede9fe" color="#5b21b6">ฟรีตลอดชีพ</Badge>
                    )}
                    {r.inTrial && (
                      <Badge bg="#fef3c7" color="#92400e">
                        ฟรีถึง {r.trialEndsAt ? formatDate(r.trialEndsAt) : "—"}
                      </Badge>
                    )}
                    {r.paying && <Badge bg="#dcfce7" color="#166534">จ่ายเงิน</Badge>}
                    {r.hasStripe && r.lifetime && (
                      <Badge bg="#fee2e2" color="#991b1b">ยังผูก Stripe</Badge>
                    )}
                    {r.cancelAtPeriodEnd && (
                      <Badge bg="#fee2e2" color="#991b1b">
                        จะยกเลิก{r.currentPeriodEnd ? ` ${formatDate(r.currentPeriodEnd)}` : ""}
                      </Badge>
                    )}
                    {!r.lifetime && !r.inTrial && !r.paying && (
                      <Badge bg="#f1f5f9" color="#475569">แผนฟรี</Badge>
                    )}
                  </div>
                </td>
                <td className="num">{r.memberCount}</td>
                <td>{formatDate(r.createdAt)}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="app-btn app-btn-secondary app-btn-sm"
                      onClick={() => {
                        setNotice(null);
                        setError(null);
                        setTarget(r);
                      }}
                    >
                      🎁 ให้สิทธิ์ฟรี
                    </button>
                    {(r.lifetime || r.inTrial) && (
                      <button
                        type="button"
                        className="app-btn app-btn-ghost app-btn-sm"
                        style={{ color: "#dc2626" }}
                        disabled={revokeMut.isPending}
                        onClick={() => handleRevoke(r.orgId, r.orgName, r.lifetime)}
                      >
                        ยกเลิกสิทธิ์
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <GrantModal
          target={target}
          onClose={() => setTarget(null)}
          onDone={(msg) => {
            setTarget(null);
            setNotice(msg);
            refresh();
          }}
        />
      )}
    </>
  );
}

// ===== Grant modal =====

const KINDS: { key: GrantKind; label: string; hint: string }[] = [
  { key: "months", label: "ฟรีชั่วคราว", hint: "1 / 2 / 3 เดือน — หมดแล้วกลับแพ็กเกจเดิม" },
  { key: "lifetime", label: "ฟรีตลอดชีพ", hint: "ไม่มีวันหมดอายุ" },
];

function GrantModal({
  target,
  onClose,
  onDone,
}: {
  target: Target;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const grantMut = trpc.backoffice.grant.useMutation();
  const [kind, setKind] = useState<GrantKind>("months");
  const [months, setMonths] = useState<(typeof GRANT_MONTH_OPTIONS)[number]>(1);
  const [plan, setPlan] = useState<Exclude<PlanTier, "free">>("pro");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const limits = PLAN_LIMITS[plan];

  const submit = async () => {
    setError(null);
    try {
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
            <h2 className="app-card-title">🎁 ให้สิทธิ์ใช้ฟรี</h2>
            <p className="app-card-subtitle">
              {target.orgName} · ตอนนี้: {target.planLabel}
              {target.lifetime
                ? " (ฟรีตลอดชีพ)"
                : target.inTrial && target.trialEndsAt
                  ? ` (ฟรีถึง ${formatDate(target.trialEndsAt)})`
                  : ""}
            </p>
          </div>
        </div>

        {error && <div className="app-error-msg">{error}</div>}

        <div className="app-form-group">
          <label className="app-label">รูปแบบ</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                style={pill(kind === k.key)}
              >
                <div style={{ fontWeight: 600 }}>{k.label}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{k.hint}</div>
              </button>
            ))}
          </div>
        </div>

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
          <label className="app-label">แพ็กเกจที่ให้</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as Exclude<PlanTier, "free">)}
            className="app-select"
          >
            {GRANTABLE_PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABELS[p]}
                {p === "enterprise" ? " (สูงสุด — ไม่จำกัดทุกอย่าง)" : ""}
              </option>
            ))}
          </select>
          <p className="app-hint">
            {limitText(limits.users, "ผู้ใช้")} · {limitText(limits.businesses, "ธุรกิจ")} ·{" "}
            {limitText(limits.events, "โปรเจกต์")} · OCR {limitText(limits.ocrPerMonth, "ครั้ง/เดือน")}
          </p>
        </div>

        <div className="app-form-group">
          <label className="app-label">หมายเหตุ (เก็บใน audit log)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="เช่น ลูกค้าอ้างอิง / แลกรีวิว"
            className="app-input"
          />
        </div>

        {target.hasStripe && (
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
        {kind === "months" && target.lifetime && (
          <p className="app-hint" style={{ color: "#b45309" }}>
            บริษัทนี้เป็นฟรีตลอดชีพอยู่ — ถ้าบันทึก สถานะตลอดชีพจะถูกปิด
          </p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" className="app-btn app-btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="app-btn app-btn-primary"
            disabled={grantMut.isPending}
            onClick={submit}
          >
            {grantMut.isPending
              ? "กำลังบันทึก…"
              : kind === "lifetime"
                ? "ให้ฟรีตลอดชีพ"
                : `ให้ฟรี ${months} เดือน`}
          </button>
        </div>
      </div>
    </div>
  );
}
