"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/utils/date";
import { StatusBadges, expiryText, intervalLabel } from "../shared";
import { GrantModal, type GrantTarget } from "./grant-modal";

type Filter =
  | "all"
  | "paying"
  | "trialing"
  | "lifetime"
  | "free"
  | "expiring"
  | "cancelling";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "paying", label: "จ่ายเงิน" },
  { key: "trialing", label: "ทดลอง / ฟรีชั่วคราว" },
  { key: "lifetime", label: "ฟรีตลอดชีพ" },
  { key: "free", label: "แผนฟรี" },
  { key: "expiring", label: "ใกล้หมดอายุ" },
  { key: "cancelling", label: "กดยกเลิกแล้ว" },
];

function isFilter(v: string | null): v is Filter {
  return FILTERS.some((f) => f.key === v);
}

export function CustomersClient() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const params = useSearchParams();
  const urlFilter = params.get("filter");
  const filter: Filter = isFilter(urlFilter) ? urlFilter : "all";
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<GrantTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = trpc.backoffice.accounts.useQuery({ filter });
  const revokeMut = trpc.backoffice.revoke.useMutation();

  const setFilter = (f: Filter) =>
    router.replace(f === "all" ? "/backoffice/customers" : `/backoffice/customers?filter=${f}`);

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

  const refresh = () => {
    utils.backoffice.accounts.invalidate();
    utils.backoffice.overview.invalidate();
  };

  const handleRevoke = async (orgId: string, orgName: string, kind: string) => {
    const effect = kind === "วางบิล/โอน" ? " → ลดเป็นแผนฟรีทันที ไม่รอสิ้นรอบที่จ่ายไว้" : "";
    if (!window.confirm(`ยกเลิกสิทธิ์${kind}ของ "${orgName}" ทันที${effect}?`)) return;
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
              <th>รอบบิล</th>
              <th>หมดอายุ</th>
              <th className="num">สมาชิก</th>
              <th>สมัครเมื่อ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                  กำลังโหลด…
                </td>
              </tr>
            )}
            {q.error && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "#dc2626" }}>
                  {q.error.message}
                </td>
              </tr>
            )}
            {!q.isLoading && !q.error && rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                  ไม่พบลูกค้า
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const ex = expiryText(r);
              const overCap = r.memberCap !== -1 && r.memberCount > r.memberCap;
              return (
                <tr key={r.orgId}>
                  <td style={{ minWidth: "180px" }}>
                    <Link href={`/backoffice/customers/${r.orgId}`} style={{ fontWeight: 600 }}>
                      {r.orgName}
                    </Link>
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
                    <StatusBadges r={r} />
                  </td>
                  <td>{intervalLabel(r.billingInterval, r.invoice)}</td>
                  <td>
                    <div style={{ fontWeight: ex.warn ? 600 : 400, color: ex.warn ? "#b45309" : undefined }}>
                      {ex.text}
                    </div>
                    {ex.sub && (
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{ex.sub}</div>
                    )}
                  </td>
                  <td className="num" title="สมาชิกที่ใช้งาน / เพดานของแพ็กเกจ">
                    <span style={{ color: overCap ? "#dc2626" : undefined, fontWeight: overCap ? 600 : 400 }}>
                      {r.memberCount}
                    </span>
                    <span style={{ color: "#94a3b8" }}>
                      {" / "}
                      {r.memberCap === -1 ? "∞" : r.memberCap}
                    </span>
                  </td>
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
                        กำหนดแพ็กเกจ
                      </button>
                      {(r.lifetime || r.inTrial || r.invoice) && (
                        <button
                          type="button"
                          className="app-btn app-btn-ghost app-btn-sm"
                          style={{ color: "#dc2626" }}
                          disabled={revokeMut.isPending}
                          onClick={() =>
                            handleRevoke(
                              r.orgId,
                              r.orgName,
                              r.inTrial ? "ใช้ฟรีชั่วคราว" : r.lifetime ? "ฟรีตลอดชีพ" : "วางบิล/โอน",
                            )
                          }
                        >
                          ยกเลิกสิทธิ์
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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
