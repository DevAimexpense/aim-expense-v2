import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const runtime = "nodejs";
export const alt = "Aim Expense — Thai SME accounting and tax, done inside LINE";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage("en");
}
