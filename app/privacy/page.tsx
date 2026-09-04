// Draft content, not reviewed by a solicitor - a starting point for real
// legal review, not something to treat as guaranteed-compliant as-is.
// Deliberately not stated on the page itself (would undermine the policy's
// credibility to an actual visitor) - keep this caveat in mind here instead.
export const metadata = { title: "Privacy Policy · Scalar Digital" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-page px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Scalar Digital</p>
        <h1 className="font-display mt-1 text-3xl font-extrabold text-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated: 4 September 2026</p>

        <div className="prose mt-8 flex flex-col gap-6 text-sm leading-relaxed text-ink-2">
          <p>
            This policy covers the operations dashboard product run by Scalar Digital
            (&quot;we&quot;, &quot;us&quot;) for our business customers (&quot;you&quot;, the
            &quot;business&quot;), and the enquiries their own website visitors submit through it.
          </p>

          <section>
            <h2 className="text-base font-bold text-ink">Who is responsible for what</h2>
            <p className="mt-2">
              For the login account you use to access your dashboard, Scalar Digital is the{" "}
              <strong>data controller</strong>. For the leads and enquiries your website visitors
              submit through your contact form, <strong>your business is the data controller</strong> and
              Scalar Digital acts as a <strong>data processor</strong> on your behalf - we store and
              display that data for you, we don&apos;t decide what it&apos;s used for.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">What we collect</h2>
            <ul className="mt-2 list-disc pl-5">
              <li><strong>Account data</strong>: your email address and password (passwords are hashed, never stored in readable form).</li>
              <li><strong>Lead data</strong>: whatever a visitor submits through your contact form - typically name, email, phone, and a message.</li>
              <li><strong>Page view data</strong>: the page path and referring page a visitor arrived from. We don&apos;t use cookies for this or track visitors across other websites.</li>
              <li><strong>Project and invoice data</strong>: whatever you enter directly into the dashboard yourself.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Where it's stored</h2>
            <p className="mt-2">
              Your data is stored with Supabase, in a UK/EU data region. The dashboard application
              itself runs on Vercel, and transactional emails (password resets, lead notifications)
              are sent via Resend. Each of these acts as a sub-processor for us, under their own
              data protection agreements.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">How long we keep it</h2>
            <p className="mt-2">
              For as long as your account is active. If you close your account, or a lead asks for
              their data to be removed, contact us and we&apos;ll delete it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Your rights</h2>
            <p className="mt-2">
              Under UK GDPR you can ask to access, correct, or delete the personal data we hold
              about you. If you&apos;re not satisfied with how we&apos;ve handled a request, you can
              complain to the Information Commissioner&apos;s Office (ico.org.uk).
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-ink">Contact</h2>
            <p className="mt-2">
              For any privacy question or request, contact <strong>hello@scalardigital.co.uk</strong>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
