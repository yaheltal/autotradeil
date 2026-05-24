import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` — merge Tailwind class names safely.
 *
 * Built on `clsx` (conditional class composition) + `tailwind-merge`
 * (which resolves conflicting Tailwind utilities so the last one wins —
 * e.g., `cn("p-md", "p-lg")` returns just `"p-lg"`). This is the shadcn
 * convention; every shadcn primitive imports it.
 *
 * Usage:
 *   <div className={cn("p-md", isActive && "bg-accent", className)} />
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
