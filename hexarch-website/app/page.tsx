import { Hero } from "@/components/home/Hero";
import { Build } from "@/components/home/Build";
import { About } from "@/components/home/About";
import { Products } from "@/components/home/Products";
import { Process } from "@/components/home/Process";
import { Milestones } from "@/components/home/Milestones";
import { Team } from "@/components/home/Team";
import { Plans, Testimonials } from "@/components/home/HiddenSlots";
import { Faq } from "@/components/home/Faq";
import { Contact } from "@/components/home/Contact";

/**
 * Home page: the reference template's 15 sections in its exact order.
 * 1 Hero, 2 Logo strip, 3 What we do, 4 Featured (all inside <Hero />)
 * 5 Four cards, 6 About, 7 Products, 8 Process, 9 Milestones, 10 Team,
 * 11 Plans (hidden), 12 Testimonials (hidden), 13 FAQ, 14 Contact, 15 Footer (in the layout)
 */
export default function Home() {
  return (
    <>
      <Hero />
      <Build />
      <About />
      <Products />
      <Process />
      <Milestones />
      <Team />
      <Plans />
      <Testimonials />
      <Faq />
      <Contact />
    </>
  );
}
