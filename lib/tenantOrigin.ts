// Where a tenant's dashboard, and its public quote/invoice/portal pages, live:
// its own domain if it has one, else slug.scalardigital.co.uk - every tenant is
// reachable there. Never the bare scalardigital.co.uk, which is the marketing
// site and 404s on /quote, /invoice and /portal.
export function tenantOrigin(tenant: { domain?: string | null; slug?: string | null } | null | undefined): string {
  const domain = tenant?.domain?.trim();
  if (domain) return `https://${domain}`;
  const slug = tenant?.slug?.trim();
  return slug ? `https://${slug}.scalardigital.co.uk` : "https://admin.scalardigital.co.uk";
}
