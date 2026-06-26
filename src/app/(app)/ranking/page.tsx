"use client";

import { Lock } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LisionCard } from "@/components/ui/lision-card";
import { useServerData } from "@/hooks/use-server-data";
import { useUserProfile } from "@/hooks/use-user-profile";
import { TVPodium } from "@/components/tv/TVPodium";

interface RankEntry {
  id: string;
  name: string;
  initials: string;
  photo_url: string | null;
  score: number;
  punctuality: number;
  quality: number;
  volume: number;
  deliveries_count: number;
}

/* Avatar: foto ou placeholder por iniciais */
function FactionAvatar({ entry, size }: { entry: RankEntry; size: number }) {
  const cls = "rounded-full object-cover border border-border/50 bg-secondary";
  if (entry.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entry.photo_url} alt={entry.name} width={size} height={size} className={cls} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full grid place-items-center bg-secondary border border-border/50 font-display font-semibold text-muted-foreground"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {entry.initials}
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function RankingPage() {
  const { profile, isLoading: profileLoading } = useUserProfile();
  const { data, isLoading } = useServerData<RankEntry[]>("/api/ranking");

  // AC7: guard ADMIN
  if (!profileLoading && profile && profile.role !== "ADMIN") {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-16 text-center">
        <Lock className="size-10 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-[18px] font-semibold">Acesso restrito</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Este módulo é exclusivo para administradores.</p>
      </div>
    );
  }

  const ranking = data || [];
  // Pódio rico (migrado da TV): mapeia photo_url → avatar_url esperado pelo TVPodium
  const podiumTop3 = ranking.slice(0, 3).map((e) => ({ ...e, avatar_url: e.photo_url }));

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
      <PageHeader eyebrow="Facções" title="Ranking de Facções" />

      {isLoading ? (
        <div className="h-40 rounded-2xl bg-secondary/30 animate-pulse" />
      ) : ranking.length === 0 ? (
        <LisionCard>
          <div className="text-center py-10 text-[13px] text-muted-foreground">
            Nenhuma facção para ranquear ainda.
          </div>
        </LisionCard>
      ) : (
        <>
          {/* Pódio rico migrado da TV (escudo + animações + foto). Wrapper responsivo:
              em telas pequenas permite rolagem horizontal sem quebrar o layout/animações. */}
          <div className="mb-8 overflow-x-auto">
            <div className="min-w-[640px] py-4 flex justify-center">
              <TVPodium ranking={podiumTop3} />
            </div>
          </div>

          {/* Lista completa */}
          <LisionCard pad={false}>
            <div className="px-5 py-3 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40 grid grid-cols-[40px_1fr_auto] gap-3">
              <span>#</span>
              <span>Facção</span>
              <span className="text-right">Pontuação</span>
            </div>
            {ranking.map((entry, i) => (
              <div
                key={entry.id}
                className={`px-5 py-3 grid grid-cols-[40px_1fr_auto] gap-3 items-center border-b border-border/30 last:border-0 ${
                  i < 3 ? "bg-secondary/20" : ""
                }`}
              >
                <span className="font-mono tabular-nums text-[13px] text-muted-foreground">
                  {i < 3 ? MEDALS[i] : `${i + 1}º`}
                </span>
                <div className="flex items-center gap-3 min-w-0">
                  <FactionAvatar entry={entry} size={36} />
                  <span className="text-[13px] font-medium truncate">{entry.name}</span>
                </div>
                <span className="font-display text-[16px] font-semibold tabular-nums text-right">{entry.score}</span>
              </div>
            ))}
          </LisionCard>
        </>
      )}
    </div>
  );
}
