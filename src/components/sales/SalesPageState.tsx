"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SalesPageStateKind = "empty" | "disabled" | "forbidden" | "unavailable";

export function SalesPageState({
  kind,
  title,
  description,
  action,
  branded = false,
}: {
  kind: SalesPageStateKind;
  title: string;
  description: string;
  action?: { href: string; label: string };
  branded?: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <Card className="mx-auto w-full max-w-2xl border-border bg-card shadow-[var(--shadow-elegant)]">
      <CardContent className="p-6 text-center sm:p-10">
        {branded ? <BrandLogo className="mx-auto mb-6 h-8 w-auto !invert" priority /> : null}
        <p
          className={cn(
            "mb-3 text-xs font-semibold uppercase tracking-[0.18em]",
            kind === "unavailable" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {kind === "empty" ? "Próxima etapa" : "LISION Vendas"}
        </p>
        <h1 ref={titleRef} tabIndex={-1} className="text-2xl font-semibold outline-none sm:text-3xl">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          {description}
        </p>
        {action ? (
          <Button asChild className="mt-7 min-h-11">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
