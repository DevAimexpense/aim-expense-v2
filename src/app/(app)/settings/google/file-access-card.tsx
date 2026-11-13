"use client";

// ===========================================
// การ์ด "สิทธิ์เข้าถึงชีตและโฟลเดอร์" — หน้า ตั้งค่า › เชื่อมต่อ Google
//
// org ที่สร้างก่อนย้าย Google client (2026-07-09) แอปมองไม่เห็นชีต/โฟลเดอร์เดิม
// (scope drive.file ผูกไฟล์กับ client ที่สร้าง) ทั้งที่ token ยังดี — เจ้าของกด
// "ยืนยันสิทธิ์ชีตเดิม" → ไปหน้า Google เต็มหน้า (Picker แบบ redirect ใช้ได้ทุกอุปกรณ์
// รวม iPad/มือถือ) → เลือกไฟล์ของธุรกิจนี้ → กลับมาหน้านี้พร้อม ?regrant=<ผล>
// ===========================================

import { trpc } from "@/lib/trpc/client";

const STATUS_LABEL: Record<string, { text: string; color: string; icon: string }> = {
  ok: { text: "เข้าถึงได้", color: "#16a34a", icon: "✓" },
  no_access: { text: "แอปเข้าถึงไม่ได้", color: "#dc2626", icon: "✗" },
  trashed: { text: "อยู่ในถังขยะ Google Drive", color: "#d97706", icon: "!" },
  missing_id: { text: "ไม่มี (ใช้โฟลเดอร์หลักแทน)", color: "#94a3b8", icon: "–" },
};

/** ผลจาก /api/auth/google/callback (?regrant=...) */
const RESULT_MESSAGE: Record<string, { tone: "ok" | "error" | "info"; text: string }> = {
  ok: { tone: "ok", text: "ยืนยันสิทธิ์สำเร็จ — ใช้งานชีตและโฟลเดอร์เดิมได้ตามปกติแล้ว" },
  partial: {
    tone: "error",
    text: "ยังเข้าถึงไม่ครบ — กดอีกครั้งแล้วเลือกให้ครบทุกรายการ (ชีต + ทุกโฟลเดอร์) ก่อนกดยืนยัน",
  },
  cancelled: { tone: "info", text: "ยกเลิกแล้ว — ยังไม่ได้ยืนยันสิทธิ์" },
  wrong_account: {
    tone: "error",
    text: "เลือกไฟล์ด้วยบัญชี Google คนละบัญชีกับที่เชื่อมไว้ — กดอีกครั้งแล้วเลือกบัญชีที่แสดงในขั้นที่ 1",
  },
  not_owner: { tone: "error", text: "เฉพาะเจ้าของธุรกิจที่ยืนยันสิทธิ์ได้" },
  expired: { tone: "error", text: "หมดเวลา — กด “ยืนยันสิทธิ์ชีตเดิม” ใหม่อีกครั้ง" },
  failed: { tone: "error", text: "ยืนยันสิทธิ์ไม่สำเร็จ — ลองใหม่อีกครั้ง หรือติดต่อทีม Aim Expense" },
  // GA-10
  drive_not_granted: {
    tone: "error",
    text: "ยังไม่ได้อนุญาตสิทธิ์ Google Drive — กดอีกครั้ง แล้วติ๊กอนุญาตสิทธิ์ Google Drive ในหน้า Google",
  },
  // GA-09
  no_files: { tone: "error", text: "ธุรกิจนี้ยังไม่มีชีตหรือโฟลเดอร์ — ติดต่อทีม Aim Expense" },
  no_org: { tone: "error", text: "ไม่พบธุรกิจที่ใช้งานอยู่ — เลือกธุรกิจแล้วลองใหม่อีกครั้ง" },
};

export function FileAccessCard({
  regrantResult,
  regrantHref = "/api/auth/google/regrant",
}: {
  regrantResult?: string;
  /** ลิงก์ที่มี openExternalBrowser=1 + ตั๋ว handoff (สร้างฝั่ง server) */
  regrantHref?: string;
}) {
  const status = trpc.googleAccess.status.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = status.data;
  // GA-09: รหัสที่ไม่รู้จัก → ข้อความ failed (ไม่เงียบ)
  const msg = regrantResult ? (RESULT_MESSAGE[regrantResult] ?? RESULT_MESSAGE.failed) : undefined;

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${data && !data.allOk ? "#fecaca" : "#e2e8f0"}`,
        borderRadius: "0.75rem",
        padding: "1.25rem",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
          🔑 สิทธิ์เข้าถึงชีตและโฟลเดอร์
        </h2>
        {data &&
          (data.allOk ? (
            <span className="app-badge app-badge-success">เข้าถึงได้ครบ</span>
          ) : (
            <span className="app-badge app-badge-error">ต้องยืนยันสิทธิ์</span>
          ))}
      </div>

      {msg && (
        <p
          role="status"
          style={{
            margin: "0 0 0.75rem",
            fontSize: "0.875rem",
            color: msg.tone === "ok" ? "#065f46" : msg.tone === "error" ? "#b91c1c" : "#475569",
          }}
        >
          {msg.tone === "ok" ? "✅ " : msg.tone === "error" ? "⚠️ " : ""}
          {msg.text}
        </p>
      )}

      {status.isLoading && (
        <p style={{ fontSize: "0.875rem", color: "#64748b", margin: 0 }}>กำลังตรวจสอบ…</p>
      )}

      {status.error && (
        <p style={{ fontSize: "0.875rem", color: "#dc2626", margin: 0 }}>
          ⚠️ {status.error.message}
        </p>
      )}

      {data && (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 0.875rem", display: "grid", gap: "0.375rem" }}>
            {data.items.map((item) => {
              const s = STATUS_LABEL[item.status] ?? STATUS_LABEL.no_access;
              return (
                <li
                  key={item.key}
                  style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", fontSize: "0.875rem" }}
                >
                  <span>{item.label}</span>
                  <span style={{ color: s.color, fontWeight: 500 }}>
                    {s.icon} {s.text}
                  </span>
                </li>
              );
            })}
          </ul>

          {!data.allOk && (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
                color: "#7f1d1d",
                lineHeight: 1.7,
                marginBottom: "0.875rem",
              }}
            >
              แอปมองไม่เห็นชีตหรือโฟลเดอร์ของธุรกิจนี้ จึงบันทึกข้อมูลไม่ได้
              {data.isOwner ? (
                // GA-01: 403/404 เกิดได้จากทั้ง "เชื่อม Google ผิดบัญชี" และ "ชีตของระบบเดิม" — ให้เช็คบัญชีก่อน
                <ol style={{ margin: "0.375rem 0 0", paddingLeft: "1.25rem" }}>
                  <li>
                    บัญชี Google ที่เชื่อมอยู่คือ <strong>{data.ownerEmail ?? "—"}</strong> — ถ้า
                    <strong>ไม่ใช่</strong>บัญชีที่ใช้สร้างธุรกิจนี้ ให้กด <strong>&ldquo;เชื่อมต่อใหม่&rdquo;</strong>{" "}
                    ด้านบนแล้วเลือกบัญชีเดิม
                  </li>
                  <li>
                    ถ้าเป็นบัญชีที่ถูกต้องแล้ว กด <strong>&ldquo;ยืนยันสิทธิ์ชีตเดิม&rdquo;</strong> → ระบบจะพาไปหน้า Google
                    ที่แสดงไฟล์ของธุรกิจนี้ → <strong>เลือกทุกรายการ</strong> แล้วกดยืนยัน (ทำได้ทั้งคอม iPad และมือถือ)
                  </li>
                  <li>
                    ถ้าหน้า Google ไม่แสดงไฟล์ ไฟล์อาจถูกลบหรือย้ายไปบัญชีอื่น — ติดต่อทีม Aim Expense
                  </li>
                </ol>
              ) : (
                <>
                  <br />
                  แจ้งเจ้าของธุรกิจ{data.ownerEmail ? ` (${data.ownerEmail})` : ""} ให้เข้ามาที่หน้านี้เพื่อตรวจสอบและแก้ไข
                </>
              )}
            </div>
          )}

          {!data.allOk && data.isOwner && (
            <a href={regrantHref} className="app-btn app-btn-primary">
              🔑 ยืนยันสิทธิ์ชีตเดิม
            </a>
          )}
        </>
      )}
    </section>
  );
}
