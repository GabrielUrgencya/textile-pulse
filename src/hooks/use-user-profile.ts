"use client";

import { useEffect, useState } from "react";

export interface UserProfile {
  id: string;
  fullName: string;
  role: string;
  initials: string;
  email: string;
  sector: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

interface UseUserProfileReturn {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
}

export function useUserProfile(): UseUserProfileReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile", { credentials: "same-origin" });
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 401 ? "Não autenticado" : "Erro ao carregar perfil");
            setIsLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setProfile(data.data);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Erro de conexão");
          setIsLoading(false);
        }
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  return { profile, isLoading, error };
}
