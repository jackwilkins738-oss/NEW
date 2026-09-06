// Resend's own REST API via plain fetch, not their SDK - same call the
// "new lead" notification already made; both that email and the weekly
// digest (app/api/cron/weekly-digest/route.ts) now send through here
// instead of duplicating this fetch.
export async function sendEmail(params: { to: string[]; subject: string; html: string; from?: string }) {
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
    }),
  });
}
