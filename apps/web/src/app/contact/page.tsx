"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/**
 * Contact page. Server-side contact endpoint isn't shipped yet, so the
 * form composes a mailto: with all fields prefilled — opens the user's
 * native mail client on submit. Once a /api/v1/contact endpoint exists
 * we can swap the handler without changing the UI.
 *
 * A11y:
 *   - H1 focused on mount
 *   - All inputs labeled, required marked, autoComplete configured
 *   - Form errors live in a role=alert region
 *   - Submit button shows aria-busy while preparing the mailto
 */
const SUPPORT_EMAIL = "support@autotradeil.com";

export default function ContactPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("שאלה כללית");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("יש למלא לפחות שם, אימייל והודעה.");
      return;
    }
    setBusy(true);
    setError(null);

    const subject = `[פנייה: ${topic}] ${name.trim()}`;
    const body = [
      `שם: ${name.trim()}`,
      `אימייל: ${email.trim()}`,
      phone.trim() ? `טלפון: ${phone.trim()}` : null,
      `נושא: ${topic}`,
      "",
      "הודעה:",
      message.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;

    // Open the user's mail client. window.location.href is used (not
    // window.open) so iOS Safari opens the Mail app correctly.
    window.location.href = mailto;
    // Don't reset busy — we want the button disabled while the mail
    // client takes over. If the user comes back, refreshing resets state.
    setTimeout(() => setBusy(false), 1500);
  };

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-3xl px-4 pb-20 pt-12 sm:px-6 sm:pb-28 sm:pt-20">
          <p className="text-brand-navy/70 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
            <span aria-hidden="true" className="bg-brand-gold inline-block h-px w-8" />
            יצירת קשר
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-brand-navy mt-5 font-serif text-[2rem] font-bold leading-[1.15] tracking-tight focus:outline-none sm:text-5xl"
          >
            דברו איתנו
          </h1>
          <p className="text-brand-ink/80 mt-5 max-w-2xl text-base leading-relaxed sm:text-lg">
            צוות התמיכה שלנו זמין ימים א׳-ה׳ בין השעות 09:00-18:00. נשתדל לחזור אליך תוך יום עסקים
            אחד. ניתן לפנות אלינו ישירות במייל{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-brand-navy decoration-brand-gold underline decoration-2 underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            או למלא את הטופס מטה.
          </p>

          <form
            onSubmit={onSubmit}
            noValidate
            className="border-brand-navy/15 mt-10 rounded-2xl border bg-white p-5 shadow-sm sm:p-8"
          >
            {error ? (
              <div
                role="alert"
                className="bg-danger-bg text-danger-text mb-5 rounded-md px-4 py-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className="text-brand-navy block text-sm font-medium">
                  שם מלא <span aria-hidden="true">*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-email"
                  className="text-brand-navy block text-sm font-medium"
                >
                  אימייל <span aria-hidden="true">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  autoComplete="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-phone"
                  className="text-brand-navy block text-sm font-medium"
                >
                  טלפון <span className="text-brand-ink/60 text-xs">(אופציונלי)</span>
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  autoComplete="tel"
                  dir="ltr"
                  inputMode="tel"
                  placeholder="052-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-topic"
                  className="text-brand-navy block text-sm font-medium"
                >
                  נושא הפנייה
                </label>
                <select
                  id="contact-topic"
                  dir="rtl"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block min-h-[44px] w-full rounded-md border bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <option>שאלה כללית</option>
                  <option>בעיה טכנית</option>
                  <option>שאלה על אימות סוחר</option>
                  <option>פנייה משפטית / פרטיות</option>
                  <option>הצעה לשיפור</option>
                </select>
              </div>
            </div>

            <div className="mt-5">
              <label
                htmlFor="contact-message"
                className="text-brand-navy block text-sm font-medium"
              >
                הודעה <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="contact-message"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="border-brand-navy/20 text-brand-ink focus-visible:outline-brand-navy mt-2 block w-full resize-y rounded-md border bg-white px-3 py-2 text-base leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              <p className="text-brand-ink/60 mt-2 text-xs">
                בלחיצה על שליחה ייפתח אצלך אפליקציית המייל עם כל הפרטים מוכנים.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 focus-visible:outline-brand-navy inline-flex min-h-[44px] items-center justify-center rounded-md border bg-white px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                שלח מייל ישירות
              </a>
              <button
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className="bg-brand-navy text-brand-cream hover:bg-brand-navy/90 focus-visible:outline-brand-navy inline-flex min-h-[44px] items-center justify-center rounded-md px-6 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
              >
                {busy ? "פותח אפליקציית מייל…" : "שליחה"}
              </button>
            </div>
          </form>

          {/* Quick contact alternatives below the form */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="border-brand-navy/15 rounded-lg border bg-white p-5">
              <p className="text-brand-gold text-xs font-semibold uppercase tracking-[0.18em]">
                אימייל
              </p>
              <p className="text-brand-navy mt-2 font-serif text-lg font-bold">תמיכה כללית</p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-brand-navy decoration-brand-gold mt-1 inline-block break-all text-sm underline decoration-2 underline-offset-4"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
            <div className="border-brand-navy/15 rounded-lg border bg-white p-5">
              <p className="text-brand-gold text-xs font-semibold uppercase tracking-[0.18em]">
                שעות פעילות
              </p>
              <p className="text-brand-navy mt-2 font-serif text-lg font-bold">תמיכה אנושית</p>
              <p className="text-brand-ink/85 mt-1 text-sm leading-relaxed">
                ימים א׳-ה׳ · 09:00-18:00
                <br />
                מענה תוך יום עסקים אחד.
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
