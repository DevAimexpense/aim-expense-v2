// ===========================================
// Step 3: Connect Google (Sheets + Drive + Gmail)
// ===========================================

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function GooglePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.onboardingStep === "line_login" || session.onboardingStep === "line_oa") {
    redirect("/onboarding/line-oa");
  }
  if (session.onboardingStep === "company") redirect("/onboarding/company");
  if (session.onboardingStep === "done") redirect("/dashboard");

  const params = await searchParams;
  const error = params.error;

  return (
    <div className="onb-step-wrap">
      <div className="onb-card">
        <div style={{ marginBottom: "1.5rem" }}>
          <div className="onb-step-pill">
            <span className="dot" />
            ขั้นตอนที่ 3 จาก 4
          </div>
          <h1 className="onb-title">เชื่อมต่อ Google Account</h1>
          <p className="onb-subtitle">
            เพื่อเก็บข้อมูลธุรกิจของคุณใน Google Sheets &amp; Drive ของคุณเอง
          </p>
        </div>

        {error && (
          <div className="onb-error">
            {error === "access_denied"
              ? "คุณปฏิเสธการให้สิทธิ์ — โปรดอนุญาตเพื่อใช้งานต่อ"
              : error === "no_code"
              ? "ไม่ได้รับรหัสยืนยันจาก Google"
              : "เกิดข้อผิดพลาด โปรดลองอีกครั้ง"}
          </div>
        )}

        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0f172a", marginBottom: "0.75rem" }}>
            สิ่งที่ระบบจะขอสิทธิ์จาก Google Account ของคุณ
          </p>

          <div className="onb-scope-item">
            <div className="onb-scope-icon blue">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2M9 9h6M9 13h6M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="onb-scope-title">Google Sheets</p>
              <p className="onb-scope-desc">สร้างและจัดการ Master Sheet สำหรับเก็บข้อมูลธุรกิจ</p>
            </div>
          </div>

          <div className="onb-scope-item">
            <div className="onb-scope-icon green">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="onb-scope-title">Google Drive</p>
              <p className="onb-scope-desc">สร้างโฟลเดอร์และเก็บใบเสร็จ ใบกำกับภาษี</p>
            </div>
          </div>

          <div className="onb-scope-item">
            <div className="onb-scope-icon red">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="onb-scope-title">Gmail</p>
              <p className="onb-scope-desc">อ่านใบเสร็จที่ส่งเข้า email อัตโนมัติ</p>
            </div>
          </div>
        </div>

        <div className="onb-info-box">
          <div className="onb-info-icon">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="onb-info-title">ข้อมูลธุรกิจของคุณเป็นของคุณ</p>
            <p className="onb-info-desc">
              เราไม่เก็บข้อมูลธุรกิจของคุณบน server ของเรา ข้อมูลทั้งหมดจะอยู่ใน
              Google Drive ของคุณเอง สามารถยกเลิกการเข้าถึงได้ทุกเมื่อจาก Google Account
            </p>
          </div>
        </div>

        <a href="/api/auth/google" className="onb-btn-google">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          <span>เชื่อมต่อด้วย Google Account</span>
        </a>
      </div>
    </div>
  );
}
