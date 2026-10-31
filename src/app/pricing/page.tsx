import { PricingPage, pricingMeta } from "@/components/site/pricing";

export const dynamic = "force-static";
export const metadata = pricingMeta("th");

export default function Page() {
  return <PricingPage lang="th" />;
}
