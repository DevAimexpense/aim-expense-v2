import { FaqPage, faqMeta } from "@/components/site/faq";

export const dynamic = "force-static";
export const metadata = faqMeta("th");

export default function Page() {
  return <FaqPage lang="th" />;
}
