// The week's pipeline in numbers, for the Monday digest. Pure, so the
// digest email and anything else that ever shows it can't disagree.
//
// "Leads" are people who contacted the business (website form, etc).
// "Prospects" are businesses the tenant reached out to - only Scalar's own
// tenant has any today - and "viewed" means they opened their preview page.

type LeadLike = { status: string; source: string | null; created_at: string };
type ProspectLike = {
  business_name: string;
  status: string;
  view_count: number;
  last_viewed_at: string | null;
};

export type PipelineSummary = {
  newLeads: number;
  leadsBySource: { source: string; count: number }[];
  openLeads: number;
  prospectsTotal: number;
  prospectsReplied: number;
  viewedThisWeek: { business_name: string; view_count: number }[];
  hasActivity: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const OPEN = new Set(["new", "contacted", "survey_booked", "quoted"]);

export function computePipelineSummary(leads: LeadLike[], prospects: ProspectLike[], now: Date): PipelineSummary {
  const since = now.getTime() - WEEK_MS;
  const recent = leads.filter((l) => new Date(l.created_at).getTime() >= since);

  const bySource = new Map<string, number>();
  for (const l of recent) {
    const key = l.source?.trim() || "website";
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }

  const viewedThisWeek = prospects
    .filter((p) => p.last_viewed_at && new Date(p.last_viewed_at).getTime() >= since)
    .sort((a, b) => b.view_count - a.view_count || a.business_name.localeCompare(b.business_name))
    .map((p) => ({ business_name: p.business_name, view_count: p.view_count }));

  const summary = {
    newLeads: recent.length,
    leadsBySource: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    openLeads: leads.filter((l) => OPEN.has(l.status)).length,
    prospectsTotal: prospects.length,
    prospectsReplied: prospects.filter((p) => p.status === "replied" || p.status === "won").length,
    viewedThisWeek,
  };
  return { ...summary, hasActivity: summary.newLeads > 0 || viewedThisWeek.length > 0 };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The digest's pipeline block. Prospect names come from an import, so everything is escaped. */
export function renderPipelineHtml(s: PipelineSummary): string {
  if (!s.hasActivity && s.prospectsTotal === 0) return "";
  const sources = s.leadsBySource.map((x) => `${x.count} from ${escapeHtml(x.source)}`).join(", ");
  const lines = [
    `<strong>${s.newLeads}</strong> new lead${s.newLeads === 1 ? "" : "s"} this week${sources ? ` (${sources})` : ""} &middot; <strong>${s.openLeads}</strong> still open`,
    s.prospectsTotal > 0
      ? `<strong>${s.viewedThisWeek.length}</strong> of ${s.prospectsTotal} prospects opened their preview this week &middot; <strong>${s.prospectsReplied}</strong> replied or won so far`
      : null,
  ].filter(Boolean);
  const viewed = s.viewedThisWeek
    .slice(0, 10)
    .map((v) => `<li>${escapeHtml(v.business_name)}${v.view_count > 1 ? ` (${v.view_count} visits)` : ""}</li>`)
    .join("");
  return `<div style="margin:14px 0;padding:12px 14px;border:1px solid #e4dfd3;border-radius:8px;font-size:14px;">
      <p style="margin:0 0 6px;font-weight:bold;">Pipeline</p>
      ${lines.map((l) => `<p style="margin:4px 0;">${l}</p>`).join("")}
      ${viewed ? `<p style="margin:10px 0 4px;">Worth a call - opened their preview:</p><ul style="margin:0;padding-left:18px;">${viewed}</ul>` : ""}
    </div>`;
}
