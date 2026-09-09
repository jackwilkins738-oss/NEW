// Portfolio-wide "forecast" margin - revenue on active projects against
// committed cost (every logged cost item, paid or not), the same
// projected-profit convention the project detail page already uses per
// job. Kept separate from the dashboard's existing "actual" margin (paid
// cost only, see app/dashboard/page.tsx) so the two can sit side by side
// rather than one silently replacing the other.
export type ForecastProject = { id: string; value_pence: number | null; completed_at: string | null };
export type ForecastCostItem = { project_id: string; amount_pence: number };

export type PortfolioForecast = {
  projectCount: number;
  forecastRevenuePence: number;
  forecastCostPence: number;
  forecastProfitPence: number;
  forecastMarginPercent: number | null;
};

export function computePortfolioForecast(
  projects: ForecastProject[],
  costItems: ForecastCostItem[]
): PortfolioForecast {
  const activeProjects = projects.filter((p) => !p.completed_at && p.value_pence != null);
  const activeIds = new Set(activeProjects.map((p) => p.id));

  const costByProject = new Map<string, number>();
  for (const item of costItems) {
    if (!activeIds.has(item.project_id)) continue;
    costByProject.set(item.project_id, (costByProject.get(item.project_id) ?? 0) + item.amount_pence);
  }

  const forecastRevenuePence = activeProjects.reduce((sum, p) => sum + (p.value_pence ?? 0), 0);
  const forecastCostPence = [...costByProject.values()].reduce((sum, v) => sum + v, 0);
  const forecastProfitPence = forecastRevenuePence - forecastCostPence;

  return {
    projectCount: activeProjects.length,
    forecastRevenuePence,
    forecastCostPence,
    forecastProfitPence,
    forecastMarginPercent: forecastRevenuePence > 0 ? (forecastProfitPence / forecastRevenuePence) * 100 : null,
  };
}
