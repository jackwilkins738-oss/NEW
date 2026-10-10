import { businessForToken, unsubscribeCustomer } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

// The link in every campaign email. Opening it only asks - link checkers in
// mail filters open links too, so the unsubscribe itself is the button press.
export default async function UnsubscribePage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await props.params;
  const { done } = await props.searchParams;
  const found = token === "test" ? { business: "the business", already: false } : await businessForToken(token);

  async function unsubscribe() {
    "use server";
    const { redirect } = await import("next/navigation");
    if (token !== "test") await unsubscribeCustomer(token);
    redirect(`/unsubscribe/${token}?done=1`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6">
      <div className="w-full max-w-md rounded-2xl border border-black/8 bg-surface p-7 text-center shadow-sm">
        {!found ? (
          <p className="text-sm text-ink">This link isn&apos;t valid any more. Reply to the email and ask to be taken off the list.</p>
        ) : done || found.already ? (
          <>
            <h1 className="text-lg font-bold text-ink">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted">You won&apos;t get any more of these emails from {found.business}.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-ink">Stop emails from {found.business}?</h1>
            <p className="mt-2 text-sm text-muted">You won&apos;t get their seasonal emails any more. Anything about work you&apos;ve booked still reaches you.</p>
            <form action={unsubscribe} className="mt-5">
              <button className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white">Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
