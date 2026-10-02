import type { SupabaseClient } from "@supabase/supabase-js";
import { computeQuoteTotals, type QuoteLineItem } from "@/lib/quoteMath";

// The sales demo: a made-up loft and extension firm with a few weeks of
// believable activity, shown on sales calls at demo.<your domain> (the
// owner shares their screen - prospects never get a login). resetDemo()
// wipes that one tenant's data and writes it all fresh, with every date
// relative to today, so the dashboard always looks current. It runs from
// /admin ("Reset demo") and every morning from the calendar-sync cron, so
// anything clicked or changed during a demo is gone by the next one.
//
// Safety: it only ever touches the tenant whose slug is DEMO_SLUG, found by
// that slug here - never an id passed in - and every delete is filtered by
// that tenant's id. All the people are fictional; their email addresses use
// example.com, which accepts no mail, so a "send" clicked in a demo goes
// nowhere.

export const DEMO_SLUG = "demo";
export const DEMO_NAME = "Ridgeview Lofts & Extensions";

const DAY = 86_400_000;
// A time `days` from today at `hour` - but never later than a few minutes ago
// when it falls in the past-or-today range, so "today's" enquiries and visits
// don't show up stamped with a time that hasn't happened yet.
const at = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  const latest = Date.now() - 10 * 60_000;
  return (days <= 0 && d.getTime() > latest ? new Date(latest - (24 - hour) * 60_000) : d).toISOString();
};
const on = (days: number) => at(days).slice(0, 10);
const pounds = (n: number) => Math.round(n * 100);

function quoteTotals(items: QuoteLineItem[], markup: number) {
  return computeQuoteTotals(items, markup, 20);
}

type Admin = SupabaseClient;

// defaultToNull: false - in a multi-row insert, a field one row leaves out would
// otherwise be sent as null for that row (not the column's default), and a
// NOT NULL column like reviews.published then rejects the whole insert.
async function insert(admin: Admin, table: string, rows: Record<string, unknown>[]) {
  const { data, error } = await admin.from(table).insert(rows, { defaultToNull: false }).select("id");
  if (error) throw new Error(`demo ${table}: ${error.message}`);
  return (data ?? []).map((r: { id: string }) => r.id);
}

/** Finds (or creates) the demo tenant. Returns its id and site key. */
export async function ensureDemoTenant(admin: Admin): Promise<{ id: string; site_key: string }> {
  const { data: found } = await admin.from("tenants").select("id, site_key").eq("slug", DEMO_SLUG).maybeSingle();
  if (found) return found;
  const { data, error } = await admin
    .from("tenants")
    .insert({ business_name: DEMO_NAME, slug: DEMO_SLUG, brand_theme: "forest" })
    .select("id, site_key")
    .single();
  if (error || !data) throw new Error(`demo tenant: ${error?.message ?? "not created"}`);
  return data;
}

// "Show as" on a sales call: the prospect's own firm name at the top of the
// demo, so it's their dashboard they're looking at. Plain words only, and
// anything else falls back to the made-up firm. The morning reset puts it back.
const SHOW_AS_RE = /^[A-Za-z0-9][A-Za-z0-9 &'.,()+-]{1,59}$/;

export function demoName(showAs?: string | null): string {
  const name = (showAs ?? "").replace(/\s+/g, " ").trim();
  return SHOW_AS_RE.test(name) ? name : DEMO_NAME;
}

/** Wipes the demo tenant's data and writes a fresh set. Returns the tenant id. */
export async function resetDemo(admin: Admin, showAs?: string | null): Promise<string> {
  const { id: tenant_id, site_key } = await ensureDemoTenant(admin);

  // Children first where there's no cascade from a parent being deleted here.
  for (const table of [
    "reviews", "invoices", "projects", "quotes", "leads", "customers", "team_members",
    "suppliers", "trade_capacity", "pageviews",
  ]) {
    const { error } = await admin.from(table).delete().eq("tenant_id", tenant_id);
    if (error) throw new Error(`demo clear ${table}: ${error.message}`);
  }
  await admin
    .from("tenants")
    .update({ business_name: demoName(showAs), company_address: "Unit 4, Hurst Farm, Guildford GU4 7AA", default_vat_rate: 20 })
    .eq("id", tenant_id);

  const t = { tenant_id };

  // ---- customers
  const people = [
    ["Whitfield residence", "whitfield@example.com", "07700 900101", "12 Pewley Hill, Guildford GU1 3SN"],
    ["Carrow family", "carrow@example.com", "07700 900102", "4 Crondall Lane, Farnham GU10 5QE"],
    ["Okafor residence", "okafor@example.com", "07700 900103", "27 Hillview Road, Woking GU22 7NR"],
    ["Sinclair household", "sinclair@example.com", "07700 900104", "9 Station Road, Godalming GU7 1EU"],
    ["Bevan household", "bevan@example.com", "07700 900105", "33 Ash Hill Road, Ash GU12 6AD"],
    ["Hartley residence", "hartley@example.com", "07700 900106", "18 Merrow Street, Guildford GU4 7AX"],
  ] as const;
  const customerIds = await insert(
    admin,
    "customers",
    people.map(([name, email, phone, address]) => ({ ...t, name, email, phone, address }))
  );
  const customer = (i: number) => ({ customer_id: customerIds[i], client_name: people[i][0] });

  // ---- leads: the enquiry pipeline, most recent first
  const leadRows = [
    ["Daniel Price", "Dormer loft, 3-bed semi - would like a rough price", "Website", "new", 0, 52000, "Dormer loft"],
    ["Priya Nair", "Single-storey rear extension with bifolds", "Google Business", "new", -1, 68000, "Rear extension"],
    ["Tom & Ellie Marsh", "Hip-to-gable with ensuite, planning already approved", "Website", "contacted", -3, 61000, "Hip-to-gable loft"],
    ["Graham Fox", "Garage conversion into home office", "Referral", "survey_booked", -5, 24000, "Garage conversion"],
    ["Hartley residence", "Mansard loft - quote requested after survey", "Website", "quoted", -9, 74000, "Mansard loft"],
    ["Sophie Lang", "Velux conversion for a playroom", "Google Business", "quoted", -12, 31000, "Velux loft"],
    ["Okafor residence", "Dormer loft with bathroom", "Referral", "won", -40, 61900, "Dormer loft"],
    ["Mark Ellison", "Wraparound extension - went with a cheaper quote", "Website", "lost", -26, 89000, "Wraparound extension"],
  ] as const;
  const leadIds = await insert(
    admin,
    "leads",
    leadRows.map(([name, message, source, status, days, value, job]) => ({
      ...t,
      site_key,
      name,
      email: `${name.split(" ")[0].toLowerCase()}@example.com`,
      phone: "07700 900" + String(200 + name.length),
      message,
      source,
      status,
      job_type: job,
      value_pence: pounds(value),
      created_at: at(days, 9 + (Math.abs(days) % 8)),
      status_updated_at: at(Math.min(0, days + 1)),
    }))
  );

  // ---- quotes
  const mansard: QuoteLineItem[] = [
    { category: "labour", description: "Mansard loft conversion - structure, roof and first fix", unit_price_pence: pounds(38000) },
    { category: "materials", description: "Steels, timber, insulation and roofing materials", unit_price_pence: pounds(14500) },
    { category: "subcontractors", description: "Electrics, plumbing and plastering", unit_price_pence: pounds(9800) },
  ];
  const velux: QuoteLineItem[] = [
    { category: "labour", description: "Velux loft conversion - floor, stairs, dormer-free roof lights", unit_price_pence: pounds(15500) },
    { category: "materials", description: "Roof windows, insulation, flooring", unit_price_pence: pounds(7200) },
  ];
  const dormer: QuoteLineItem[] = [
    { category: "labour", description: "Rear dormer loft conversion with ensuite", unit_price_pence: pounds(32000) },
    { category: "materials", description: "Steels, timber, glazing and bathroom suite", unit_price_pence: pounds(13400) },
    { category: "subcontractors", description: "Electrics, plumbing and plastering", unit_price_pence: pounds(6200) },
  ];
  const quote = (
    number: string, who: { client_name: string; customer_id?: string }, lead: number | null, items: QuoteLineItem[],
    status: string, days: number, extra: Record<string, unknown> = {}
  ) => {
    const { costSubtotalPence, vatAmountPence, totalPence } = quoteTotals(items, 12);
    return {
      ...t, ...who, lead_id: lead == null ? null : leadIds[lead], quote_number: number, line_items: items,
      markup_percent: 12, vat_rate: 20, cost_subtotal_pence: costSubtotalPence, vat_amount_pence: vatAmountPence,
      total_pence: totalPence, deposit_pence: Math.round(totalPence * 0.2), status, created_at: at(days),
      expires_at: on(days + 30), customer_email: `${who.client_name.split(" ")[0].toLowerCase()}@example.com`,
      payment_terms: "20% deposit, stage payments at first fix and completion.", ...extra,
    };
  };
  const quoteIds = await insert(admin, "quotes", [
    quote("RL-0112", customer(5), 4, mansard, "sent", -8, { sent_at: at(-8) }),
    quote("RL-0111", { client_name: "Sophie Lang" }, 5, velux, "sent", -11, { sent_at: at(-11) }),
    quote("RL-0104", customer(2), 6, dormer, "accepted", -38, { sent_at: at(-38), accepted_at: at(-35) }),
    quote("RL-0098", { client_name: "Mark Ellison" }, 7, mansard, "declined", -24, { sent_at: at(-24), declined_at: at(-20) }),
    quote("RL-0113", { client_name: "Daniel Price" }, 0, dormer, "draft", 0),
  ]);

  // ---- projects. Costs aren't columns on a project any more (migration 034) -
  // they're cost items, so each project's [materials, labour, subcontractors]
  // becomes a set of paid cost items below, alongside the named ones.
  const projectCosts: [number, number, number][] = [];
  const project = (
    ref: string, who: { client_name: string; customer_id?: string }, location: string, type: string, stage: string,
    value: number, pm: string, start: number, target: number, status: string, costs: [number, number, number], extra: Record<string, unknown> = {}
  ) => {
    projectCosts.push(costs);
    return {
      ...t, ...who, ref, location, project_type: type, stage, value_pence: pounds(value), pm, start_date: on(start),
      target_date: on(target), status, payment_type: "Stage payments", created_at: at(start - 14), ...extra,
    };
  };
  const projectIds = await insert(admin, "projects", [
    project("LC-041", customer(0), "Guildford", "Hip-to-gable loft", "On site - first fix", 58400, "Sam O.", -21, 34, "on_track",
      [9800, 12400, 3100], { next_visit_at: at(1, 8) }),
    project("RE-038", customer(1), "Farnham", "Rear extension", "Building control sign-off", 46200, "Priya A.", -48, 9, "on_track",
      [11200, 14800, 5600], { next_visit_at: at(2, 9) }),
    project("LC-039", customer(2), "Woking", "Dormer loft", "Awaiting steel delivery", 61900, "Sam O.", -9, 58, "at_risk",
      [4100, 3900, 0], { quote_id: quoteIds[2], lead_id: leadIds[6], notes: "Steel supplier pushed delivery by 8 days - re-sequence first fix." }),
    project("GC-036", customer(3), "Godalming", "Garage conversion", "Snagging", 23800, "Priya A.", -52, -2, "delayed",
      [5200, 7100, 1900]),
    project("LC-031", customer(4), "Ash", "Velux loft", "Complete", 29500, "Sam O.", -96, -41, "on_track",
      [6300, 8800, 2400], { completed_at: at(-41) }),
  ]);

  // ---- invoices (one overdue, one due soon, the rest paid)
  const invoice = (p: number, who: { client_name: string; customer_id?: string }, number: string, milestone: string,
    amount: number, due: number, paid: boolean, created: number) => ({
    ...t, ...who, project_id: projectIds[p], invoice_number: number, reference: number, milestone,
    amount_pence: pounds(amount), paid_pence: paid ? pounds(amount) : 0, due_date: on(due), status: paid ? "paid" : "unpaid",
    created_at: at(created), sent_at: at(created),
  });
  const invoiceIds = await insert(admin, "invoices", [
    invoice(0, customer(0), "INV-3212", "Deposit", 11680, -18, true, -25),
    invoice(0, customer(0), "INV-3219", "First fix", 17520, 6, false, -2),
    invoice(1, customer(1), "INV-3201", "Watertight", 13860, -5, true, -16),
    invoice(1, customer(1), "INV-3208", "Second fix", 13860, -3, false, -17),
    invoice(2, customer(2), "INV-3215", "Deposit", 12380, 4, false, -7),
    invoice(3, customer(3), "INV-3187", "Completion", 7140, -14, false, -28),
    invoice(4, customer(4), "INV-3150", "Final", 8850, -40, true, -47),
  ]);

  // ---- variations
  await insert(admin, "variations", [
    { ...t, project_id: projectIds[0], number: "V1", description: "Upgrade to oak staircase", materials_cost_pence: pounds(1450),
      labour_cost_pence: pounds(600), customer_price_pence: pounds(2650), additional_days: 1, status: "approved", approved_at: at(-6),
      invoice_id: invoiceIds[1] },
    { ...t, project_id: projectIds[1], number: "V1", description: "Extra roof lantern over kitchen", materials_cost_pence: pounds(1900),
      labour_cost_pence: pounds(700), customer_price_pence: pounds(3400), additional_days: 2, status: "pending" },
  ]);

  // ---- cost items, snags, communications
  const running: Record<string, unknown>[] = projectCosts.flatMap(([materials, labour, subs], i) =>
    [
      ["materials", "Materials to date", "Travis Perkins Guildford", materials],
      ["labour", "Labour to date", "", labour],
      ["subcontractors", "Subcontractors to date", "", subs],
    ]
      .filter(([, , , amount]) => (amount as number) > 0)
      .map(([category, description, supplier, amount]) => ({
        ...t, project_id: projectIds[i], category, description, supplier: supplier || null,
        amount_pence: pounds(amount as number), status: "paid", cost_date: on(-7 - i),
      }))
  );
  await insert(admin, "project_cost_items", [
    ...running,
    { ...t, project_id: projectIds[0], category: "materials", description: "Steel beams x3", supplier: "Surrey Steel Ltd", amount_pence: pounds(2860), status: "paid", cost_date: on(-15) },
    { ...t, project_id: projectIds[0], category: "materials", description: "Timber and insulation", supplier: "Travis Perkins Guildford", amount_pence: pounds(3940), status: "paid", cost_date: on(-12) },
    { ...t, project_id: projectIds[0], category: "subcontractors", description: "First fix electrics", supplier: "Brightline Electrical", amount_pence: pounds(1850), status: "committed", cost_date: on(3) },
    { ...t, project_id: projectIds[1], category: "plant", description: "Mini digger hire - 1 week", supplier: "HSS Hire", amount_pence: pounds(640), status: "paid", cost_date: on(-40) },
    { ...t, project_id: projectIds[2], category: "materials", description: "Steels (deposit)", supplier: "Surrey Steel Ltd", amount_pence: pounds(1200), status: "committed", cost_date: on(-4) },
  ]);
  await insert(admin, "snags", [
    { ...t, project_id: projectIds[3], description: "Skirting gap by the door frame", location: "Office", assigned_to: "Dan (carpenter)", due_date: on(1), status: "assigned" },
    { ...t, project_id: projectIds[3], description: "Second coat on the ceiling", location: "Office", assigned_to: "Lee (decorator)", due_date: on(2), status: "open" },
    { ...t, project_id: projectIds[3], description: "Radiator valve weeping", location: "Office", assigned_to: "Brightline", due_date: on(-1), status: "complete" },
  ]);
  await insert(admin, "communications", [
    { ...t, project_id: projectIds[0], type: "call", summary: "Confirmed oak staircase upgrade - variation V1 approved.", created_at: at(-6, 15) },
    { ...t, project_id: projectIds[0], type: "email", summary: "Sent first fix photos and next week's schedule.", created_at: at(-2, 17) },
    { ...t, project_id: projectIds[2], type: "call", summary: "Explained steel delay; client happy with revised dates.", created_at: at(-3, 12) },
    { ...t, project_id: projectIds[1], type: "sms", summary: "Building control inspection booked for Thursday 9am.", created_at: at(-1, 8) },
  ]);

  // ---- team and suppliers
  const teamIds = await insert(admin, "team_members", [
    { ...t, name: "Sam Okoro", role: "Project manager", phone: "07700 900301", cost_per_hour_pence: pounds(32) },
    { ...t, name: "Priya Anand", role: "Project manager", phone: "07700 900302", cost_per_hour_pence: pounds(32) },
    { ...t, name: "Dan Reeves", role: "Carpenter", phone: "07700 900303", cost_per_hour_pence: pounds(26) },
    { ...t, name: "Lee Carter", role: "Decorator", phone: "07700 900304", cost_per_hour_pence: pounds(22) },
  ]);
  await admin.from("project_team_members").insert([
    { project_id: projectIds[0], team_member_id: teamIds[0] },
    { project_id: projectIds[0], team_member_id: teamIds[2] },
    { project_id: projectIds[1], team_member_id: teamIds[1] },
    { project_id: projectIds[3], team_member_id: teamIds[3] },
  ]);
  await insert(admin, "suppliers", [
    { ...t, name: "Travis Perkins Guildford", contact_name: "Counter", account_number: "TP-44120", phone: "01483 000100", categories: "Timber, insulation, plaster" },
    { ...t, name: "Surrey Steel Ltd", contact_name: "Martin", account_number: "SS-2291", phone: "01483 000200", categories: "Steel beams" },
    { ...t, name: "Brightline Electrical", contact_name: "Gary", phone: "07700 900400", categories: "Electrics (subcontract)" },
  ]);
  await insert(admin, "trade_capacity", [
    { ...t, trade_name: "Loft conversions", percent_booked: 85 },
    { ...t, trade_name: "Extensions", percent_booked: 60 },
    { ...t, trade_name: "Garage conversions", percent_booked: 30 },
  ]);

  // ---- reviews
  await insert(admin, "reviews", [
    { ...t, project_id: projectIds[4], customer_name: "Bevan household", rating: 5, status: "received", published: true,
      review_text: "Tidy, on time and the loft is better than we imagined. Sam kept us updated every step.", requested_at: at(-40), received_at: at(-37) },
    { ...t, customer_name: "J. Morton", rating: 5, status: "received", published: true,
      review_text: "Clear fixed price and no surprises. Would use again for our extension.", requested_at: at(-70), received_at: at(-66) },
    { ...t, customer_name: "R. Patel", rating: 4, status: "received", published: true,
      review_text: "Great build quality. A week longer than planned, but they told us early.", requested_at: at(-95), received_at: at(-90) },
    { ...t, project_id: projectIds[3], customer_name: "Sinclair household", status: "requested", published: false, requested_at: at(-1) },
  ]);

  // ---- website visits for the last 30 days (the dashboard's traffic chart)
  const paths = ["/", "/", "/", "/loft-conversions", "/extensions", "/our-work", "/contact", "/areas/guildford"];
  const refs = ["https://www.google.com/", "https://www.google.com/", "", "https://www.facebook.com/", "https://www.checkatrade.com/"];
  const visits: Record<string, unknown>[] = [];
  for (let d = 29; d >= 0; d--) {
    const count = 8 + ((d * 7) % 11) + (d % 7 === 5 || d % 7 === 6 ? -4 : 3);
    for (let i = 0; i < count; i++) {
      visits.push({ ...t, site_key, path: paths[(d + i) % paths.length], referrer: refs[(d * 3 + i) % refs.length], created_at: at(-d, 7 + (i % 13)) });
    }
  }
  await insert(admin, "pageviews", visits);

  return tenant_id;
}

/** For the daily cron: refreshes the demo only once it's been set up from /admin. */
export async function resetDemoIfPresent(admin: Admin): Promise<boolean> {
  const { data } = await admin.from("tenants").select("id").eq("slug", DEMO_SLUG).maybeSingle();
  if (!data) return false;
  await resetDemo(admin);
  return true;
}
