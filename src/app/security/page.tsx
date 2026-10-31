import { SecurityPage, securityMeta } from "@/components/site/security";

export const dynamic = "force-static";
export const metadata = securityMeta("th");

export default function Page() {
  return <SecurityPage lang="th" />;
}
