import { PricingPage, pricingMeta } from "@/components/site/pricing";

export const dynamic = "force-static";
export const metadata = pricingMeta("en");

export default function Page() {
  return <PricingPage lang="en" />;
}
