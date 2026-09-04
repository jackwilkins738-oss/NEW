// Draft content, not reviewed by a solicitor - a starting point for real
// legal review, not something to treat as guaranteed-compliant as-is.
export const metadata = { title: "Terms of Service · Scalar Digital" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-page px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Scalar Digital</p>
        <h1 className="font-display mt-1 text-3xl font-extrabold text-ink">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Last updated: 4 September 2026</p>

        <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-ink-2">
          <section>
            <h2 className="text-base font-bold text-ink">The service</h2>
            <p className="mt-2">
              Scalar Digital provides an operations dashboard - lead capture, project and invoice
              tracking, and related tools - to business customers, typically as part of a website
              build. These terms govern your use of that dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Your account</h2>
            <p className="mt-2">
              You&apos;re responsible for keeping your login credentials secure and for anything
              that happens under your account. Let us know straight away if you think your account
              has been compromised.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Your data</h2>
            <p className="mt-2">
              You own the business data you put into the dashboard - projects, invoices, and the
              leads your website captures. We store and process it on your behalf; we don&apos;t
              claim ownership of it or use it for anything beyond providing the service to you. See
              our Privacy Policy for how it&apos;s handled.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Acceptable use</h2>
            <p className="mt-2">
              Don&apos;t use the dashboard or its lead-capture tools for anything illegal, to send
              spam, or to collect data from people without a lawful basis for doing so.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Availability</h2>
            <p className="mt-2">
              We aim to keep the service running reliably, but don&apos;t guarantee it will be
              available at all times - the underlying infrastructure (hosting, database, email
              delivery) is provided by third parties and can occasionally be affected by issues
              outside our control.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Liability</h2>
            <p className="mt-2">
              The service is provided as-is. To the extent permitted by law, Scalar Digital isn&apos;t
              liable for indirect or consequential losses arising from your use of the dashboard,
              including lost business or lost data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Ending the service</h2>
            <p className="mt-2">
              Either of us can end the arrangement at any time. If your account is closed, your data
              will be deleted in line with our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Changes to these terms</h2>
            <p className="mt-2">
              We may update these terms from time to time. Continuing to use the dashboard after a
              change means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Governing law</h2>
            <p className="mt-2">These terms are governed by the law of England and Wales.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Contact</h2>
            <p className="mt-2">
              Questions about these terms: <strong>hello@scalardigital.co.uk</strong>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
