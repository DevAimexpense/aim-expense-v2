import { FeaturesPage, featuresMeta } from "@/components/site/features";

export const dynamic = "force-static";
export const metadata = featuresMeta("en");

export default function Page() {
  return <FeaturesPage lang="en" />;
}
