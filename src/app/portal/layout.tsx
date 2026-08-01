import type { Metadata, Viewport } from "next";
import { InstallPrompt } from "./install-prompt";

export const metadata: Metadata = {
  title: "Lision",
  description: "Portal de acompanhamento para facções da Liserie",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lision",
  },
  // Substituto moderno da tag apple-mobile-web-app-capable (deprecada).
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {children}
      <InstallPrompt />
    </div>
  );
}
