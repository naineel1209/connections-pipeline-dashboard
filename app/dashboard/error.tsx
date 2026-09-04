"use client";

import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard data failed to load.", error);
  }, [error]);

  return <main className="dashboard-shell"><section className="route-state" role="alert"><p className="eyebrow">CONNECTIONS</p><h1>The workspace did not load</h1><p>Check the connection, then try again.</p><button className="primary-button" onClick={reset}>Try loading again</button></section></main>;
}
