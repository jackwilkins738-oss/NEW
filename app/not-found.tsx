import Link from "next/link";

// The public 404. This is the one a *customer* is most likely to hit: the
// portal, quote and invoice pages all call notFound() when a token doesn't
// match, which happens whenever a link is mistyped, truncated by an email
// client, or belongs to a job that's since been removed.
//
// Until now that rendered the stock Next.js 404 - black Helvetica on white,
// no branding, no explanation - which reads as "this company's system is
// broken" rather than "this link is out of date". No tenant is resolvable
// here (there's no valid record to resolve one from), so it deliberately
// uses the default palette and stays vague about what was being looked for.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6 py-12">
      <div className="login-card-enter w-full max-w-md rounded-[28px] border border-black/8 bg-surface p-7 text-center shadow-[0_1px_2px_rgba(23,20,15,0.06),0_28px_56px_-16px_rgba(23,20,15,0.28)] sm:p-9">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">404</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-ink">This link isn&rsquo;t valid</h1>
        <p className="mt-2 text-sm text-muted">
          It may have expired, or been copied incompletely. If someone sent you this link, ask them to send
          the latest one.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-brand hover:text-brand-strong">
          Go to the sign-in page
        </Link>
      </div>
    </main>
  );
}
