/**
 * Status of a video in the library (audit UX 26/10, #3): « Prête » means generated and not yet approved;
 * « Validée » only after the validator's approval (the list maps an approved video to `ready` + validationStatus).
 */
export type LibraryStatus = 'ready' | 'approved' | 'review' | 'rejected' | 'generating' | 'failed' | 'cancelled' | 'draft';

export const LIBRARY_STATUS_LABELS: Record<LibraryStatus, string> = {
  ready: 'Prête',
  approved: 'Validée',
  review: 'En validation',
  rejected: 'Refusée',
  generating: 'En cours',
  failed: 'Échec',
  cancelled: 'Annulée',
  draft: 'Brouillon',
};

/** Tabs of the library, in this order; « all » shows everything. */
export const LIBRARY_TABS: Array<['all' | LibraryStatus, string]> = [
  ['all', 'Tous les statuts'], ['ready', 'Prêtes'], ['review', 'En validation'], ['approved', 'Validées'], ['rejected', 'Refusées'], ['generating', 'En cours'],
];

export function libraryStatus(video: { status: string; validationStatus?: string | null }): LibraryStatus {
  if (video.status === 'approved' || (video.status === 'ready' && video.validationStatus === 'approved')) return 'approved';
  if (video.status === 'queued' || video.status === 'postprocessing') return 'generating';
  return (video.status in LIBRARY_STATUS_LABELS ? video.status : 'draft') as LibraryStatus;
}
