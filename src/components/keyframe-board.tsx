'use client';

import { useState } from 'react';
import { formatFcfa } from '@/core/pricing';
import type { ReviewRequest } from '@/core/verification/loop';
import { AdaptedRequests, FullScreen, RelaunchCost, ReviseShotForm, Thumbnail, type Viewed } from './shot-review-panel';

export type BoardShot = {
  shotNumber: number;
  title: string;
  action: string;
  url: string | null;
  state: 'to_approve' | 'approved' | 'correcting' | 'decision' | 'pending';
  canRevise: boolean;
  revisionsLeft: number;
  lastRevision: { feedback: string; reasons: string[]; conflicts: string[] } | null;
  alerts?: string[];
  cost?: ReviewRequest['cost'];
  references?: ReviewRequest['references'];
};
export type Board = { requestedAt: string; remindAt: string; expiresAt: string; remindedAt?: string; expiredAt?: string; shots: BoardShot[] };

const deadlineText = (iso: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso)).replace(':', ' h ');

const STATE_LABELS: Record<BoardShot['state'], string> = {
  to_approve: 'À valider',
  approved: 'Validée',
  correcting: 'Correction en cours',
  decision: 'Décision requise ci-dessus',
  pending: 'Image en préparation',
};

/**
 * 27/10 · keyframe board: the animation (the paid step) waits for the user's validation. In the order of the film,
 * large, with the title and the action of each shot; « Valider » or « Modifier ce plan » shot by shot, or
 * « Tout valider et lancer la vidéo » in one click. 28/10: each shot leaves for its animation as soon as it is validated;
 * the board opens with the first image ready (the others show « Image en préparation »).
 */
export function KeyframeBoard({ versionId, board, priceFcfa, onChanged }: { versionId: string; board: Board; priceFcfa?: number | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [approvedNow, setApprovedNow] = useState<number[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [sent, setSent] = useState<Record<number, string[]>>({});
  const [viewed, setViewed] = useState<Viewed | null>(null);
  if (board.expiredAt) return null;
  const shots = [...board.shots].sort((left, right) => left.shotNumber - right.shotNumber).map((shot) => (
    approvedNow.includes(shot.shotNumber) && shot.state === 'to_approve' ? { ...shot, state: 'approved' as const } : sent[shot.shotNumber] && shot.state === 'to_approve' ? { ...shot, state: 'correcting' as const } : shot
  ));
  const toApprove = shots.filter((shot) => shot.state === 'to_approve').length;
  const waiting = shots.filter((shot) => shot.state === 'correcting' || shot.state === 'decision' || shot.state === 'pending').length;
  const approvedCount = shots.filter((shot) => shot.state === 'approved').length;
  const allDone = toApprove === 0 && waiting === 0;

  async function approve(target: 'all' | number) {
    setBusy(String(target));
    setError('');
    try {
      const response = await fetch(`/api/versions/${versionId}/keyframes/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shots: target === 'all' ? 'all' : [target] }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'La validation n’a pas pu être enregistrée.');
      setApprovedNow((current) => [...current, ...(target === 'all' ? shots.filter((shot) => shot.state === 'to_approve').map((shot) => shot.shotNumber) : [target])]);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La validation n’a pas pu être enregistrée.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id={`keyframes-${versionId}`} aria-labelledby={`keyframes-title-${versionId}`} className="mt-4 scroll-mt-24 rounded-md border border-[#e7c9c6] bg-[#fdf4f3] p-3 md:p-4">
      <h3 id={`keyframes-title-${versionId}`} className="text-sm font-semibold text-[#831810]">
        {allDone ? 'Images clés validées : la vidéo avance' : toApprove ? `${toApprove} image${toApprove > 1 ? 's' : ''} clé${toApprove > 1 ? 's' : ''} à valider` : 'Les images clés arrivent'}
      </h3>
      <p className="mt-1 text-xs leading-5 text-[#6f4a46]">
        Chaque plan part en vidéo, l’étape payante, dès que vous validez son image : inutile d’attendre les autres.{approvedCount ? '' : <> À valider avant le {deadlineText(board.expiresAt)} ; sinon la vidéo expire et rien n’est facturé.</>}
      </p>
      {!allDone && (
        <div className="mt-3 rounded border border-[#eeeae4] bg-white p-3">
          <button type="button" disabled={busy !== null || toApprove === 0} onClick={() => void approve('all')} className="min-h-11 rounded-full bg-[#c51e1c] px-5 text-sm font-semibold text-white disabled:opacity-50">
            {busy === 'all' ? 'Validation…' : waiting ? (toApprove > 1 ? `Valider les ${toApprove} images prêtes` : 'Valider l’image prête') : 'Tout valider et lancer la vidéo'}
          </button>
          <p className="mt-1 text-xs leading-5 text-[#55545a]">
            {waiting ? `${waiting} plan${waiting > 1 ? 's' : ''} en préparation, en correction ou en décision : ${waiting > 1 ? 'ils partiront' : 'il partira'} dès ${waiting > 1 ? 'leur' : 'sa'} validation.` : 'L’animation des derniers plans démarre aussitôt ; le montage suit.'}
            {priceFcfa ? ` Prix de la vidéo : environ ${formatFcfa(priceFcfa)}.` : ''}
          </p>
        </div>
      )}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {shots.map((shot) => {
          const label = `Image clé du plan ${shot.shotNumber} : ${shot.title}`;
          return (
            <article key={shot.shotNumber} className="min-w-0 rounded border border-[#eeeae4] bg-white p-3">
              {shot.url ? (
                <button type="button" onClick={() => setViewed({ src: shot.url!, kind: 'image', label })} className="relative block w-full overflow-hidden rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL of the keyframe */}
                  <img src={shot.url} alt={label} className="aspect-video w-full object-cover" />
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs font-semibold text-white">Agrandir</span>
                </button>
              ) : (
                <div className="grid aspect-video w-full place-items-center rounded bg-[#f3f1ee] text-xs text-[#6b6760]">{shot.state === 'correcting' ? 'Nouvelle image en préparation' : shot.state === 'pending' ? 'Image clé en préparation' : 'Aperçu indisponible'}</div>
              )}
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#242428]">Plan {shot.shotNumber} · {shot.title}</p>
                  {shot.action && <p className="text-xs text-[#55545a]">{shot.action}</p>}
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${shot.state === 'approved' ? 'bg-[#e9f2eb] text-[#42694a]' : shot.state === 'to_approve' ? 'bg-[#f0f4f7] text-[#253b4e]' : 'bg-[#fbf6ed] text-[#765d39]'}`}>{STATE_LABELS[shot.state]}</span>
              </div>
              {shot.references && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Thumbnail src={shot.references.vehicleUrl} label="Photo du véhicule" onOpen={setViewed} />
                  <Thumbnail src={shot.references.placeUrl} label="Photo du lieu" onOpen={setViewed} />
                </div>
              )}
              {/* 28/10 · défaut important laissé passer par le contrôle : à regarder avant de valider. */}
              {shot.alerts?.length ? <p role="note" className="mt-2 border border-[#f0c9c6] bg-[#fae9e7] px-2 py-1 text-xs leading-5 text-[#9d352e]"><b className="font-semibold">À vérifier :</b> {shot.alerts.join(' ; ')}</p> : null}
              {shot.lastRevision?.feedback && <p className="mt-2 text-xs text-[#55545a]">Votre demande : « {shot.lastRevision.feedback} »</p>}
              <AdaptedRequests conflicts={sent[shot.shotNumber] ?? shot.lastRevision?.conflicts ?? []} />
              {shot.state === 'to_approve' && editing !== shot.shotNumber && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void approve(shot.shotNumber)} className="min-h-11 rounded-full border border-[#d8d4cd] bg-white px-4 text-xs font-semibold text-[#242428] disabled:opacity-50">
                    {busy === String(shot.shotNumber) ? 'Validation…' : 'Valider'}
                  </button>
                  {shot.canRevise && (
                    <button type="button" disabled={busy !== null} onClick={() => setEditing(shot.shotNumber)} className="min-h-11 rounded-full border border-[#c51e1c] bg-white px-4 text-xs font-semibold text-[#b21c1a] disabled:opacity-50">Modifier ce plan</button>
                  )}
                </div>
              )}
              {shot.state === 'to_approve' && editing !== shot.shotNumber && shot.canRevise && (
                <p className="mt-1 text-xs leading-5 text-[#55545a]">
                  Modifier : nouvelle image clé et nouveau contrôle{shot.cost ? <> ; <RelaunchCost cost={shot.cost} /></> : null}. {shot.revisionsLeft} modification{shot.revisionsLeft > 1 ? 's' : ''} possible{shot.revisionsLeft > 1 ? 's' : ''}.
                </p>
              )}
              {shot.state === 'to_approve' && !shot.canRevise && shot.revisionsLeft === 0 && (
                <p className="mt-1 text-xs leading-5 text-[#55545a]">Modification utilisée : validez le plan ou annulez la vidéo.</p>
              )}
              {editing === shot.shotNumber && (
                <div className="mt-3">
                  <ReviseShotForm versionId={versionId} shotNumber={shot.shotNumber} cost={shot.cost} onCancel={() => setEditing(null)} onSent={(conflicts) => { setSent((current) => ({ ...current, [shot.shotNumber]: conflicts })); setEditing(null); onChanged(); }} />
                </div>
              )}
            </article>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-[#9d352e]">{error}</p>}
      {viewed && <FullScreen viewed={viewed} onClose={() => setViewed(null)} />}
    </section>
  );
}
