"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";

interface TeamMember {
  rank: number;
  userId: string;
  name: string;
  sector: string | null;
  points: number;
  scanCount: number;
}

type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  week: "Semana",
  month: "Mês",
};

export function TeamRankingCard() {
  const [period, setPeriod] = useState<Period>("today");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/team-ranking?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error("Fetch failed");
        return r.json();
      })
      .then((json) => setMembers(json.data || []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [period]);

  const maxPoints = members[0]?.points || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Trophy className="h-4 w-4" />
            Ranking Equipe
          </CardTitle>
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem dados para o período
          </p>
        ) : (
          members.map((m, i) => {
            const barWidth = Math.round((m.points / maxPoints) * 100);
            const initials = m.name
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();

            return (
              <div
                key={m.userId}
                className="flex items-center gap-3"
                style={{
                  animationDelay: `${i * 80}ms`,
                  animation: "fadeInUp 0.3s ease-out both",
                }}
              >
                {/* Rank */}
                <span className="w-5 text-center font-mono text-xs text-muted-foreground">
                  {m.rank}
                </span>

                {/* Avatar */}
                <div className="size-7 shrink-0 rounded-full bg-accent text-accent-foreground grid place-items-center text-[10px] font-semibold">
                  {initials}
                </div>

                {/* Name + bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium truncate">
                      {m.name}
                    </span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
                      {m.points} pts
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* CSS animation keyframes */}
        <style jsx>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </CardContent>
    </Card>
  );
}
