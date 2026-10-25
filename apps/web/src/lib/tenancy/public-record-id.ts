/** Org and form ids on public URLs. Rejects values PostgREST cannot cast to uuid. */
const PUBLIC_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPublicRecordId(value: string): boolean {
  return PUBLIC_ID.test(value);
}
