export function isOrderConfirmationCronAuthorized(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
): boolean {
  return Boolean(cronSecret && authorizationHeader === `Bearer ${cronSecret}`);
}
