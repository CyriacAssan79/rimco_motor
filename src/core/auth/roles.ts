/**
 * Roles (27/10/2026, docs/specs/ROLES-CREDITS-2026-10-27.md):
 * - collaborateur : creates videos; may also hold the right to validate (profiles.can_validate);
 * - admin         : administrator of the client (RIMCO) — team, media library, credits history; never production costs;
 * - operateur     : KÔMIAN, a role of its own — everything an admin does, plus prices, credits, provider costs,
 *                   models, fal key, comparison and storage.
 * Pure functions: no Next.js, no Supabase, so they are unit-tested and shared by routes, pages and components.
 */
export const ROLES = ['collaborateur', 'admin', 'operateur'] as const;
export type Role = (typeof ROLES)[number];

export type RoleSubject = { role: string; canValidate?: boolean | null };

/** KÔMIAN operator: provider costs, prices, credits, models, fal key, comparison, storage. */
export function isOperator(subject: RoleSubject | null | undefined): boolean {
  return subject?.role === 'operateur';
}

/** Client administration rights (team, media library, settings); an operator always has them. */
export function hasAdminRights(subject: RoleSubject | null | undefined): boolean {
  return subject?.role === 'admin' || subject?.role === 'operateur';
}

/** May approve or refuse a video: an administrator, an operator, or a collaborator holding the right. */
export function canValidate(subject: RoleSubject | null | undefined): boolean {
  return hasAdminRights(subject) || subject?.canValidate === true;
}

/** `requireRole('admin')` is also satisfied by an operator, who inherits every administrator right. */
export function roleSatisfies(role: string, required: readonly string[]): boolean {
  return required.includes(role) || (role === 'operateur' && required.includes('admin'));
}

/**
 * A profile read before migration 0041 may still carry the former role « valideur »:
 * it becomes a collaborator holding the right to validate, as the migration does.
 */
export function normalizeProfileRole(rawRole: unknown, rawCanValidate: unknown): { role: Role; canValidate: boolean } {
  if (rawRole === 'valideur') return { role: 'collaborateur', canValidate: true };
  const role: Role = rawRole === 'admin' || rawRole === 'operateur' ? rawRole : 'collaborateur';
  return { role, canValidate: rawCanValidate === true };
}

/** Plain French label shown under the user's name and in the team list. */
export function roleLabel(subject: RoleSubject): string {
  if (subject.role === 'operateur') return 'Opérateur KÔMIAN';
  if (subject.role === 'admin') return 'Administrateur';
  return subject.canValidate ? 'Collaborateur · valideur' : 'Collaborateur';
}

/** Which roles an actor may assign: only an operator can create or promote an operator. */
export function assignableRoles(actor: RoleSubject): Role[] {
  return isOperator(actor) ? ['collaborateur', 'admin', 'operateur'] : ['collaborateur', 'admin'];
}
