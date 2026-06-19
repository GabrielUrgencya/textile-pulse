"use client";

import { useEffect, useState } from "react";

interface UsePermissionsReturn {
  permissions: Set<string>;
  can: (permission: string) => boolean;
  isLoading: boolean;
}

/**
 * Story 8.22 — Hook that fetches effective permissions for the logged-in user.
 * Uses the dynamic permission engine (defaults + overrides from DB).
 */
export function usePermissions(): UsePermissionsReturn {
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPermissions() {
      try {
        const res = await fetch("/api/me/permissions", {
          credentials: "same-origin",
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setPermissions(new Set(data.permissions));
          }
        }
      } catch {
        // Fallback: empty set (no permissions) — APIs still enforce server-side
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    permissions,
    can: (permission: string) => permissions.has(permission),
    isLoading,
  };
}
