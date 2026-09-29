import type { SupabaseClient } from "@supabase/supabase-js";

// How to reach a job's customer: their customer record first, then the
// enquiry, then the quote - whichever has the detail.

export type ProjectLinks = { customer_id: string | null; lead_id: string | null; quote_id: string | null };

export async function customerContact(db: SupabaseClient, project: ProjectLinks | null): Promise<{ email: string | null; phone: string | null }> {
  let email: string | null = null;
  let phone: string | null = null;
  if (project?.customer_id) {
    const { data } = await db.from("customers").select("email, phone").eq("id", project.customer_id).maybeSingle();
    email = data?.email ?? null;
    phone = data?.phone ?? null;
  }
  if ((!email || !phone) && project?.lead_id) {
    const { data } = await db.from("leads").select("email, phone").eq("id", project.lead_id).maybeSingle();
    email = email ?? data?.email ?? null;
    phone = phone ?? data?.phone ?? null;
  }
  if ((!email || !phone) && project?.quote_id) {
    const { data } = await db.from("quotes").select("customer_email, customer_phone").eq("id", project.quote_id).maybeSingle();
    email = email ?? data?.customer_email ?? null;
    phone = phone ?? data?.customer_phone ?? null;
  }
  return { email, phone };
}

/** A UK phone number in international form for WhatsApp (07700 900123 -> 447700900123), or null. */
export function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  if (/^\+\d{10,15}$/.test(digits)) return digits.slice(1);
  if (/^00\d{10,15}$/.test(digits)) return digits.slice(2);
  if (/^0\d{9,10}$/.test(digits)) return `44${digits.slice(1)}`;
  return null;
}

/** Links that open WhatsApp or the phone's Messages with `text` ready to send. */
export function messageLinks(phone: string | null, text: string): { whatsapp: string | null; sms: string | null } {
  const tel = (phone ?? "").replace(/[^\d+]/g, "");
  const wa = whatsappNumber(phone);
  return {
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null,
    // "?&body=" is the form both iOS and Android Messages accept.
    sms: tel.length >= 10 ? `sms:${tel}?&body=${encodeURIComponent(text)}` : null,
  };
}

/** First name for a greeting: "Sarah Kerr" -> "Sarah"; nothing usable -> "there". */
export function greetingName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return /\p{L}{2,}/u.test(first) ? first : "there";
}

/** The ready-written chasers: a quote, a payment, a review. */
export const chaseText = {
  quote: (name: string, business: string, total: string, url: string) =>
    `Hi ${greetingName(name)}, just checking the quote I sent reached you (${total}). You can see it and accept it here: ${url} - any questions, just ask. ${business}`,
  payment: (name: string, business: string, invoice: string, amount: string, url: string) =>
    `Hi ${greetingName(name)}, a quick reminder about invoice ${invoice} for ${amount} - you can view and pay it here: ${url}. Thanks, ${business}`,
  review: (name: string, business: string, url: string) =>
    `Hi ${greetingName(name)}, thanks again for choosing ${business}. If you've a minute, a quick Google review would really help us: ${url}`,
};

/** The "on my way" message and the links that open it ready to send. */
export function onMyWay(phone: string | null, customerName: string, businessName: string, minutes: number) {
  const first = customerName.trim().split(/\s+/)[0] || "there";
  const text = `Hi ${first}, it's ${businessName} - on my way now, with you in about ${minutes} minutes.`;
  const tel = (phone ?? "").replace(/[^\d+]/g, "");
  const wa = whatsappNumber(phone);
  return {
    text,
    // "?&body=" is the form both iOS and Android Messages accept.
    sms: tel ? `sms:${tel}?&body=${encodeURIComponent(text)}` : null,
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null,
  };
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "Tuesday 14 October at 8:00am" in UK time. */
export function ukVisitTime(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .replace(" ", "")
    .toLowerCase();
  return { day, time };
}

/** A Google Maps directions link for an address. */
export function mapsLink(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}
