/** Postgres rejected the query while evaluating row security for a role that cannot run the helper. */
export function isRlsPermissionError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "42501") return true;
  const message = error.message ?? "";
  return /permission denied for function/i.test(message) || /row-level security/i.test(message);
}
