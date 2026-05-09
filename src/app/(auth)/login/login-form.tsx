"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleLineLogin = () => {
    if (!acceptedTerms) return;
    setIsLoading(true);
    window.location.href = "/api/auth/line";
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-slate-50">
      {/* Decorative background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-brand-200/40 blur-3xl sm:h-[28rem] sm:w-[28rem]" />
        <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-accent-200/40 blur-3xl sm:h-[30rem] sm:w-[30rem]" />
        <div className="absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 blur-3xl" />
      </div>

      <div className="flex min-h-screen w-full flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex w-full max-w-sm flex-col items-center sm:max-w-md">
          {/* Logo & Brand */}
          <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/30 sm:h-16 sm:w-16">
              <span className="text-2xl font-bold text-white sm:text-3xl">
                A
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Aim Expense
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 sm:text-base">
              ระบบจัดการค่าใช้จ่ายสำหรับ SME
            </p>
          </div>

          {/* Login Card */}
          <div className="w-full rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-sm sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                เข้าสู่ระบบ / สมัครสมาชิก
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                เข้าใช้งานด้วย LINE Account ของคุณ
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error === "access_denied"
                  ? "คุณยกเลิกการเข้าสู่ระบบ"
                  : error === "must_login_first"
                  ? "โปรดเข้าสู่ระบบก่อน"
                  : error === "invalid_state"
                  ? "เซสชันหมดอายุ ลองใหม่อีกครั้ง"
                  : "เกิดข้อผิดพลาด โปรดลองอีกครั้ง"}
              </div>
            )}

            {/* PDPA-aligned consent checkbox */}
            <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                aria-describedby="terms-text"
              />
              <span id="terms-text" className="text-slate-700">
                ฉันยอมรับ{" "}
                <a href="/terms" target="_blank" rel="noopener" className="font-medium text-brand-600 hover:underline">
                  ข้อกำหนดการใช้งาน
                </a>
                {" และ "}
                <a href="/privacy" target="_blank" rel="noopener" className="font-medium text-brand-600 hover:underline">
                  นโยบายความเป็นส่วนตัว
                </a>
              </span>
            </label>

            <button
              onClick={handleLineLogin}
              disabled={isLoading || !acceptedTerms}
              className="group flex w-full items-center justify-center gap-3 rounded-xl bg-[#06c755] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#05b34a] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
            >
              {isLoading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>กำลังเข้าสู่ระบบ...</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-5 w-5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                  <span>เข้าสู่ระบบด้วย LINE</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                ปลอดภัย
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Info */}
            <div className="flex gap-3 rounded-xl bg-brand-50/70 p-4 ring-1 ring-inset ring-brand-100">
              <div className="shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-900">
                  ข้อมูลของคุณปลอดภัย
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-brand-700/90 sm:text-sm">
                  ข้อมูลธุรกิจทั้งหมดเก็บใน Google Sheets &amp; Drive
                  ของคุณเอง เราไม่เก็บข้อมูลธุรกิจบน server ของเรา
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-slate-400 sm:mt-8">
            <div className="flex items-center gap-3">
              <a href="/privacy" className="hover:text-slate-600">นโยบายความเป็นส่วนตัว</a>
              <span aria-hidden>·</span>
              <a href="/terms" className="hover:text-slate-600">ข้อกำหนดการใช้งาน</a>
            </div>
            <p>&copy; {new Date().getFullYear()} Aim Expense. All rights reserved.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
