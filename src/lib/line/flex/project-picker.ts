// ===========================================
// LINE Flex Carousel — Project Picker
// Replaces the old text + Quick Reply UX so users see project cards
// they can swipe through (max 12 per LINE spec).
// ===========================================

import type { LineFlexMessage } from "@/lib/line/messaging";

export interface ProjectPickerItem {
  eventId: string;
  eventName: string;
}

/** Build a single bubble for one project. */
function buildProjectBubble(
  draftId: string,
  project: ProjectPickerItem,
): Record<string, unknown> {
  const safeName = (project.eventName || "ไม่ระบุ").slice(0, 80); // Flex text safe

  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: "โปรเจกต์",
          size: "xxs",
          color: "#888888",
        },
        {
          type: "text",
          text: safeName,
          size: "md",
          weight: "bold",
          color: "#111111",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#4F46E5",
          height: "sm",
          action: {
            type: "postback",
            label: "เลือก",
            // Postback data length limit is 300 chars; we keep it minimal.
            data: `action=select_project&id=${draftId}&eventId=${project.eventId}` +
              `&eventName=${encodeURIComponent(safeName.slice(0, 50))}`,
            displayText: `เลือก: ${safeName.slice(0, 30)}`,
          },
        },
      ],
    },
  };
}

/**
 * Build the project-picker carousel (max 12 projects per LINE spec).
 * Caller MUST ensure projects.length >= 1 — handler decides the empty branch.
 */
export function buildProjectPickerCarousel(
  draftId: string,
  projects: ProjectPickerItem[],
): LineFlexMessage {
  const limited = projects.slice(0, 12);
  return {
    type: "flex",
    altText: `เลือกโปรเจกต์ (${limited.length} รายการ)`,
    contents: {
      type: "carousel",
      contents: limited.map((p) => buildProjectBubble(draftId, p)),
    },
  };
}
