// ===========================================
// ขอบเขตการมองเห็นเอกสาร (ใบเสนอราคา / ใบวางบิล / ใบเสร็จ / ใบกำกับภาษี / 50 ทวิ) — CO-07b
// - บทบาททั่วไป: เห็นทุกเอกสารของ org
// - project_manager: เห็นเฉพาะเอกสารของโปรเจกต์ในขอบเขต (eventScope) **หรือ** เอกสารที่ตัวเองสร้าง
//   (PreparedByUserId / CreatedByUserId) — ไม่เช่นนั้น PM ที่ออกเอกสารโดยไม่เลือกโปรเจกต์ (EventID ว่าง)
//   จะมองไม่เห็นเอกสารของตัวเอง
// ใช้กฎเดียวกันทั้ง tRPC list/getById, หน้า /documents/*/[id] และ /api/documents/wht-cert
// ===========================================

import { scopedEventIds } from "@/lib/permissions";

export function isDocInScope(
  org: { role: string; eventScope: string[] } | null | undefined,
  userId: string,
  eventId: string | undefined | null,
  ownerUserId: string | undefined | null,
): boolean {
  const scope = scopedEventIds(org);
  if (scope === null) return true;
  if (scope.includes((eventId || "").trim())) return true;
  return !!ownerUserId && ownerUserId === userId;
}
