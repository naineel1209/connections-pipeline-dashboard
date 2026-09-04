"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [error, setError] = useState("");
  async function signIn() {
    setError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (signInError) setError(signInError.message);
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">PRIVATE WORKSPACE</p>
        <h1>Connections Pipeline</h1>
        <p>Track your outreach, referrals, and applications in one private workspace.</p>
        <button className="primary-button" onClick={signIn}>Continue with Google</button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </section>
    </main>
  );
}
