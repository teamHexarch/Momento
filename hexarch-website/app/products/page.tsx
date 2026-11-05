import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Products } from "@/components/home/Products";
import { Contact } from "@/components/home/Contact";

export const metadata: Metadata = {
  title: "Products",
  description: "The products Hexarch builds and runs, starting with Momento.",
};

export default function ProductsPage() {
  return (
    <>
      <PageHero
        tag="Products"
        serif="Our"
        title="Products"
        intro="Hexarch builds and runs its own products. Each one starts with a real problem people have when they get together."
      />
      <Products showAllLink={false} />
      <div className="h-[60px]" />
      <Contact />
    </>
  );
}
