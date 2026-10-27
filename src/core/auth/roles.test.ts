import { describe, expect, it } from 'vitest';
import { assignableRoles, canValidate, hasAdminRights, isOperator, normalizeProfileRole, roleLabel, roleSatisfies } from './roles';
import { withoutInternalFields } from './internal-fields';
import { generateTemporaryPassword } from './temporary-password';

describe('rôles du 27/10 : collaborateur, admin (client), operateur (KÔMIAN)', () => {
  it('donne à l’opérateur tous les droits d’admin, et les droits internes à lui seul', () => {
    expect(hasAdminRights({ role: 'operateur' })).toBe(true);
    expect(hasAdminRights({ role: 'admin' })).toBe(true);
    expect(hasAdminRights({ role: 'collaborateur', canValidate: true })).toBe(false);
    expect(isOperator({ role: 'operateur' })).toBe(true);
    expect(isOperator({ role: 'admin' })).toBe(false);
    expect(roleSatisfies('operateur', ['admin'])).toBe(true);
    expect(roleSatisfies('admin', ['operateur'])).toBe(false);
    expect(roleSatisfies('collaborateur', ['collaborateur', 'admin'])).toBe(true);
  });

  it('fait de « valider » un droit : collaborateur coché, admin et opérateur toujours', () => {
    expect(canValidate({ role: 'collaborateur', canValidate: true })).toBe(true);
    expect(canValidate({ role: 'collaborateur', canValidate: false })).toBe(false);
    expect(canValidate({ role: 'admin' })).toBe(true);
    expect(canValidate({ role: 'operateur' })).toBe(true);
    expect(canValidate(null)).toBe(false);
  });

  it('lit un ancien profil « valideur » comme un collaborateur qui peut valider (avant la migration 0041)', () => {
    expect(normalizeProfileRole('valideur', null)).toEqual({ role: 'collaborateur', canValidate: true });
    expect(normalizeProfileRole('admin', false)).toEqual({ role: 'admin', canValidate: false });
    expect(normalizeProfileRole('inconnu', true)).toEqual({ role: 'collaborateur', canValidate: true });
  });

  it('ne laisse attribuer le rôle opérateur que par un opérateur', () => {
    expect(assignableRoles({ role: 'admin' })).toEqual(['collaborateur', 'admin']);
    expect(assignableRoles({ role: 'operateur' })).toContain('operateur');
  });

  it('affiche le rôle en clair', () => {
    expect(roleLabel({ role: 'operateur' })).toBe('Opérateur KÔMIAN');
    expect(roleLabel({ role: 'collaborateur', canValidate: true })).toBe('Collaborateur · valideur');
  });
});

describe('champs internes KÔMIAN', () => {
  const payload = { id: 'v1', estimatedPriceFcfa: 9200, prompt: 'locked layer', storyboardCostUsd: 0.02, storyboardCostFcfa: 16, costPlanUsd: { nominal: 3 } };
  it('retire coûts en dollars et prompts pour tout autre rôle que l’opérateur', () => {
    expect(withoutInternalFields({ role: 'admin' }, payload)).toEqual({ id: 'v1', estimatedPriceFcfa: 9200 });
    expect(withoutInternalFields({ role: 'collaborateur' }, payload)).toEqual({ id: 'v1', estimatedPriceFcfa: 9200 });
    expect(withoutInternalFields({ role: 'operateur' }, payload)).toEqual(payload);
  });
});

describe('mot de passe provisoire généré par le serveur', () => {
  it('compte 16 caractères, sans caractère ambigu, et change à chaque appel', () => {
    const first = generateTemporaryPassword();
    expect(first).toHaveLength(16);
    expect(first).not.toMatch(/[0O1lI]/);
    expect(first).toMatch(/[!@#$%*?]/);
    expect(generateTemporaryPassword()).not.toBe(first);
    expect(() => generateTemporaryPassword(8)).toThrow();
  });
});
