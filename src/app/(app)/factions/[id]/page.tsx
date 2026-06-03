"use client";

import { FactionDetail } from "@/components/factions/FactionDetail";

export default function Page({ params }: { params: { id: string } }) {
  return <FactionDetail factionId={params.id} />;
}
