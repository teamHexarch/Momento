import { site } from "@/content/site";
import { Reveal } from "@/components/motion/motion";
import { SectionHeading } from "@/components/home/parts";
import { TeamCarousel } from "@/components/home/TeamCarousel";

const listJoin = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

const numberWords = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Slot 10: team. Only real people; photos go in public/team/. */
export function Team() {
  const { team } = site;
  if (team.members.length === 0) return null;
  const countries = [...new Set(team.members.map((m) => m.country).filter(Boolean))];
  const count = numberWords[team.members.length] ?? String(team.members.length);
  const lead = count.charAt(0).toUpperCase() + count.slice(1);
  return (
    <section id="team" className="pb-[60px]">
      <div className="rounded-b-[56px] bg-[linear-gradient(180deg,#000_0%,#0d0d0d_100%)] pt-[60px] pb-[100px] max-md:rounded-b-[32px]">
        <div className="container-x">
          <SectionHeading tag={team.tag} serif={team.titleSerif} rest={team.titleLead} serifFirst={false} center />
          {countries.length > 0 && (
            <Reveal delay={0.2} className="mx-auto mt-6 max-w-[560px] text-center text-[18px] leading-7 text-muted">
              <p>
                {lead} of us, from {listJoin(countries)}, building in Melbourne.
              </p>
            </Reveal>
          )}
          <TeamCarousel members={team.members} />
        </div>
      </div>
    </section>
  );
}
