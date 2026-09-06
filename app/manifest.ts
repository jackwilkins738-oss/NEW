import type { MetadataRoute } from "next";
import { getCurrentTenant } from "@/lib/tenant";
import { deriveBrandTheme } from "@/lib/theme";

// Makes "Add to Home Screen" show the business's own name and color per
// tenant, generated per request rather than one static file - Next
// auto-injects the manifest <link> into <head> from this file convention,
// nothing to add in app/layout.tsx.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await getCurrentTenant();
  const name = tenant ? tenant.business_name : "Scalar Digital";
  const brand = deriveBrandTheme(tenant?.brand_theme ?? "rust").light.brand;

  return {
    name,
    short_name: name.length > 14 ? `${name.slice(0, 13)}…` : name,
    start_url: tenant ? "/dashboard" : "/admin",
    display: "standalone",
    background_color: "#e6dcc8",
    theme_color: brand,
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  };
}
