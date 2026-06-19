"use client";

import * as React from "react";
import { User, Building, Layers, Target, Key, Tag, Gauge, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileEdit } from "./ProfileEdit";
import { TenantSettings } from "./TenantSettings";
import { StageManager } from "./StageManager";
import { TargetsConfig } from "./TargetsConfig";
import { ReferencesConfig } from "./ReferencesConfig";
import { AdvancedTargetsConfig } from "./AdvancedTargetsConfig";
import { TokenManager } from "./TokenManager";
import { PermissionsEditor } from "./PermissionsEditor";

const TABS = [
  { id: "profile", label: "Perfil", icon: User },
  { id: "tenant", label: "Empresa", icon: Building },
  { id: "stages", label: "Etapas de Produção", icon: Layers },
  { id: "targets", label: "Metas", icon: Target },
  { id: "references", label: "Referências", icon: Tag },
  { id: "advanced", label: "Metas Avançadas", icon: Gauge },
  { id: "permissions", label: "Permissões", icon: Shield },
  { id: "tokens", label: "Tokens de Acesso", icon: Key },
] as const;

type TabId = (typeof TABS)[number]["id"];

function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<TabId>("profile");

  return (
    <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 lg:py-8 space-y-6">
      <PageHeader eyebrow="Sistema" title="Configurações" />

      <div className="flex flex-col md:flex-row gap-6">
        {/* Vertical tabs — desktop */}
        <nav className="hidden md:flex flex-col w-[240px] shrink-0 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left",
                  active
                    ? "bg-secondary/50 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Horizontal tabs — mobile */}
        <nav className="md:hidden flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-colors shrink-0",
                  active
                    ? "bg-secondary/50 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && <ProfileEdit />}
          {activeTab === "tenant" && <TenantSettings />}
          {activeTab === "stages" && <StageManager />}
          {activeTab === "targets" && <TargetsConfig />}
          {activeTab === "references" && <ReferencesConfig />}
          {activeTab === "advanced" && <AdvancedTargetsConfig />}
          {activeTab === "permissions" && <PermissionsEditor />}
          {activeTab === "tokens" && <TokenManager />}
        </div>
      </div>
    </div>
  );
}

export { SettingsPage };
