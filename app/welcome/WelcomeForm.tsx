"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ONBOARDING_QUESTION_COUNT, ONBOARDING_SECTIONS, UPLOAD_TYPES, type OnboardingAnswers } from "@/lib/onboarding";
import { finishUpload, removeUpload, saveOnboarding, startUpload } from "@/app/welcome/actions";

type UploadedFile = { id: string; filename: string; kind: string; preview: string | null };
type Pending = { key: string; name: string; kind: string; state: "uploading" | "failed"; error?: string };

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-3 py-2.5 text-base text-ink outline-none transition-colors focus:border-brand sm:text-sm";
const card = "mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm sm:p-6";
const ACCEPT = Object.keys(UPLOAD_TYPES).join(",");

export function WelcomeForm(props: {
  id: string;
  token: string;
  initialAnswers: OnboardingAnswers;
  initialFiles: UploadedFile[];
  submittedAt: string | null;
}) {
  const { id, token } = props;
  const [answers, setAnswers] = useState<OnboardingAnswers>(props.initialAnswers);
  const [files, setFiles] = useState<UploadedFile[]>(props.initialFiles);
  const [pending, setPending] = useState<Pending[]>([]);
  const [status, setStatus] = useState<string>("");
  const [submitted, setSubmitted] = useState(Boolean(props.submittedAt));
  const [isPending, startTransition] = useTransition();
  // One section at a time - 25 questions on one phone screen is where people give up.
  // Steps: each question section, then photos, then check-and-send (where a returning client lands).
  const photoStep = ONBOARDING_SECTIONS.length;
  const lastStep = photoStep + 1;
  const [step, setStep] = useState(props.submittedAt ? lastStep : 0);
  const top = useRef<HTMLDivElement>(null);
  const go = (to: number) => {
    setStep(Math.max(0, Math.min(lastStep, to)));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const dirty = useRef(false);
  const uploadSeq = useRef(0);

  // Saves quietly a moment after they stop typing, so closing the tab loses nothing.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      const res = await saveOnboarding(id, token, answers, false);
      setStatus(res.ok ? "Saved" : res.error ?? "Couldn't save");
    }, 1200);
    return () => clearTimeout(t);
  }, [answers, id, token]);

  const set = (key: string, value: string) => {
    dirty.current = true;
    setStatus("");
    setAnswers((a) => ({ ...a, [key]: value }));
  };

  async function upload(list: FileList | null, kind: string) {
    if (!list) return;
    const supabase = createClient();
    for (const file of Array.from(list)) {
      const key = `${file.name}-${(uploadSeq.current += 1)}`;
      setPending((p) => [...p, { key, name: file.name, kind, state: "uploading" }]);
      const fail = (error: string) =>
        setPending((p) => p.map((x) => (x.key === key ? { ...x, state: "failed", error } : x)));
      const start = await startUpload(id, token, { name: file.name, type: file.type, size: file.size }, kind);
      if (!start.ok) {
        fail(start.error);
        continue;
      }
      const { error } = await supabase.storage
        .from("onboarding-uploads")
        .uploadToSignedUrl(start.path, start.uploadToken, file, { contentType: file.type });
      if (error) {
        fail("The upload didn't go through - check your connection and try again.");
        continue;
      }
      const done = await finishUpload(id, token, start.path, kind, file.name);
      if (!done.ok) {
        fail(done.error);
        continue;
      }
      setPending((p) => p.filter((x) => x.key !== key));
      setFiles((f) => [...f, { id: done.file.id, filename: done.file.filename, kind: done.file.kind, preview: URL.createObjectURL(file) }]);
    }
  }

  const answered = Object.values(answers).filter((v) => v && v.trim()).length;

  const stepTitles = [...ONBOARDING_SECTIONS.map((s) => s.title), "Your logo and photos", "Check and send"];
  const filled = (ids: string[]) => ids.filter((k) => answers[k]?.trim()).length;
  const missing = [
    !answers.services?.trim() && { label: "Your services", to: 0 },
    !answers.areas?.trim() && { label: "The towns you cover", to: 0 },
    !answers.phone?.trim() && { label: "The phone number to show", to: ONBOARDING_SECTIONS.findIndex((s) => s.questions.some((q) => q.id === "phone")) },
    !files.some((f) => f.kind === "photo") && { label: "Photos of your work", to: photoStep },
  ].filter(Boolean) as { label: string; to: number }[];

  return (
    <div ref={top} className="scroll-mt-4">
      <div className="mt-6">
        <div className="flex items-baseline justify-between text-xs font-semibold text-muted">
          <span>
            Step {step + 1} of {lastStep + 1}: {stepTitles[step]}
          </span>
          {status && <span>{status}</span>}
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {stepTitles.map((t, i) => (
            <button
              key={t}
              type="button"
              tabIndex={-1}
              onClick={() => go(i)}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-brand" : "bg-black/10"}`}
            />
          ))}
        </div>
      </div>
      {ONBOARDING_SECTIONS.map((section, i) => i !== step ? null : (
        <section key={section.title} className={card}>
          <h2 className="font-display text-lg font-bold text-ink">{section.title}</h2>
          <div className="mt-3 flex flex-col gap-4">
            {section.questions.map((q) => (
              <label key={q.id} className="block">
                <span className="text-sm font-semibold text-ink">{q.label}</span>
                {q.hint && <span className="block text-xs text-muted">{q.hint}</span>}
                {q.kind === "long" ? (
                  <textarea rows={4} maxLength={q.max} value={answers[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} className={field} />
                ) : q.kind === "choice" ? (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {q.options!.map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => set(q.id, answers[q.id] === o ? "" : o)}
                        className={`rounded-lg border px-3.5 py-2 text-sm font-semibold ${
                          answers[q.id] === o ? "border-brand bg-brand text-white" : "border-black/15 bg-surface text-ink-2"
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input type="text" maxLength={q.max} value={answers[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} className={field} />
                )}
              </label>
            ))}
          </div>
        </section>
      ))}

      {step === photoStep && (
      <section className={card}>
        <h2 className="font-display text-lg font-bold text-ink">Your logo and photos</h2>
        <p className="mt-1 text-sm text-ink-2">
          Photos of your own work make the biggest difference - before and after shots if you have them. Straight from your
          phone is fine. Up to 15 MB each.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { kind: "logo", label: "Upload your logo", multiple: false },
            { kind: "photo", label: "Upload photos of your work", multiple: true },
          ].map((u) => (
            <label key={u.kind} className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-black/15 px-4 py-6 text-center hover:border-brand">
              <span className="text-sm font-semibold text-ink">{u.label}</span>
              <span className="mt-0.5 text-xs text-muted">JPG, PNG, WebP, HEIC or PDF</span>
              <input
                type="file"
                accept={ACCEPT}
                multiple={u.multiple}
                className="sr-only"
                onChange={(e) => {
                  void upload(e.target.files, u.kind);
                  e.target.value = "";
                }}
              />
            </label>
          ))}
        </div>
        {(files.length > 0 || pending.length > 0) && (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {files.map((f) => (
              <li key={f.id} className="overflow-hidden rounded-lg border border-black/8 bg-surface-2">
                {f.preview && !/\.pdf$/i.test(f.filename) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.preview} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-xs text-muted">{f.filename}</div>
                )}
                <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                  <span className="truncate text-ink-2">{f.kind === "logo" ? "Logo" : "Photo"}</span>
                  <button
                    type="button"
                    className="text-muted hover:text-critical"
                    onClick={async () => {
                      if (!confirm(`Remove ${f.filename}?`)) return;
                      const res = await removeUpload(id, token, f.id);
                      if (res.ok) setFiles((all) => all.filter((x) => x.id !== f.id));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {pending.map((p) => (
              <li key={p.key} className="flex aspect-square flex-col items-center justify-center rounded-lg border border-black/8 bg-surface-2 p-2 text-center text-xs">
                <span className="truncate text-ink-2">{p.name}</span>
                <span className={p.state === "failed" ? "mt-1 text-critical" : "mt-1 text-muted"}>
                  {p.state === "failed" ? p.error : "Uploading..."}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {step === lastStep && (
        <section className={card}>
          <h2 className="font-display text-lg font-bold text-ink">Check and send</h2>
          <ul className="mt-3 divide-y divide-black/8 text-sm">
            {ONBOARDING_SECTIONS.map((section, i) => (
              <li key={section.title} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-ink-2">{section.title}</span>
                <button type="button" onClick={() => go(i)} className="font-semibold text-brand hover:underline">
                  {filled(section.questions.map((q) => q.id))} of {section.questions.length} answered
                </button>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-ink-2">Logo and photos</span>
              <button type="button" onClick={() => go(photoStep)} className="font-semibold text-brand hover:underline">
                {files.length} file{files.length === 1 ? "" : "s"}
              </button>
            </li>
          </ul>
          {missing.length > 0 && (
            <div className="mt-4 rounded-lg bg-surface-2 p-3.5 text-sm text-ink-2">
              <p className="font-semibold text-ink">The build goes quicker with these - but you can send without them:</p>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {missing.map((m) => (
                  <li key={m.label}>
                    <button type="button" onClick={() => go(m.to)} className="rounded-md border border-black/15 bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand">
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => go(step - 1)} className="rounded-lg border border-black/15 bg-surface px-4 py-3 text-sm font-semibold text-ink-2 hover:border-brand">
            Back
          </button>
        ) : (
          <span />
        )}
        {step < lastStep && (
          <button type="button" onClick={() => go(step + 1)} className="btn-primary rounded-lg bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-strong">
            {step === photoStep ? "Check and send" : "Next"}
          </button>
        )}
      </div>

      {step === lastStep && (
      <div className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <p className="text-sm text-ink-2">
          {answered} of {ONBOARDING_QUESTION_COUNT} answered · {files.length} file{files.length === 1 ? "" : "s"}
          {status && <span className="ml-2 text-muted">· {status}</span>}
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await saveOnboarding(id, token, answers, true);
              if (res.ok) setSubmitted(true);
              setStatus(res.ok ? "Sent - thank you" : res.error ?? "Couldn't send");
            })
          }
          className="btn-primary rounded-lg bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {submitted ? "Send the updates" : "Send to us"}
        </button>
      </div>
      )}
      {submitted && step === lastStep && (
        <p className="mt-3 rounded-lg bg-[rgba(12,163,12,0.1)] p-4 text-sm font-semibold text-good">
          Thanks - we&apos;ve got everything so far. You can still add or change anything here.
        </p>
      )}
    </div>
  );
}
