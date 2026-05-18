"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Algo deu errado</h2>
          <p>Um erro inesperado ocorreu. A equipe foi notificada.</p>
          <button onClick={() => reset()} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
