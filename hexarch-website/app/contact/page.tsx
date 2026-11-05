import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Contact } from "@/components/home/Contact";
import { Faq } from "@/components/home/Faq";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Hexarch about Momento, investment or partnerships.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        tag="Contact"
        serif="Get in"
        title="touch"
        intro="Questions about Momento, investment or working together. Send a message and we'll reply by email."
      />
      <Contact />
      <Faq />
    </>
  );
}
