"use client";

import { useState, useTransition } from "react";
import { acceptQuote, declineQuote } from "@/app/quote/actions";

export function QuoteResponseButtons({ quoteId, token }: { quoteId: string; token: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [depositUrl, setDepositUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (result === "accepted") {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-[rgba(12,163,12,0.1)] p-4 text-sm font-semibold text-good">
          Quote accepted - thank you. We&apos;ve emailed you a copy, and we&apos;ll be in touch shortly.
        </p>
        {depositUrl && <DepositNextStep url={depositUrl} />}
        {onboardingUrl && <OnboardingNextStep url={onboardingUrl} />}
      </div>
    );
  }
  if (result === "declined") {
    return <p className="rounded-lg bg-surface-2 p-4 text-sm font-semibold text-ink-2">Quote declined. Thanks for letting us know.</p>;
  }

  const ready = name.trim().length >= 2 && agreed;
  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-semibold text-ink-2">
        Your full name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={100}
          className="mt-1 w-full rounded-lg border border-black/15 bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-brand"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
        <span>I accept this quote and its terms.</span>
      </label>
      {error && <p className="text-sm font-semibold text-critical">{error}</p>}
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        disabled={isPending || !ready}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await acceptQuote(quoteId, token, { name, agreed });
            if (res.ok) {
              setOnboardingUrl(res.onboardingUrl ?? null);
              setDepositUrl(res.depositUrl ?? null);
              setResult("accepted");
            } else {
              setError(res.error ?? "Couldn't accept just now - please try again.");
            }
          })
        }
        className="btn-primary flex-1 rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
      >
        Accept quote
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm("Decline this quote?")) return;
          startTransition(async () => {
            const res = await declineQuote(quoteId, token);
            if (res.ok) setResult("declined");
          });
        }}
        className="flex-1 rounded-lg border border-black/8 bg-surface px-4 py-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-60"
      >
        Decline
      </button>
    </div>
    </div>
  );
}

/** Shown once accepted, when the business takes card payments: pay the deposit there and then. */
export function DepositNextStep({ url }: { url: string }) {
  return (
    <div className="rounded-lg border border-black/8 bg-surface-2 p-4">
      <p className="text-sm font-semibold text-ink">Pay your deposit</p>
      <p className="mt-1 text-sm text-ink-2">Secure card payment - it takes a minute and confirms your booking.</p>
      <a href={url} className="btn-primary mt-3 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">
        Pay deposit
      </a>
    </div>
  );
}

/** Shown once a website client accepts: the one link to hand over everything the build needs. */
export function OnboardingNextStep({ url }: { url: string }) {
  return (
    <div className="rounded-lg border border-black/8 bg-surface-2 p-4">
      <p className="text-sm font-semibold text-ink">Next step: tell us about your business</p>
      <p className="mt-1 text-sm text-ink-2">
        About ten minutes - your services, the areas you cover, your logo and a few photos of your work. We&apos;ve emailed you the link too.
      </p>
      <a href={url} className="btn-primary mt-3 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">
        Start now
      </a>
    </div>
  );
}
