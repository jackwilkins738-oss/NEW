import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client, used from client components (e.g. the login form).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Must match lib/supabase/server.ts - see the comment there. Every
    // sign-in link this app sends (invites, password resets) comes from
    // admin.generateLink(), which only ever produces implicit-flow links,
    // never PKCE ones.
    { auth: { flowType: "implicit" } }
  );
}
