// Resend's own REST API via plain fetch, not their SDK - same call the
// "new lead" notification already made; both that email and the weekly
// digest (app/api/cron/weekly-digest/route.ts) now send through here
// instead of duplicating this fetch.
export async function sendEmail(params: { to: string[]; subject: string; html: string; from?: string; replyTo?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: params.from ?? "Scalar Digital <notify@scalardigital.help>",
      to: params.to,
      subject: params.subject,
      html: params.html,
      // Sends still go out from Scalar's own verified domain (deliverability
      // depends on that domain's SPF/DKIM, which a per-tenant domain
      // wouldn't have without them doing their own DNS setup) - reply_to is
      // what makes "Reply" land in the tenant's own inbox instead.
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });
}
