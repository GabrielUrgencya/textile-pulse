"use client";

import { TeamPage } from "@/components/team/TeamPage";
import { UserStagesCard } from "@/components/team/UserStagesCard";

export default function Page() {
  return (
    <>
      <TeamPage />
      {/* Story 9.4 — atribuição de setor(es) por colaborador */}
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pb-10">
        <UserStagesCard />
      </div>
    </>
  );
}
