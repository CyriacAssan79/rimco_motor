/**
 * 29/10 · O03 · qui peut télécharger le MP4 d'une vidéo. Sans validation (réglage du client, désactivé par défaut),
 * une vidéo prête se télécharge tout de suite par son auteur, le Manager du client ou KÔMIAN. Avec validation, seule
 * une vidéo approuvée se télécharge (comportement d'avant le 29/10) ; l'opérateur KÔMIAN garde toujours l'accès.
 * Fonction pure : la route /api/versions ne signe un lien de téléchargement que si elle renvoie true.
 */
export type DownloadSubject = {
  videoStatus: string;
  isOwner: boolean;
  /** Manager du client ou opérateur (hasAdminRights), dans le périmètre déjà filtré par la route. */
  adminRights: boolean;
  operator: boolean;
  validationEnabled: boolean;
};

export function canDownloadVideo(subject: DownloadSubject): boolean {
  if (subject.videoStatus === 'approved') return true;
  if (subject.videoStatus !== 'ready') return false;
  if (subject.operator) return true;
  return !subject.validationEnabled && (subject.isOwner || subject.adminRights);
}
