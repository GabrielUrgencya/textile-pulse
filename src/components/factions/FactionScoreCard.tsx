"use client";

import { Star } from "lucide-react";
import { LisionCard, LisionCardHeader } from "@/components/ui/lision-card";
import { SubMetric } from "@/components/ui/metric-box";

interface FactionScoreCardProps {
  rating: number | null | undefined;
  deliveryScore: number;
  qualityScore: number;
  volumeTotal: number;
}

function StarRating({ value }: { value: number }) {
  const safeValue = Number(value) || 0;
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, safeValue - i));
        return (
          <div key={i} className="relative size-6">
            <Star className="size-6 text-muted-foreground/20" />
            {fill > 0 && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="size-6 text-warning fill-warning" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FactionScoreCard({ rating, deliveryScore, qualityScore, volumeTotal }: FactionScoreCardProps) {
  const safeRating = Number(rating) || 0;
  return (
    <LisionCard>
      <LisionCardHeader eyebrow="Avaliação" title="Score" />
      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <StarRating value={safeRating} />
          <span className="font-display text-2xl font-semibold">
            {safeRating > 0 ? safeRating.toFixed(1) : "Sem avaliação"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <SubMetric label="Pontualidade" value={`${deliveryScore}%`} />
          <SubMetric label="Qualidade" value={`${qualityScore}%`} />
          <SubMetric label="Volume Total" value={String(volumeTotal)} />
        </div>
      </div>
    </LisionCard>
  );
}

export { FactionScoreCard };
