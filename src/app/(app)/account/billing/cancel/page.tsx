// ===========================================
// /account/billing/cancel — ยกเลิกแพ็กเกจ (self-service)
// ยกเลิกแบบสิ้นรอบบิล: ใช้ต่อได้จนจบรอบที่จ่ายแล้ว → กลับเป็น Free Forever
// เฉพาะ admin ของ org
// ===========================================

import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils/date";
import {
  PLAN_LABELS,
  PLAN_LIMITS,
  effectivePlan,
  isInTrial,
  type SubscriptionState,
} from "@/lib/plans";
import { COMPANY_NAME } from "@/lib/legal/version";
import { CancelPlanButton } from "./cancel-button";

export const metadata: Metadata = {
  title: `ยกเลิกแพ็กเกจ · ${COMPANY_NAME}`,
};

function limitText(n: number, unit: string) {
  return n === -1 ? `ไม่จำกัด${unit}` : `${n.toLocaleString("th-TH")} ${unit}`;
}

export default async function CancelPlanPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const org = await getOrgContext(session.userId, session.activeOrgId);
  if (!org) redirect("/");

  const sub = await prisma.subscription.findUnique({
    where: { orgId: org.orgId },
    select: {
      plan: true,
      trialPlan: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: true,
      isBetaTester: true,
    },
  });

  const plan = effectivePlan(sub as SubscriptionState | null);
  const inTrial = isInTrial(sub as SubscriptionState | null);
  const lifetime = sub?.isBetaTester === true;
  const hasStripe = !!sub?.stripeSubscriptionId;
  const isAdmin = org.role === "admin";
  const free = PLAN_LIMITS.free;
  const cur = PLAN_LIMITS[plan];
  const periodEnd = sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : null;

  // เหตุผลที่ยกเลิกไม่ได้ / ไม่ต้องยกเลิก
  let blocked: string | null = null;
  if (!isAdmin) blocked = "เฉพาะ Admin ขององค์กรเท่านั้นที่ยกเลิกแพ็กเกจได้";
  else if (!hasStripe && lifetime)
    blocked = "บัญชีนี้ได้สิทธิ์ใช้ฟรีตลอดชีพ — ไม่มีการเรียกเก็บเงิน จึงไม่มีอะไรต้องยกเลิก";
  else if (!hasStripe && inTrial)
    blocked = `คุณกำลังใช้สิทธิ์ฟรีถึง ${sub?.trialEndsAt ? formatDate(sub.trialEndsAt) : "—"} — ไม่มีการเรียกเก็บเงิน เมื่อหมดช่วงฟรีจะกลับเป็น Free Forever เอง`;
  else if (!hasStripe)
    blocked = "คุณใช้แผน Free Forever อยู่ — ไม่มีแพ็กเกจแบบชำระเงินที่ต้องยกเลิก";

  return (
    <div className="app-page" style={{ maxWidth: "720px" }}>
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">ยกเลิกแพ็กเกจ</h1>
          <p className="app-page-subtitle">
            {org.orgName} · แพ็กเกจปัจจุบัน: {PLAN_LABELS[plan]}
          </p>
        </div>
      </div>

      {blocked ? (
        <div className="app-card">
          <p style={{ fontSize: "0.9375rem", color: "#334155" }}>{blocked}</p>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/account/billing" className="app-btn app-btn-secondary">
              ← กลับหน้าแพ็กเกจ
            </Link>
          </div>
        </div>
      ) : sub?.cancelAtPeriodEnd ? (
        <div className="app-card">
          <div className="app-card-header">
            <h2 className="app-card-title">แพ็กเกจนี้ถูกตั้งให้ยกเลิกแล้ว</h2>
          </div>
          <p style={{ fontSize: "0.9375rem", color: "#334155" }}>
            คุณยังใช้ {PLAN_LABELS[plan]} ได้ตามปกติ
            {periodEnd ? ` จนถึงวันที่ ${periodEnd}` : " จนสิ้นรอบบิล"}{" "}
            จากนั้นจะกลับเป็น Free Forever และไม่มีการเรียกเก็บเงินอีก
          </p>
          <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.5rem" }}>
            เปลี่ยนใจได้ก่อนวันดังกล่าว — กดปุ่มด้านล่างเพื่อใช้แพ็กเกจต่อ
          </p>
          <div style={{ marginTop: "1rem" }}>
            <CancelPlanButton action="resume" />
          </div>
        </div>
      ) : (
        <>
          <div className="app-card" style={{ marginBottom: "1rem" }}>
            <div className="app-card-header">
              <h2 className="app-card-title">เมื่อยกเลิกจะเกิดอะไรขึ้น</h2>
            </div>
            <ul
              style={{
                fontSize: "0.9375rem",
                color: "#334155",
                paddingLeft: "1.25rem",
                listStyle: "disc",
                display: "grid",
                gap: "0.5rem",
              }}
            >
              <li>
                ใช้ {PLAN_LABELS[plan]} ต่อได้
                {periodEnd ? ` จนถึงวันที่ ${periodEnd}` : " จนสิ้นรอบบิลปัจจุบัน"}{" "}
                (รอบที่ชำระไปแล้ว ไม่มีการคืนเงินตามสัดส่วน)
              </li>
              <li>หลังจากนั้นจะไม่มีการตัดบัตรอีก และบัญชีกลับเป็น Free Forever</li>
              <li>
                ข้อมูลทั้งหมดยังอยู่ใน Google Sheet / Drive ของคุณเหมือนเดิม —
                เราไม่ลบอะไร
              </li>
              <li>เปลี่ยนใจกลับมาใช้ต่อได้ตลอดก่อนสิ้นรอบบิล</li>
            </ul>
          </div>

          <div className="app-card" style={{ marginBottom: "1rem" }}>
            <div className="app-card-header">
              <h2 className="app-card-title">สิ่งที่จะลดลงเมื่อกลับเป็น Free Forever</h2>
            </div>
            <table className="app-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th></th>
                  <th>{PLAN_LABELS[plan]} (ตอนนี้)</th>
                  <th>Free Forever</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>ผู้ใช้งาน</td>
                  <td>{limitText(cur.users, "คน")}</td>
                  <td>{limitText(free.users, "คน")}</td>
                </tr>
                <tr>
                  <td>โปรเจกต์</td>
                  <td>{limitText(cur.events, "โปรเจกต์")}</td>
                  <td>{limitText(free.events, "โปรเจกต์")}</td>
                </tr>
                <tr>
                  <td>สแกนใบเสร็จ (OCR)</td>
                  <td>{limitText(cur.ocrPerMonth, "ครั้ง/เดือน")}</td>
                  <td>{limitText(free.ocrPerMonth, "ครั้ง/เดือน")}</td>
                </tr>
                <tr>
                  <td>LINE กลุ่ม</td>
                  <td>{limitText(cur.lineGroups, "กลุ่ม")}</td>
                  <td>{limitText(free.lineGroups, "กลุ่ม")}</td>
                </tr>
                <tr>
                  <td>ใบเสนอราคา / ใบวางบิล / ใบกำกับภาษี / อนุมัติ / หนังสือรับรองหัก ณ ที่จ่าย</td>
                  <td>ตามแพ็กเกจ</td>
                  <td>ใช้ไม่ได้</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="app-card">
            <CancelPlanButton action="cancel" periodEnd={periodEnd} />
          </div>
        </>
      )}
    </div>
  );
}
