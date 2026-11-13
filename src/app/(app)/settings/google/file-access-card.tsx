"use client";

// ===========================================
// การ์ด "สิทธิ์เข้าถึงชีตและโฟลเดอร์เดิม" — หน้า ตั้งค่า › เชื่อมต่อ Google
//
// org ที่สร้างก่อนย้าย Google client (2026-07-09) แอปมองไม่เห็นชีต/โฟลเดอร์เดิม
// (scope drive.file ผูกไฟล์กับ client ที่สร้าง) ทั้งที่ token ยังดี — เจ้าของกด
// "ยืนยันสิทธิ์ชีตเดิม" → Google Picker แสดงเฉพาะไฟล์ของ org นี้ (setFileIds) →
// เลือกทุกรายการ → Google มอบสิทธิ์ไฟล์ให้แอปอีกครั้ง ข้อมูลเดิมใช้ต่อได้ครบ
// ===========================================

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let pickerLoad: Promise<void> | null = null;

/** โหลด Google API loader + library picker ครั้งเดียวต่อหน้า */
function loadPicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (pickerLoad) return pickerLoad;
  pickerLoad = new Promise<void>((resolve, reject) => {
    const done = () => window.gapi.load("picker", { callback: () => resolve(), onerror: () => reject(new Error("โหลด Google Picker ไม่สำเร็จ")) });
    if (window.gapi) return done();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error("โหลด Google Picker ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"));
    document.head.appendChild(s);
  }).catch((e) => {
    pickerLoad = null;
    throw e;
  });
  return pickerLoad;
}

type PickerConfig = {
  accessToken: string;
  developerKey: string;
  appId: string;
  fileIds: string[];
};

/** เปิด Picker แล้วคืน true เมื่อผู้ใช้กดเลือก / false เมื่อปิดหรือยกเลิก */
function openPicker(cfg: PickerConfig): Promise<boolean> {
  return new Promise((resolve) => {
    const g = window.google.picker;
    const view = new g.DocsView(g.ViewId.DOCS)
      .setFileIds(cfg.fileIds.join(","))
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMode(g.DocsViewMode.LIST);
    const picker = new g.PickerBuilder()
      .addView(view)
      .enableFeature(g.Feature.MULTISELECT_ENABLED)
      .enableFeature(g.Feature.NAV_HIDDEN)
      .setOAuthToken(cfg.accessToken)
      .setDeveloperKey(cfg.developerKey)
      .setAppId(cfg.appId)
      .setOrigin(window.location.origin)
      .setLocale("th")
      .setTitle("เลือกทุกรายการ (ชีต + โฟลเดอร์) แล้วกด Select")
      .setCallback((data: any) => {
        const action = data?.[g.Response.ACTION];
        if (action === g.Action.PICKED) resolve(true);
        else if (action === g.Action.CANCEL) resolve(false);
      })
      .build();
    picker.setVisible(true);
  });
}

const STATUS_LABEL: Record<string, { text: string; color: string; icon: string }> = {
  ok: { text: "เข้าถึงได้", color: "#16a34a", icon: "✓" },
  no_access: { text: "แอปเข้าถึงไม่ได้", color: "#dc2626", icon: "✗" },
  trashed: { text: "อยู่ในถังขยะ Google Drive", color: "#d97706", icon: "!" },
  missing_id: { text: "ไม่มี (ใช้โฟลเดอร์หลักแทน)", color: "#94a3b8", icon: "–" },
};

export function FileAccessCard() {
  const utils = trpc.useUtils();
  const status = trpc.googleAccess.status.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const pickerConfig = trpc.googleAccess.pickerConfig.useMutation();
  const confirm = trpc.googleAccess.confirmRegrant.useMutation();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  async function handleRegrant() {
    setBusy(true);
    setMsg(null);
    try {
      const cfg = await pickerConfig.mutateAsync();
      await loadPicker();
      const picked = await openPicker(cfg);
      if (!picked) {
        setMsg({ tone: "info", text: "ยกเลิกแล้ว — ยังไม่ได้ยืนยันสิทธิ์" });
        return;
      }
      const result = await confirm.mutateAsync();
      utils.googleAccess.status.setData(undefined, result);
      setMsg(
        result.allOk
          ? { tone: "ok", text: "ยืนยันสิทธิ์สำเร็จ — ใช้งานชีตและโฟลเดอร์เดิมได้ตามปกติแล้ว" }
          : {
              tone: "error",
              text: "ยังเข้าถึงไม่ครบ — กดอีกครั้งแล้วเลือกให้ครบทุกรายการ (ติ๊กทุกแถว) ก่อนกด Select",
            },
      );
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }

  const data = status.data;

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
                    ถ้าเป็นบัญชีที่ถูกต้องแล้ว กด <strong>&ldquo;ยืนยันสิทธิ์ชีตเดิม&rdquo;</strong> → หน้าต่าง Google
                    จะแสดงไฟล์ของธุรกิจนี้ → <strong>ติ๊กเลือกทุกรายการ</strong> แล้วกด <strong>Select</strong>{" "}
                    (ล็อกอินบัญชีเดียวกันนี้ในเบราว์เซอร์ แนะนำ Chrome บนคอมพิวเตอร์)
                  </li>
                  <li>
                    ถ้าหน้าต่าง Google ไม่แสดงไฟล์ ไฟล์อาจถูกลบหรือย้ายไปบัญชีอื่น — ติดต่อทีม Aim Expense
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
            <button
              type="button"
              className="app-btn app-btn-primary"
              onClick={handleRegrant}
              disabled={busy || !data.pickerConfigured}
            >
              {busy ? "กำลังเปิดหน้าต่าง Google…" : "🔑 ยืนยันสิทธิ์ชีตเดิม"}
            </button>
          )}
          {!data.allOk && data.isOwner && !data.pickerConfigured && (
            <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "0.5rem 0 0" }}>
              ระบบยังไม่ได้เปิดใช้ Google Picker — กรุณาติดต่อทีม Aim Expense
            </p>
          )}
        </>
      )}

      {msg && (
        <p
          role="status"
          style={{
            margin: "0.75rem 0 0",
            fontSize: "0.875rem",
            color: msg.tone === "ok" ? "#065f46" : msg.tone === "error" ? "#b91c1c" : "#475569",
          }}
        >
          {msg.tone === "ok" ? "✅ " : msg.tone === "error" ? "⚠️ " : ""}
          {msg.text}
        </p>
      )}
    </section>
  );
}
