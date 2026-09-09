// Every margin/forecast figure on this dashboard is only as good as the
// data feeding it - a project with no value set silently drops out of the
// forecast-margin calc, an invoice with no project link can't feed the
// risk table. Surfacing that as its own short list beats letting a
// confident-looking number quietly rest on incomplete records.
export type DataQualityProject = {
  id: string;
  client_name: string;
  value_pence: number | null;
  quote_id: string | null;
  completed_at: string | null;
};
export type DataQualityInvoice = { id: string; client_name: string; project_id: string | null };
export type DataQualityCostItem = { project_id: string };

export type DataQualityWarning = { label: string; count: number };

export function computeDataQualityWarnings(
  projects: DataQualityProject[],
  invoices: DataQualityInvoice[],
  costItems: DataQualityCostItem[]
): DataQualityWarning[] {
  const activeProjects = projects.filter((p) => !p.completed_at);
  const projectIdsWithCosts = new Set(costItems.map((c) => c.project_id));

  const warnings: DataQualityWarning[] = [];

  const noValue = activeProjects.filter((p) => p.value_pence == null);
  if (noValue.length > 0) {
    warnings.push({ label: "Active projects with no value set - excluded from every margin figure", count: noValue.length });
  }

  const noQuote = activeProjects.filter((p) => !p.quote_id);
  if (noQuote.length > 0) {
    warnings.push({ label: "Active projects with no linked quote - no budget to compare against", count: noQuote.length });
  }

  const noCosts = activeProjects.filter((p) => !projectIdsWithCosts.has(p.id));
  if (noCosts.length > 0) {
    warnings.push({ label: "Active projects with no costs logged yet - forecast margin can't see them", count: noCosts.length });
  }

  const unlinkedInvoices = invoices.filter((i) => !i.project_id);
  if (unlinkedInvoices.length > 0) {
    warnings.push({ label: "Invoices with no project linked - excluded from the risk table and ageing-by-job", count: unlinkedInvoices.length });
  }

  return warnings;
}
