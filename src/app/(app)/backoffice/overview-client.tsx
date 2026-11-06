"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { StatusBadges, expiryText } from "./shared";

function Stat({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="app-stat-card">
      <div className="app-stat-label">{label}</div>
      <div className="app-stat-value">{value}</div>
      {sub && <div className="app-stat-sub">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function OverviewClient() {
  const q = trpc.backoffice.overview.useQuery(undefined, { staleTime: 30_000 });

  if (q.isLoading) {
    return <div style={{ padding: "2rem", color: "#64748b" }}>กำลังโหลด…</div>;
  }
  if (q.error || !q.data) {
    return <div className="app-error-msg">{q.error?.message ?? "โหลดไม่สำเร็จ"}</div>;
  }
  const { counts, expiringSoon, cancelling, recent, asOf } = q.data;

  return (
    <>
      <div className="app-stats-grid">
        <Stat
          label="จ่ายเงินจริง"
          value={counts.paying}
          sub={`รายเดือน ${counts.monthly} · รายปี ${counts.yearly} · วางบิล ${counts.invoice}`}
          href="/backoffice/customers?filter=paying"
        />
        <Stat
          label="ทดลอง / ฟรีชั่วคราว"
          value={counts.trialing}
          sub="รวมทดลอง 30 วันและที่ทีมงานให้ฟรีเป็นเดือน"
          href="/backoffice/customers?filter=trialing"
        />
        <Stat
          label="ฟรีตลอดชีพ"
          value={counts.lifetime}
          href="/backoffice/customers?filter=lifetime"
        />
        <Stat
          label="แผนฟรี"
          value={counts.free}
          sub={`ลูกค้าทั้งหมด ${counts.customers} · สมัครใหม่ 30 วัน ${counts.newLast30Days}`}
          href="/backoffice/customers?filter=free"
        />
      </div>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr", marginBottom: "1rem" }}>
        <ListCard
          title={`⏳ ใกล้หมดอายุใน 7 วัน (${expiringSoon.length})`}
          subtitle="ทดลองใช้จะหมด หรือกดยกเลิกแล้วรอบบิลจะสิ้นสุด — โทรหา/ให้สิทธิ์ก่อนหาย"
          rows={expiringSoon}
          empty="ไม่มีลูกค้าใกล้หมดอายุ"
          href="/backoffice/customers?filter=expiring"
        />
        <ListCard
          title={`🚪 กดยกเลิกแล้ว ยังไม่หมดรอบ (${cancelling.length})`}
          subtitle="ยังใช้ได้ถึงวันสิ้นรอบ — ยังกลับมาต่อได้ถ้าเปลี่ยนใจ"
          rows={cancelling}
          empty="ไม่มีลูกค้าที่กดยกเลิก"
          href="/backoffice/customers?filter=cancelling"
        />
        <ListCard
          title="🆕 สมัครล่าสุด"
          subtitle="5 บริษัทล่าสุด"
          rows={recent}
          empty="ยังไม่มีลูกค้า"
          href="/backoffice/customers"
          showCreated
        />
      </div>

      <p className="app-hint">
        ข้อมูล ณ {formatDateTime(asOf)} · บริษัทของทีมงาน {counts.team} แห่ง ไม่นับเป็นลูกค้า
      </p>
    </>
  );
}

type Row = inferRouterOutputs<AppRouter>["backoffice"]["overview"]["recent"][number];

function ListCard({
  title,
  subtitle,
  rows,
  empty,
  href,
  showCreated,
}: {
  title: string;
  subtitle: string;
  rows: Row[];
  empty: string;
  href: string;
  showCreated?: boolean;
}) {
  return (
    <div className="app-card" style={{ padding: 0 }}>
      <div className="app-card-header" style={{ padding: "1rem 1.25rem 0.5rem" }}>
        <div>
          <h2 className="app-card-title">{title}</h2>
          <p className="app-card-subtitle">{subtitle}</p>
        </div>
        <Link href={href} className="app-btn app-btn-ghost app-btn-sm">
          ดูทั้งหมด →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "1rem 1.25rem 1.25rem", color: "#64748b", fontSize: "0.875rem" }}>
          {empty}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="app-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>บริษัท</th>
                <th>แพ็กเกจ</th>
                <th>สถานะ</th>
                <th>{showCreated ? "สมัครเมื่อ" : "หมดอายุ"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ex = expiryText(r);
                return (
                  <tr key={r.orgId}>
                    <td>
                      <Link href={`/backoffice/customers/${r.orgId}`} style={{ fontWeight: 600 }}>
                        {r.orgName}
                      </Link>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {r.ownerName || r.ownerEmail || "—"}
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.planLabel}</td>
                    <td>
                      <StatusBadges r={r} />
                    </td>
                    <td>
                      {showCreated ? (
                        formatDate(r.createdAt)
                      ) : (
                        <>
                          <div style={{ fontWeight: ex.warn ? 600 : 400, color: ex.warn ? "#b45309" : undefined }}>
                            {ex.text}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{ex.sub}</div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
