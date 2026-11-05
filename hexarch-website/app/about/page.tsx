import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { About } from "@/components/home/About";
import { Process } from "@/components/home/Process";
import { Milestones } from "@/components/home/Milestones";
import { Team } from "@/components/home/Team";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "About",
  description: site.company.description,
};

export default function AboutPage() {
  return (
    <>
      <PageHero tag="About" serif="Who" title="we are" intro={site.company.description} />
      <About />
      <Process />
      <Milestones />
      <Team />
    </>
  );
}
