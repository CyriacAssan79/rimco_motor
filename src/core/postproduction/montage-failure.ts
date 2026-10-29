export const MAX_MONTAGE_ATTEMPTS = 3;

/** Pure decision for a failed montage attempt: count it and turn the version to `failed` after the last attempt. */
export function montageFailureDecision(previousAttempts: unknown, message: string) {
  const attempts = (Number.isInteger(previousAttempts) && Number(previousAttempts) > 0 ? Number(previousAttempts) : 0) + 1;
  const cause = /introuvable|indisponible|ENOENT/i.test(message) ? 'FFmpeg ou le logo est introuvable sur ce déploiement'
    : /délai|SIGKILL|timeout/i.test(message) ? 'le montage dépasse le délai autorisé'
      : 'le montage a échoué';
  return { attempts, final: attempts >= MAX_MONTAGE_ATTEMPTS, userMessage: `Montage impossible : ${cause}. Les plans générés sont conservés : un Manager peut relancer le montage sans nouveau coût fal. Détail : ${message.slice(0, 200)}` };
}
