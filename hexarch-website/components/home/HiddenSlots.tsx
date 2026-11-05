import { site } from "@/content/site";
import { Reveal, ScrollZoom } from "@/components/motion/motion";
import { SectionHeading } from "@/components/home/parts";

/**
 * Slots 11 and 12 of the template order. Both stay hidden until real content exists in
 * content/site.ts: pricing lives on each product's own site, and testimonials need real
 * quotes used with permission.
 */
export function Plans() {
  if (site.plans.length === 0) return null;
  return (
    <section id="plans" className="py-[100px]">
      <div className="container-x">
        <SectionHeading tag="Plans" rest="Plans" center />
        <ul className="mt-16 grid gap-4 lg:grid-cols-3">
          {site.plans.map((plan, i) => (
            <Reveal as="li" key={plan.name} delay={i * 0.1} className="rounded-card border border-line bg-card p-8">
              <h3 className="text-[24px] font-medium">{plan.name}</h3>
              <p className="mt-6 text-[40px] font-medium tracking-[-0.03em]">{plan.price}</p>
              <ul className="mt-6 grid gap-3 text-muted">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Testimonials() {
  if (site.testimonials.length === 0) return null;
  return (
    <section id="testimonials" className="py-[100px]">
      <div className="container-x">
        <SectionHeading tag="Testimonials" rest="What people say" center />
        <ul className="mt-16 grid gap-4 md:grid-cols-2">
          {site.testimonials.map((t) => (
            <li key={t.name}>
              <ScrollZoom from={0.6}>
                <figure className="rounded-card border border-line bg-card p-8">
                  <blockquote className="text-[18px] leading-7">&ldquo;{t.quote}&rdquo;</blockquote>
                  <figcaption className="mt-6 text-[14px] text-muted">
                    {t.name}, {t.role}
                  </figcaption>
                </figure>
              </ScrollZoom>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
