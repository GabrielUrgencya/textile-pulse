import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Escape LIKE/ILIKE wildcard characters for safe search queries */
export function escapeLikePattern(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
