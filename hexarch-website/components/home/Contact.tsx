import { site } from "@/content/site";
import { Reveal } from "@/components/motion/motion";
import { WaveLines } from "@/components/graphics/Graphics";
import { ContactForm } from "@/components/home/ContactForm";

/** Slot 14: contact. */
export function Contact() {
  const { contact } = site;
  return (
    <section id="contact" className="scroll-mt-24 bg-black pb-[20px]">
      <div className="px-6 max-md:px-3">
        <div className="grid gap-4 lg:grid-cols-2">
          <Reveal y={60} className="relative isolate flex min-h-[600px] flex-col justify-end overflow-hidden rounded-[40px] border border-line bg-[#0a0a0a] p-12 max-md:min-h-[420px] max-md:rounded-[32px] max-md:p-7">
            <WaveLines className="absolute inset-0 -z-10 opacity-90" />
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_30%_100%,rgba(255,255,255,0.08),transparent_70%)]" />
            <h2>
              <span className="block text-[clamp(44px,4.45vw,64px)] leading-[1.1] font-medium tracking-[-0.03em]">{contact.titleLead}</span>
              <span className="block font-serif text-[clamp(44px,4.45vw,64px)] leading-[1.1] tracking-[-0.03em] text-white/80 italic">{contact.titleSerif}</span>
            </h2>
          </Reveal>
          <Reveal y={60} delay={0.1} className="rounded-[40px] border border-line bg-[#0a0a0a] p-12 max-md:rounded-[32px] max-md:p-7">
            <h3 className="text-[24px] font-medium tracking-[-0.02em]">{contact.formTitle}</h3>
            <ContactForm topics={contact.topics} email={site.company.email} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
