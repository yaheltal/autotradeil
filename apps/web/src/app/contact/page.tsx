"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * /contact — editorial contact form.
 *
 *   דברו איתנו
 *   ─────
 *   {dek copy}                              ← masthead
 *
 *   שם · אימייל · טלפון · נושא               ← 4-field grid
 *   הודעה (textarea)
 *   [שלח מייל ישירות] [שליחה]                ← form actions
 *
 *   אימייל                  שעות פעילות      ← hairline-separated rows
 *   support@…              א-ה 09-18
 *
 * The server-side /api/v1/contact endpoint isn't shipped yet, so
 * the form composes a mailto: with all fields prefilled — opens the
 * user's native mail client on submit. Once the endpoint exists we
 * can swap the handler without changing the UI.
 *
 * A11y:
 *   - H1 focused on mount
 *   - All inputs labeled, required marked, autoComplete configured
 *   - Form errors live in a role=alert region
 *   - Submit button shows aria-busy while preparing the mailto
 */
const SUPPORT_EMAIL = "support@autotradeil.com";

const TOPICS = [
  "שאלה כללית",
  "בעיה טכנית",
  "שאלה על אימות סוחר",
  "פנייה משפטית / פרטיות",
  "הצעה לשיפור",
] as const;

export default function ContactPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState<string>(TOPICS[0]);
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

    // window.location.href (not window.open) so iOS Safari opens
    // the Mail app correctly.
    window.location.href = mailto;
    setTimeout(() => setBusy(false), 1500);
  };

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <div className="px-md sm:px-lg pb-3xl pt-2xl sm:pt-3xl mx-auto max-w-3xl">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-ink tracking-editorial font-serif text-4xl font-medium leading-tight focus:outline-none sm:text-5xl"
          >
            דברו איתנו
          </h1>
          <div aria-hidden="true" className="bg-hairline mt-lg h-px w-full" />
          <p className="text-muted mt-lg max-w-2xl text-base leading-relaxed sm:text-lg">
            צוות התמיכה זמין ימים א׳-ה׳ בין השעות <span className="font-tabular">09:00–18:00</span>.
            נשתדל לחזור אליך תוך יום עסקים אחד. ניתן לפנות ישירות במייל{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-ink duration-fast decoration-accent hover:text-accent underline decoration-2 underline-offset-4 transition-colors"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            או למלא את הטופס מטה.
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-3xl space-y-lg">
            {error ? (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="gap-lg grid sm:grid-cols-2">
              <div>
                <Label htmlFor="contact-name">
                  שם מלא{" "}
                  <span aria-hidden="true" className="text-danger-fg">
                    *
                  </span>
                </Label>
                <Input
                  id="contact-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-xs"
                />
              </div>
              <div>
                <Label htmlFor="contact-email">
                  אימייל{" "}
                  <span aria-hidden="true" className="text-danger-fg">
                    *
                  </span>
                </Label>
                <Input
                  id="contact-email"
                  type="email"
                  required
                  autoComplete="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-xs"
                />
              </div>
              <div>
                <Label htmlFor="contact-phone">
                  טלפון <span className="text-muted text-xs">(אופציונלי)</span>
                </Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  autoComplete="tel"
                  dir="ltr"
                  inputMode="tel"
                  placeholder="052-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-xs"
                />
              </div>
              <div>
                <Label htmlFor="contact-topic">נושא הפנייה</Label>
                <Select value={topic} onValueChange={setTopic}>
                  <SelectTrigger id="contact-topic" className="mt-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOPICS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="contact-message">
                הודעה{" "}
                <span aria-hidden="true" className="text-danger-fg">
                  *
                </span>
              </Label>
              <Textarea
                id="contact-message"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-xs"
              />
              <p className="text-muted mt-xs text-xs">
                בלחיצה על שליחה ייפתח אצלך אפליקציית המייל עם כל הפרטים מוכנים.
              </p>
            </div>

            <div className="gap-sm flex flex-col-reverse sm:flex-row sm:justify-end">
              <Button asChild variant="outline">
                <a href={`mailto:${SUPPORT_EMAIL}`}>שלח מייל ישירות</a>
              </Button>
              <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
                {busy ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    <span>פותח אפליקציית מייל…</span>
                  </>
                ) : (
                  "שליחה"
                )}
              </Button>
            </div>
          </form>

          {/* Quick contact alternatives — hairline rows, not bordered cards */}
          <section aria-labelledby="alts-heading" className="mt-3xl">
            <p className="text-muted text-xs font-medium uppercase tracking-widest">
              ערוצים נוספים
            </p>
            <h2 id="alts-heading" className="sr-only">
              ערוצי תמיכה נוספים
            </h2>
            <div aria-hidden="true" className="bg-hairline mt-sm h-px w-full" />

            <dl className="mt-lg gap-y-md sm:gap-x-2xl grid sm:grid-cols-2">
              <div>
                <dt className="text-muted text-xs font-medium uppercase tracking-widest">אימייל</dt>
                <dd className="mt-xs">
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-ink duration-fast decoration-accent hover:text-accent break-all text-base font-medium underline decoration-2 underline-offset-4 transition-colors"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-muted text-xs font-medium uppercase tracking-widest">
                  שעות פעילות
                </dt>
                <dd className="text-ink mt-xs text-base font-medium">
                  <span className="font-tabular">א׳–ה׳ · 09:00–18:00</span>
                  <span className="text-muted mt-xxs block text-sm font-normal">
                    מענה תוך יום עסקים אחד
                  </span>
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
