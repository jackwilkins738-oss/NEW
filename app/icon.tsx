import { ImageResponse } from "next/og";
import { getCurrentTenant } from "@/lib/tenant";
import { initialsFor } from "@/lib/initials";
import { deriveBrandTheme } from "@/lib/theme";

// Next's file convention for a favicon / home-screen icon - generated per
// request instead of a static asset, so it's correctly per-tenant for
// free: each business's own initials on their own brand color, the same
// monogram already shown on the login page. Falls back to the Scalar
// Digital mark on the admin domain, where there's no tenant.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  const tenant = await getCurrentTenant();
  const { light } = deriveBrandTheme(tenant?.brand_theme ?? "rust");
  const initials = initialsFor(tenant ? tenant.business_name : "Scalar Digital");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(155deg, ${light.brand}, ${light.brandStrong})`,
          borderRadius: 96,
        }}
      >
        <div style={{ color: "white", fontSize: 220, fontWeight: 800 }}>{initials}</div>
      </div>
    ),
    { ...size }
  );
}
