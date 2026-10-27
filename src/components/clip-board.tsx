"use client";
import { useState } from 'react';
import { describeDefects } from '@/core/verification/defects';
import type { ClipBoard as Board } from '@/core/versions/clip-gate';
import { AdaptedRequests, FullScreen, RelaunchCost, ReviseShotForm, type Viewed } from './shot-review-panel';

export function ClipBoard({ versionId, board, onChanged }: { versionId: string; board: Board; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ number: number; scope: 'clip' | 'full' } | null>(null);
  const [viewed, setViewed] = useState<Viewed | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  async function action(action: 'approve' | 'unapprove' | 'disable' | 'enable', shotNumber?: number) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/versions/${versionId}/clips/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...(shotNumber ? { shotNumber } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'La décision n’a pas pu être enregistrée.');
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'La décision n’a pas pu être enregistrée.'); }
    finally { setBusy(false); }
  }
  async function preview() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/versions/${versionId}/clips/preview`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'L’aperçu n’a pas pu être préparé.');
      setViewed({ src: data.url, kind: 'video', label: 'Enchaînement des clips actifs · sans logo ni musique' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'L’aperçu n’a pas pu être préparé.'); }
    finally { setBusy(false); }
  }
  const remaining = board.shots.filter((shot) => shot.active && !shot.approved).length;
  const buttonClass = 'min-h-11 rounded-full border border-[#d8d4cd] bg-white px-4 text-xs font-semibold disabled:opacity-50';
  return <section id={`decision-${versionId}`} className="mt-4 scroll-mt-24 rounded-md border border-[#e7d7b9] bg-[#fbf6ed] p-4" aria-label="Validation des clips">
    <h3 className="text-sm font-semibold">{remaining} clip{remaining > 1 ? 's' : ''} à valider</h3>
    <p className="mt-1 text-xs leading-5">Le montage attend votre validation. Durée finale : {board.durationSeconds} s, dont 2 s de logo. Le prix client ne change pas.</p>
    {board.releasedAt && <p className="mt-2 text-xs">Vos clips sont conservés ; une modification réservera à nouveau son coût.</p>}
    <button type="button" className={`${buttonClass} mt-3`} disabled={busy} onClick={() => void preview()}>{busy ? 'Préparation…' : 'Voir l’enchaînement'}</button>
    <AdaptedRequests conflicts={conflicts} />
    <div className="mt-3 grid gap-4 lg:grid-cols-2">{board.shots.map((shot) => {
      const colour = shot.colour === 'green' ? 'border-[#75a47e] bg-[#f0f7f1]' : shot.colour === 'orange' ? 'border-[#cda353] bg-[#fff8ea]' : 'border-[#d17a73] bg-[#fdf0ef]';
      return <article key={shot.shotNumber} className={`rounded border p-3 ${colour} ${!shot.active ? 'opacity-60' : ''}`} aria-label={`Clip ${shot.shotNumber}`}>
        <h4 className="text-sm font-semibold">Plan {shot.shotNumber} · {shot.title}</h4>
        <p className="mt-1 text-xs">{shot.action}</p>
        {shot.url && <video src={shot.url} loop muted autoPlay playsInline controls preload="metadata" className="mt-2 aspect-video w-full rounded bg-black" aria-label={`Clip du plan ${shot.shotNumber}`} />}
        <p className="mt-2 text-xs font-semibold">{!shot.active ? 'Clip désactivé' : shot.approved ? 'Validé' : shot.colour === 'red' ? 'Refusé par le contrôle automatique' : shot.colour === 'orange' ? 'Accepté avec avertissements' : 'Accepté par le contrôle automatique'}</p>
        <ul className="mt-1 space-y-1 text-xs">{describeDefects(shot.issues, shot.codes).map((defect, i) => <li key={i}>{defect.label}{defect.at ? ` (${defect.at})` : ''}</li>)}</ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {shot.active && <button type="button" className={buttonClass} disabled={busy} onClick={() => void action(shot.approved ? 'unapprove' : 'approve', shot.shotNumber)}>{shot.approved ? 'Retirer la validation' : shot.colour === 'red' ? 'Accepter' : 'Valider'}</button>}
          <button type="button" className={buttonClass} disabled={busy || shot.active && board.shots.filter((item) => item.active).length <= 1} onClick={() => void action(shot.active ? 'disable' : 'enable', shot.shotNumber)}>{shot.active ? 'Désactiver ce clip' : 'Réactiver ce clip'}</button>
        </div>
        {shot.active && shot.canRevise && !editing && <div className="mt-2 space-y-2">{(['clip', 'full'] as const).map((scope) => { const cost = shot.clipOptions?.[scope]; return cost ? <div key={scope}><button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing({ number: shot.shotNumber, scope })}>{scope === 'clip' ? 'Modifier la vidéo du plan' : 'Revenir à l’image clé'}</button><p className="mt-1 text-xs"><RelaunchCost cost={cost} withMinutes={false} /> · {shot.revisionsLeft ?? 1} modification{(shot.revisionsLeft ?? 1) > 1 ? 's' : ''} possible{(shot.revisionsLeft ?? 1) > 1 ? 's' : ''} pour le clip.</p></div> : null; })}</div>}
        {!shot.canRevise && <p className="mt-2 text-xs">Modification utilisée</p>}
        {editing?.number === shot.shotNumber && <div className="mt-3"><ReviseShotForm versionId={versionId} shotNumber={shot.shotNumber} scope={editing.scope} cost={shot.clipOptions?.[editing.scope] ?? undefined} onCancel={() => setEditing(null)} onSent={(conflicts) => { setConflicts(conflicts); setEditing(null); onChanged(); }} /></div>}
      </article>;
    })}</div>
    <button type="button" className="mt-4 min-h-11 rounded-full bg-[#c51e1c] px-5 text-xs font-semibold text-white disabled:opacity-50" disabled={busy || editing !== null} onClick={() => void action('approve')}>Tout valider et lancer le montage</button>
    {error && <p role="alert" className="mt-2 text-xs text-[#9d352e]">{error}</p>}
    {viewed && <FullScreen viewed={viewed} onClose={() => setViewed(null)} />}
  </section>;
}
