"use client";

import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export default function Page() {
  return <ModulePlaceholder title="Configurações" icon={<Settings className="size-16 text-foreground opacity-20 mb-8" strokeWidth={1.5} />} />;
}