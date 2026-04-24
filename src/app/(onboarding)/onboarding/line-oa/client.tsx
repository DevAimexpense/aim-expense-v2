"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function LineOaClient({ oaBasicId }: { oaBasicId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  // Polling state
  const [isFollowing, setIsFollowing] = useState(false);
  const [justDetected, setJustDetected] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const basicId = oaBasicId.replace(/^@/, "");
  const addFriendUrl = basicId ? `https://line.me/R/ti/p/@${basicId}` : null;
  const qrApiUrl = basicId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        addFriendUrl!
      )}`
    : null;

  // Poll every 3 seconds to check follow status
  useEffect(() => {
    if (isFollowing) return; // stop polling once confirmed

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/onboarding/line-oa-status", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.isFollowingOA) {
          setIsFollowing(true);
          setJustDetected(true);
          // stop polling
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (e) {
        // Silent fail — just keep polling
      }
    };

    // Check immediately, then every 3s
    checkStatus();
    pollRef.current = setInterval(checkStatus, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isFollowing]);

  const handleContinue = async () => {
    if (!isFollowing) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/confirm-line-oa", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "เกิดข้อผิดพลาด");
      }
      // ถ้า user ถูกเชิญมาแล้ว (มี org) → ไป /select-org ไม่ต้องทำ google/company
      // ถ้าไม่มี org → ทำ onboarding ปกติต่อ (google → company)
      const meRes = await fetch("/api/auth/me");
      const me = meRes.ok ? await meRes.json() : null;
      const orgsRes = await fetch("/api/trpc/org.mine?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%2C%22v%22%3A1%7D%7D%7D");
      let hasOrg = false;
      try {
        const data = await orgsRes.json();
        const list = data?.[0]?.result?.data?.json ?? [];
        hasOrg = Array.isArray(list) && list.length > 0;
      } catch { /* fallback */ }
      void me;
      router.push(hasOrg ? "/select-org" : "/onboarding/google");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setIsLoading(false);
    }
  };

  return (
    <div className="onb-step-wrap">
      <div className="onb-card">
        <div style={{ marginBottom: "1.5rem" }}>
          <div className="onb-step-pill green">
            <span className="dot" />
            ขั้นตอนที่ 2 จาก 4
          </div>
          <h1 className="onb-title">เพิ่ม LINE OA เป็นเพื่อน</h1>
          <p className="onb-subtitle">
            เพื่อรับการแจ้งเตือน ส่งใบเสร็จผ่าน LINE และจัดการ subscription
          </p>
        </div>

        {/* Status banner */}
        {isFollowing ? (
          <div className="onb-status-success">
            <div className="onb-status-icon-success">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="onb-status-title">เพิ่มเพื่อนสำเร็จแล้ว!</p>
              <p className="onb-status-desc">พร้อมไปขั้นต่อไปแล้ว — กดปุ่มด้านล่าง</p>
            </div>
          </div>
        ) : (
          <div className="onb-status-waiting">
            <div className="onb-status-icon-waiting">
              <div className="onb-spinner-small" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="onb-status-title">กำลังรอคุณเพิ่มเพื่อน...</p>
              <p className="onb-status-desc">
                ระบบจะตรวจสอบอัตโนมัติเมื่อคุณเพิ่ม LINE OA เป็นเพื่อน
              </p>
            </div>
          </div>
        )}

        {/* ============ MOBILE VIEW: Big button first, QR optional ============ */}
        <div className="onb-show-mobile" style={{ flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
          <div className="onb-mobile-cta">
            <p className="onb-mobile-cta-title">กดปุ่มเพื่อเปิด LINE app</p>
            <p className="onb-mobile-cta-desc">
              ระบบจะเปิดแอป LINE ในเครื่องคุณและพาไปยังหน้าเพิ่มเพื่อน
            </p>
            {addFriendUrl && (
              <a
                href={addFriendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="onb-btn-line-big"
              >
                <LineIcon />
                เปิด LINE เพิ่มเพื่อน
              </a>
            )}
          </div>

          <button
            onClick={() => setShowQr((v) => !v)}
            className="onb-qr-toggle"
            type="button"
          >
            {showQr ? "▲ ซ่อน QR code" : "▼ แสดง QR code (สำหรับสแกนจากเครื่องอื่น)"}
          </button>

          {showQr && qrApiUrl && (
            <div className="onb-qr-box">
              <div className="onb-qr-img-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrApiUrl} alt="QR code" className="onb-qr-img" />
              </div>
              <p className="onb-caption">สแกน QR ด้วยแอป LINE จากเครื่องอื่น</p>
            </div>
          )}

          <div className="onb-oa-id">
            <div className="onb-oa-id-label">LINE Official Account ID</div>
            <div className="onb-oa-id-value">{oaBasicId || "—"}</div>
          </div>
        </div>

        {/* ============ DESKTOP VIEW ============ */}
        <div className="onb-qr-grid onb-show-desktop">
          <div className="onb-qr-box">
            {qrApiUrl ? (
              <>
                <div className="onb-qr-img-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrApiUrl}
                    alt="QR code สำหรับเพิ่มเพื่อน LINE OA"
                    className="onb-qr-img"
                  />
                </div>
                <p className="onb-caption">สแกน QR ด้วยแอป LINE</p>
              </>
            ) : (
              <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
                ไม่พบการตั้งค่า LINE OA
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.75rem" }}>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0f172a", margin: 0 }}>
                หรือเปิดในมือถือ
              </p>
              <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>
                กดปุ่มด้านล่างเพื่อเปิดแอป LINE บนมือถือ
              </p>
              {addFriendUrl && (
                <a
                  href={addFriendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="onb-btn-line"
                  style={{ marginTop: "0.75rem" }}
                >
                  <LineIcon />
                  เปิด LINE เพื่อเพิ่มเพื่อน
                </a>
              )}
            </div>

            <div className="onb-oa-id">
              <div className="onb-oa-id-label">LINE Official Account ID</div>
              <div className="onb-oa-id-value">{oaBasicId || "—"}</div>
            </div>
          </div>
        </div>

        <hr className="onb-divider" />

        <div>
          {error && <div className="onb-error">{error}</div>}
          <button
            onClick={handleContinue}
            disabled={!isFollowing || isLoading}
            className="onb-btn-primary"
          >
            {isLoading ? (
              <>
                <div className="onb-spinner-button" />
                <span>กำลังดำเนินการ...</span>
              </>
            ) : isFollowing ? (
              <>
                <span>ไปต่อ ขั้นตอนเชื่อม Google</span>
                <ArrowRightIcon />
              </>
            ) : (
              <>
                <div className="onb-spinner-button" />
                <span>รอคุณเพิ่มเพื่อน...</span>
              </>
            )}
          </button>
        </div>
      </div>

      <p style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.75rem", color: "#94a3b8" }}>
        {justDetected
          ? "🎉 ระบบตรวจจับได้แล้ว กดปุ่มด้านบนเพื่อไปต่อ"
          : "ถ้าคุณยังไม่เพิ่มเพื่อน ระบบจะไม่สามารถส่งการแจ้งเตือนให้คุณได้"}
      </p>
    </div>
  );
}

function LineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}
