"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface KioskData {
  kiosk: { token_name: string; scope: string };
  kpis: {
    scans_today: number;
    active_ops: number;
    lots_by_stage: Array<{ stage_name: string; count: number }>;
  };
  timestamp: string;
}

function TVDashboardContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<KioskData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token not provided. Use /tv?token=<uuid>");
      return;
    }

    async function fetchData() {
      try {
        const res = await fetch(`/api/kiosk/dashboard?token=${token}`);
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || "Failed to load dashboard");
          return;
        }
        const json = await res.json();
        setData(json);
        setError(null);
      } catch {
        setError("Connection error");
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [token]);

  if (error) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#1a1a2e", color: "#e94560", fontSize: "24px" }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#1a1a2e", color: "#fff", fontSize: "24px" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ background: "#1a1a2e", color: "#fff", minHeight: "100vh", padding: "40px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: "40px" }}>
        <h1 style={{ fontSize: "32px", margin: 0 }}>LISION — {data.kiosk.token_name}</h1>
        <span style={{ color: "#888", fontSize: "14px" }}>
          Updated: {new Date(data.timestamp).toLocaleTimeString()}
        </span>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "24px", marginBottom: "40px" }}>
        <KpiCard title="Scans Today" value={data.kpis.scans_today} />
        <KpiCard title="Active OPs" value={data.kpis.active_ops} />
      </div>

      {data.kpis.lots_by_stage.length > 0 && (
        <div>
          <h2 style={{ fontSize: "24px", marginBottom: "16px" }}>Lots by Stage</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            {data.kpis.lots_by_stage.map((s) => (
              <div key={s.stage_name} style={{ background: "#16213e", borderRadius: "12px", padding: "20px" }}>
                <div style={{ fontSize: "14px", color: "#888", marginBottom: "8px" }}>{s.stage_name}</div>
                <div style={{ fontSize: "36px", fontWeight: "bold" }}>{s.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ background: "#16213e", borderRadius: "12px", padding: "24px" }}>
      <div style={{ fontSize: "14px", color: "#888", marginBottom: "8px" }}>{title}</div>
      <div style={{ fontSize: "48px", fontWeight: "bold" }}>{value}</div>
    </div>
  );
}

/**
 * TV Dashboard page — AC6: liserie.lision.app/tv?token=<uuid>
 * Wrapped in Suspense for useSearchParams (Next.js 14 requirement).
 */
export default function TVDashboard() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#1a1a2e", color: "#fff", fontSize: "24px" }}>
        Loading...
      </div>
    }>
      <TVDashboardContent />
    </Suspense>
  );
}
