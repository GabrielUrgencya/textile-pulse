import type { Metadata } from "next";
import { SalesTvWorkspace } from "@/components/sales/tv/SalesTvWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer" };

const bootstrap = `(()=>{try{const u=new URL(location.href);const h=new URLSearchParams(u.hash.slice(1));const token=h.get("token");const periodKey=h.get("periodKey");history.replaceState(null,"",u.pathname+u.search);Object.defineProperty(window,"__salesTvBootstrap",{value:{token,periodKey},configurable:true});}catch{Object.defineProperty(window,"__salesTvBootstrap",{value:{token:null,periodKey:null},configurable:true});}})();`;

export default function SalesTvPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      <SalesTvWorkspace />
    </>
  );
}
