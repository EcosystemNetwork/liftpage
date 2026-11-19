/**
 * Who may hold the admin role. Only these accounts see /admin, the desk, and the client
 * tools; every other account is a client, whatever its profile row says.
 *
 * Kept in step with the profiles_admin_is_owner constraint in
 * supabase/migrations/20261118000200_admin_tools.sql. Change both together.
 */
export const OWNER_EMAILS: readonly string[] = ["ericnans@gmail.com", "1126kentziti@gmail.com", "cesar.cruz2622@gmail.com"];

export function isOwnerEmail(email: string | null | undefined): boolean {
  return Boolean(email) && OWNER_EMAILS.includes(email!.trim().toLowerCase());
}

/** The role an account actually gets. "admin" in the database without an owner email is a client. */
export function effectiveRole(role: string, email: string): "admin" | "client" {
  return role === "admin" && isOwnerEmail(email) ? "admin" : "client";
}
