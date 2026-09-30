import { Box } from "@/components/ui";

/** Shown instead of the app until the Supabase environment variables are set. */
export function SetupNotice() {
  return (
    <main className="auth-wrap">
      <Box className="auth-card">
        <div className="kicker">Setup needed</div>
        <h2 style={{ margin: 0 }}>Supabase isn&apos;t connected</h2>
        <p className="text-muted" style={{ margin: 0 }}>
          Set <span className="mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</span> — in <span className="mono">.env.local</span>{" "}
          for local development, or in Vercel → Settings → Environment Variables — then restart or redeploy.
        </p>
      </Box>
    </main>
  );
}
