import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Server-side Supabase client, scoped to the signed-in visitor via their auth cookies.
// RLS policies (see supabase/schema.sql) are what actually enforce tenant isolation -
// this client just carries the visitor's identity into that check.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // @supabase/ssr defaults to PKCE, but every sign-in link this app
      // produces (invites, password resets) goes through
      // supabase.auth.admin.generateLink() - a server-side admin call that
      // can never establish a PKCE code_verifier, since that only exists
      // when a browser itself initiates the flow. Admin-generated links are
      // a known incompatibility with PKCE (supabase/auth-js#767): the link
      // carries a token/type pair, not a code, so /auth/v1/verify rejects
      // it as invalid before ever reaching this app. Implicit flow is what
      // those links actually produce, so it's what has to be configured here.
      auth: { flowType: "implicit" },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component render - the middleware refreshes
            // the session instead, so this can be safely ignored.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // See note above.
          }
        },
      },
    }
  );
}
