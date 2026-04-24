import Link from "next/link";
import { LEGAL_VERSION, COMPANY_NAME } from "@/lib/legal/version";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <span className="text-sm font-bold">A</span>
            </div>
            <span className="text-base font-semibold text-slate-900">{COMPANY_NAME}</span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          {children}
          <p className="mt-10 border-t border-slate-100 pt-4 text-xs text-slate-400">
            เวอร์ชันเอกสาร: {LEGAL_VERSION}
          </p>
        </article>
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-4xl px-4 pb-10 text-center text-xs text-slate-400 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/privacy" className="hover:text-slate-600">นโยบายความเป็นส่วนตัว</Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="hover:text-slate-600">ข้อกำหนดการใช้งาน</Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} {COMPANY_NAME}</span>
        </div>
      </footer>
    </div>
  );
}
