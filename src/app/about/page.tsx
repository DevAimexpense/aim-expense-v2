import { AboutPage, aboutMeta } from "@/components/site/about";

export const dynamic = "force-static";
export const metadata = aboutMeta("th");

export default function Page() {
  return <AboutPage lang="th" />;
}
