import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { COMPANY_NAME, DPO_EMAIL } from "@/lib/legal/version";

export const metadata: Metadata = {
  title: `จัดการข้อมูลส่วนบุคคล · ${COMPANY_NAME}`,
};

const REQUEST_TYPES = [
  {
    id: "access",
    title: "ขอเข้าถึง / ขอสำเนาข้อมูล",
    body: "ขอสำเนาข้อมูลส่วนบุคคลของฉันที่ระบบเก็บไว้ทั้งหมด รวมถึง audit log",
    pdpa: "มาตรา 30 PDPA",
  },
  {
    id: "rectify",
    title: "ขอแก้ไขข้อมูลให้ถูกต้อง",
    body: "ข้อมูลส่วนบุคคลของฉันต่อไปนี้ไม่ถูกต้อง: [กรุณาระบุ]\nต้องการแก้ไขเป็น: [กรุณาระบุ]",
    pdpa: "มาตรา 35 PDPA",
  },
  {
    id: "delete",
    title: "ขอให้ลบบัญชีและข้อมูล",
    body: "ขอให้ลบบัญชีและข้อมูลส่วนบุคคลของฉันออกจากระบบ Aim Expense\n(ทราบดีว่าข้อมูลใน Google Drive/Sheets ของฉันยังอยู่ภายใต้การควบคุมของฉัน)",
    pdpa: "มาตรา 33 PDPA",
  },
  {
    id: "restrict",
    title: "ขอระงับการประมวลผลชั่วคราว",
    body: "ขอให้ระงับการประมวลผลข้อมูลส่วนบุคคลของฉันชั่วคราว เนื่องจาก: [กรุณาระบุเหตุผล]",
    pdpa: "มาตรา 34 PDPA",
  },
  {
    id: "portability",
    title: "ขอย้ายข้อมูล (Data Portability)",
    body: "ขอข้อมูลส่วนบุคคลของฉันในรูปแบบที่ machine-readable (JSON/CSV) เพื่อโอนไปยังผู้ให้บริการอื่น",
    pdpa: "มาตรา 31 PDPA",
  },
  {
    id: "withdraw",
    title: "เพิกถอนความยินยอม",
    body: "ขอเพิกถอนความยินยอมที่เคยให้ไว้สำหรับ: [กรุณาระบุ — เช่น LINE OA notifications, OpenAI OCR fallback]",
    pdpa: "มาตรา 19 PDPA",
  },
] as const;

function buildMailto(account: string, requestType: typeof REQUEST_TYPES[number]) {
  const subject = `[DSR] ${requestType.title}`;
  const body = [
    "เรียนทีม DPO Aim Expense,",
    "",
    requestType.body,
    "",
    `บัญชี: ${account}`,
    `อ้างอิงสิทธิ: ${requestType.pdpa}`,
    "",
    "ขอบคุณครับ/ค่ะ",
  ].join("\n");
  return `mailto:${DPO_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default async function AccountDataPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, displayName: true },
  });
  const accountLabel = user?.email || user?.displayName || session.displayName || session.userId;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🔐 จัดการข้อมูลส่วนบุคคล</h1>
          <p className="app-page-subtitle">
            สิทธิของท่านตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
          </p>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-3xl space-y-6 px-4 pb-12 sm:px-6">
        {/* Summary card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">ข้อมูลที่เราเก็บเกี่ยวกับท่าน</h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">บัญชี</dt>
              <dd className="font-medium text-slate-900">{accountLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500">User ID</dt>
              <dd className="font-mono text-xs text-slate-700">{session.userId}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-slate-600">
            ข้อมูลธุรกิจของท่าน (ใบเสร็จ, ลูกค้า, รายการจ่าย ฯลฯ) เก็บใน
            <strong> Google Drive / Sheets ของท่านเอง</strong> — ไม่ได้อยู่ที่เซิร์ฟเวอร์ของเรา
            ท่านควบคุมข้อมูลได้โดยตรงผ่าน Google Drive
          </p>
          <div className="mt-3 text-sm">
            <Link
              href="/privacy"
              className="text-brand-600 hover:underline"
            >
              อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม →
            </Link>
          </div>
        </section>

        {/* Request types */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">ใช้สิทธิของท่าน</h2>
          <p className="mt-1 text-sm text-slate-600">
            เลือกประเภทคำขอเพื่อส่งอีเมลถึง DPO ของเรา — เราตอบกลับภายใน <strong>30 วัน</strong>
            ตามที่ PDPA กำหนด
          </p>

          <div className="mt-4 space-y-3">
            {REQUEST_TYPES.map((rt) => (
              <a
                key={rt.id}
                href={buildMailto(accountLabel, rt)}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-base font-semibold text-brand-700">
                  ✉
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{rt.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{rt.pdpa}</p>
                </div>
                <span className="text-sm text-slate-400">→</span>
              </a>
            ))}
          </div>
        </section>

        {/* Complaint */}
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6">
          <h2 className="text-base font-semibold text-amber-900">ไม่พอใจวิธีที่เราจัดการข้อมูล?</h2>
          <p className="mt-2 text-sm text-amber-800">
            ท่านสามารถร้องเรียนต่อ <strong>สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส. / PDPC)</strong> ได้โดยตรง
          </p>
          <a
            href="https://www.pdpc.or.th"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 hover:underline"
          >
            pdpc.or.th →
          </a>
        </section>

        <p className="text-center text-xs text-slate-400">
          DPO: <a className="text-slate-500 hover:underline" href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}
