"use client";

import { useState, useSyncExternalStore } from "react";
import { Roll } from "@/components/motion/motion";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/**
 * Opens the visitor's email app with the message filled in.
 * TODO: switch to a form service (for example Formspree or a Next.js server action) once one is chosen.
 */
export function ContactForm({ topics, email }: { topics: string[]; email: string }) {
  const [picked, setTopic] = useState<string | null>(null);
  // /contact#investors (used by the investors page) preselects that topic.
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const investorTopic = topics.find((t) => t.toLowerCase().includes("investor"));
  const topic = picked ?? (hash === "#investors" && investorTopic ? investorTopic : topics[0]);

  const field =
    "mt-2 w-full border-b border-line bg-transparent pb-3 text-[16px] text-white placeholder:text-white/30 transition-colors duration-300 focus:border-white focus:outline-none";

  return (
    <form
      className="mt-10 grid gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const subject = `${topic}: message from ${data.get("name")}`;
        const body = `${data.get("message")}\n\n${data.get("name")}\n${data.get("email")}`;
        window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }}
    >
      <label className="block text-[14px] font-medium text-soft">
        Your name
        <input name="name" required autoComplete="name" placeholder="Enter your full name" className={field} />
      </label>
      <label className="block text-[14px] font-medium text-soft">
        Your email
        <input name="email" type="email" required autoComplete="email" placeholder="Enter your email" className={field} />
      </label>
      <fieldset>
        <legend className="text-[14px] font-medium text-soft">Topic</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {topics.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={topic === t}
              onClick={() => setTopic(t)}
              className={`rounded-full border px-4 py-2 text-[14px] transition-colors duration-300 ${
                topic === t ? "border-white bg-white text-black" : "border-line text-soft hover:border-white/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-[14px] font-medium text-soft">
        Your message
        <textarea name="message" required rows={4} placeholder="Tell us a little about it" className={`${field} resize-none`} />
      </label>
      <div>
        <button type="submit" className="group flex h-[54px] w-full items-center justify-center rounded-full bg-white text-[16px] font-semibold text-[#1b1b1b] transition-transform duration-500 ease-out-expo hover:scale-[1.01]">
          <Roll>Send message</Roll>
        </button>
        <p className="mt-3 text-center text-[13px] text-muted">This opens your email app with the message ready to send.</p>
      </div>
    </form>
  );
}
