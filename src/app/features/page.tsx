import { FeaturesPage, featuresMeta } from "@/components/site/features";

export const dynamic = "force-static";
export const metadata = featuresMeta("th");

export default function Page() {
  return <FeaturesPage lang="th" />;
}
