export const HEART_FLAG_PATH = "/flags/heart.svg";

export function isDenoName(name: string | null | undefined): boolean {
  const normalized = name?.trim().toLowerCase();
  return normalized === "deno" || /^deno\.\d+$/.test(normalized ?? "");
}
