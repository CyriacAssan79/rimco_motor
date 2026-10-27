"use client";

import { useEffect, useState } from "react";
import { formatFcfa } from "@/core/pricing";
import { describeDefects } from "@/core/verification/defects";
import { REVISION_REASON_IDS, REVISION_REASONS, USER_FEEDBACK_MAX_LENGTH, type ReviewRequest, type RevisionReason } from "@/core/verification/loop";

/** Requests adapted to the brand rules, shown with the corrected shot (same wording as the Studio brief). */
export function AdaptedRequests({ conflicts, title = "Votre demande a été adaptée aux règles de la marque" }: { conflicts: string[]; title?: string }) {
  if (!conflicts.length) return null;
  return (
    <div role="status" className="mt-2 rounded-md border border-[#e7d7b9] bg-[#fbf6ed] p-3 text-xs leading-5 text-[#765d39]">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">{conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>
    </div>
  );
}

export type Viewed = { src: string; kind: "image" | "video"; label: string };

/** Relaunch cost: FCFA for everyone, dollars added for an administrator only (sent by the server by role). */
export function relaunchCostText(cost: NonNullable<ReviewRequest["cost"]>) {
  const usd = cost.usd != null ? ` (${cost.usd.toFixed(2).replace(".", ",")} $)` : "";
  return `environ ${formatFcfa(cost.fcfa)}${usd}, environ ${cost.minutes} min`;
}

/**
 * « Modifier ce plan » (27/10): closed-list reasons and/or a comment (400 characters), the cost in FCFA, then
 * « Lancer la correction ». Shared by the decision panel and the keyframe board.
 */
export function ReviseShotForm({ versionId, shotNumber, cost, scope, onSent, onCancel }: { versionId: string; shotNumber: number; cost?: ReviewRequest["cost"]; scope?: 'clip' | 'full'; onSent: (conflicts: string[]) => void; onCancel: () => void }) {
  const [reasons, setReasons] = useState<RevisionReason[]>([]);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/versions/${versionId}/shots/${shotNumber}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "revise", feedback: feedback.trim(), reasons, ...(scope ? { scope } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "La correction n’a pas pu être lancée.");
      onSent(Array.isArray(data.feedbackConflicts) ? data.feedbackConflicts : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La correction n’a pas pu être lancée.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-md border border-[#e7c9c6] bg-[#fffafa] p-3">
      <fieldset>
        <legend className="text-xs font-semibold text-[#242428]">Qu’est-ce qui ne va pas ?</legend>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {REVISION_REASON_IDS.map((reason) => (
            <label key={reason} className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-[#242428]">
              <input type="checkbox" checked={reasons.includes(reason)} onChange={() => setReasons((current) => current.includes(reason) ? current.filter((value) => value !== reason) : [...current, reason])} className="size-4 accent-[#c51e1c]" />
              {REVISION_REASONS[reason].fr}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1 text-xs font-semibold text-[#242428]">
        Précisez ce que vous voulez
        <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={USER_FEEDBACK_MAX_LENGTH} rows={3} placeholder="Ex. la voiture est coupée à gauche : je la veux entière, arrivant de la droite vers la caméra." className="rounded-md border border-[#d2cec6] bg-white p-2 text-xs font-normal outline-none focus:border-[#c51e1c]" />
        <span className="text-xs font-normal text-[#626269]">{feedback.length}/{USER_FEEDBACK_MAX_LENGTH} caractères · les règles de la marque restent appliquées.</span>
      </label>
      {cost && <p className="text-xs text-[#55545a]">Coût de la correction : {relaunchCostText(cost)}.</p>}
      {error && <p role="alert" className="text-xs text-[#9d352e]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || (!reasons.length && !feedback.trim())} className="min-h-11 rounded-full bg-[#c51e1c] px-4 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? "Envoi au réalisateur…" : "Lancer la correction"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full border border-[#d8d4cd] bg-white px-4 text-xs font-semibold text-[#242428]">Annuler</button>
      </div>
    </form>
  );
}

/** Full-screen view of a refused image, a clip or a reference photo; Escape or a click outside closes it. */
export function FullScreen({ viewed, onClose }: { viewed: Viewed; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={viewed.label} onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4">
      <div className="relative w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} autoFocus className="absolute -top-12 right-0 min-h-10 rounded-full bg-white px-4 text-xs font-semibold text-[#242428]">Fermer</button>
        {viewed.kind === "video"
          ? <video src={viewed.src} controls autoPlay muted playsInline className="max-h-[85vh] w-full rounded bg-black object-contain" aria-label={viewed.label} />
          : // eslint-disable-next-line @next/next/no-img-element -- signed URL shown full size, as is
            <img src={viewed.src} alt={viewed.label} className="max-h-[85vh] w-full rounded object-contain" />}
        <p className="mt-2 text-center text-xs text-white">{viewed.label}</p>
      </div>
    </div>
  );
}

export function Thumbnail({ src, label, onOpen }: { src: string | null; label: string; onOpen: (viewed: Viewed) => void }) {
  return (
    <figure className="min-w-0">
      {src ? (
        <button type="button" onClick={() => onOpen({ src, kind: "image", label })} className="block w-full overflow-hidden rounded border border-[#eeeae4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c]">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL or public reference photo */}
          <img src={src} alt={label} className="aspect-video w-full object-cover" />
        </button>
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded bg-[#f3f1ee] text-xs text-[#6b6760]">Photo indisponible</div>
      )}
      <figcaption className="mt-1 text-xs text-[#55545a]">{label}</figcaption>
    </figure>
  );
}

/**
 * Shots stopped by a verifier: nothing is animated or edited without a decision. Each choice says what will happen
 * and what it costs. « Annuler la vidéo » reuses the cancellation of the generation (reservations released).
 */
export function ShotReviewPanel({
  versionId,
  items,
  onChanged,
}: {
  versionId: string;
  items: ReviewRequest[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [viewed, setViewed] = useState<Viewed | null>(null);
  /** « Modifier ce plan »: the open form, and the corrections sent (kept in the card until the shot comes back). */
  const [editing, setEditing] = useState<number | null>(null);
  const [sent, setSent] = useState<Array<{ shotNumber: number; title: string; conflicts: string[] }>>([]);
  const shownSent = sent.filter((entry) => !items.some((item) => item.shotNumber === entry.shotNumber));
  if (!items.length && !shownSent.length) return null;
  const ordered = [...items].sort((left, right) => left.shotNumber - right.shotNumber || (left.stage === "keyframe" ? -1 : 1));

  async function decide(item: ReviewRequest, decision: "accept") {
    const shotNumber = item.shotNumber;
    setBusy(`${shotNumber}-${decision}`);
    setError("");
    try {
      const response = await fetch(`/api/versions/${versionId}/shots/${shotNumber}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "La décision n’a pas pu être enregistrée.");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La décision n’a pas pu être enregistrée.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelVideo() {
    setBusy("cancel");
    setError("");
    try {
      const response = await fetch(`/api/versions/${versionId}/cancel`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "La vidéo n’a pas pu être annulée.");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La vidéo n’a pas pu être annulée.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      id={`decision-${versionId}`}
      aria-labelledby={`review-${versionId}`}
      className="mt-4 scroll-mt-24 rounded-md border border-[#e7c9c6] bg-[#fdf4f3] p-3 md:p-4"
    >
      <h3 id={`review-${versionId}`} className="text-sm font-semibold text-[#831810]">
        {ordered.length > 1 ? `${ordered.length} décisions requises` : ordered.length ? "Décision requise" : "Correction en cours"}
      </h3>
      {ordered.length > 0 && <p className="mt-1 text-xs leading-5 text-[#6f4a46]">
        Le contrôle automatique refuse encore {ordered.length > 1 ? "ces plans" : "ce plan"} après les corrections du réalisateur. Rien n’est animé ni monté sans votre accord.
      </p>}
      {shownSent.map((entry) => (
        <article key={`sent-${entry.shotNumber}`} aria-live="polite" className="mt-3 rounded border border-[#eeeae4] bg-white p-3 text-xs leading-5 text-[#55545a]">
          <p className="text-sm font-semibold text-[#242428]">Plan {entry.shotNumber} · {entry.title} : correction en cours</p>
          <p className="mt-1">Le réalisateur corrige le plan selon vos indications, puis une nouvelle image clé est produite et contrôlée. Si elle est encore refusée, elle reviendra ici.</p>
          <AdaptedRequests conflicts={entry.conflicts} />
          <button type="button" onClick={() => setSent((current) => current.filter((item) => item.shotNumber !== entry.shotNumber))} className="mt-1 min-h-11 text-xs font-semibold text-[#55545a] underline underline-offset-2">Masquer</button>
        </article>
      ))}
      <div className="mt-3 grid gap-3">
        {ordered.map((item) => {
          const defects = describeDefects(item.issues, item.codes);
          const kindLabel = item.stage === "keyframe" ? "image clé" : "clip";
          const previewLabel = `${item.stage === "keyframe" ? "Image clé refusée" : "Clip refusé"} du plan ${item.shotNumber} : ${item.title}`;
          return (
            <article key={`${item.shotNumber}-${item.stage}`} className="grid gap-4 rounded border border-[#eeeae4] bg-white p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-2">
                {item.url ? (
                  item.stage === "keyframe" ? (
                    <button type="button" onClick={() => setViewed({ src: item.url!, kind: "image", label: previewLabel })} className="relative block w-full overflow-hidden rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL of the refused keyframe */}
                      <img src={item.url} alt={previewLabel} className="aspect-video w-full object-cover" />
                      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs font-semibold text-white">Agrandir</span>
                    </button>
                  ) : (
                    <div>
                      <video src={item.url} controls muted playsInline className="aspect-video w-full rounded bg-black object-contain" aria-label={previewLabel} />
                      <button type="button" onClick={() => setViewed({ src: item.url!, kind: "video", label: previewLabel })} className="min-h-10 text-xs font-semibold text-[#831810] underline underline-offset-2">Voir en plein écran</button>
                    </div>
                  )
                ) : (
                  <div className="grid aspect-video w-full place-items-center rounded bg-[#f3f1ee] text-xs text-[#6b6760]">Aperçu indisponible</div>
                )}
                {item.references && (
                  <div className="grid grid-cols-2 gap-2">
                    <Thumbnail src={item.references.vehicleUrl} label="Photo du véhicule" onOpen={setViewed} />
                    <Thumbnail src={item.references.placeUrl} label="Photo du lieu" onOpen={setViewed} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#242428]">
                  Plan {item.shotNumber} · {item.title} <span className="font-normal text-[#6b6760]">({kindLabel})</span>
                </p>
                <p className="mt-2 text-xs font-semibold text-[#55545a]">Ce qui ne va pas</p>
                {defects.length ? (
                  <ul className="mt-1 space-y-1.5 text-xs leading-5 text-[#242428]">
                    {defects.map((defect, index) => (
                      <li key={`${defect.code}-${index}`} className="flex gap-2">
                        {defect.severity && <span className={`h-fit shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${defect.severity === "bloquant" ? "bg-[#fae9e7] text-[#9d352e]" : "bg-[#fbf6ed] text-[#765d39]"}`}>{defect.severity}</span>}
                        <span>{defect.label}{defect.at ? ` (${defect.at})` : ""}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-[#242428]">Défaut non précisé : comparez l’image avec les photos de référence.</p>
                )}
                {defects.length > 0 && (
                  <details className="mt-2 text-xs text-[#55545a]">
                    <summary className="cursor-pointer font-semibold">Détail technique</summary>
                    <ul lang="en" className="mt-1 space-y-0.5 leading-5">
                      {defects.map((defect, index) => <li key={index}>{defect.detail}</li>)}
                    </ul>
                  </details>
                )}
                <div className="mt-4 space-y-3">
                  <div>
                    <button type="button" disabled={busy !== null} onClick={() => void decide(item, "accept")} className="min-h-11 rounded-full border border-[#d8d4cd] bg-white px-4 text-xs font-semibold text-[#242428] disabled:opacity-50">
                      {busy === `${item.shotNumber}-accept` ? "Enregistrement…" : "Accepter ce plan"}
                    </button>
                    <p className="mt-1 text-xs leading-5 text-[#55545a]">Le plan est gardé tel quel ; le valideur verra l’avertissement.</p>
                  </div>
                  {item.stage === "keyframe" && item.canRetry && editing !== item.shotNumber && (
                    <div>
                      <button type="button" disabled={busy !== null} onClick={() => setEditing(item.shotNumber)} className="min-h-11 rounded-full bg-[#c51e1c] px-4 text-xs font-semibold text-white disabled:opacity-50">
                        Modifier ce plan
                      </button>
                      <p className="mt-1 text-xs leading-5 text-[#55545a]">
                        Le réalisateur corrige le plan selon vos indications : nouvelle image clé et nouveau contrôle, puis la vidéo du plan{item.cost ? ` ; ${relaunchCostText(item.cost)}` : ""}.
                        {item.revisionsLeft != null ? ` ${item.revisionsLeft} modification${item.revisionsLeft > 1 ? "s" : ""} possible${item.revisionsLeft > 1 ? "s" : ""} pour ce plan.` : ""}
                      </p>
                    </div>
                  )}
                  {item.stage === "keyframe" && editing === item.shotNumber && (
                    <ReviseShotForm
                      versionId={versionId}
                      shotNumber={item.shotNumber}
                      cost={item.cost}
                      onCancel={() => setEditing(null)}
                      onSent={(conflicts) => {
                        setSent((current) => [...current.filter((entry) => entry.shotNumber !== item.shotNumber), { shotNumber: item.shotNumber, title: item.title, conflicts }]);
                        setEditing(null);
                        onChanged();
                      }}
                    />
                  )}
                  {item.stage === "keyframe" && !item.canRetry && item.revisionsLeft === 0 && (
                    <p className="text-xs leading-5 text-[#55545a]">Modification utilisée : acceptez le plan tel quel ou annulez la vidéo.</p>
                  )}
                  {item.lastRevision && (
                    <div className="text-xs leading-5 text-[#55545a]">
                      {item.lastRevision.feedback && <p>Votre dernière demande : « {item.lastRevision.feedback} »</p>}
                      <AdaptedRequests conflicts={item.lastRevision.conflicts} title="Votre dernière demande a été adaptée aux règles de la marque" />
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-3">
        <button type="button" disabled={busy !== null} onClick={() => void cancelVideo()} className="min-h-11 text-xs font-semibold text-[#831810] underline disabled:opacity-50">
          {busy === "cancel" ? "Annulation…" : "Annuler la vidéo"}
        </button>
        <p className="text-xs leading-5 text-[#55545a]">La vidéo s’arrête ; rien d’autre n’est facturé.</p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-[#9d352e]">
          {error}
        </p>
      )}
      {viewed && <FullScreen viewed={viewed} onClose={() => setViewed(null)} />}
    </section>
  );
}
