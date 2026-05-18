"use client";

import { Factory } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function Page() {
  return <ModulePlaceholder title="Produção" icon={<Factory className="size-16 text-foreground opacity-20 mb-8" strokeWidth={1.5} />} />;
}