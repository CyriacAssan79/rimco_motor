"use client";

import { useEffect, useState } from "react";
import { formatFcfa } from "@/core/pricing";
import { describeDefects } from "@/core/verification/defects";
import { REVISION_REASON_IDS, REVISION_REASONS, USER_FEEDBACK_MAX_LENGTH, type ReviewRequest, type RevisionReason } from "@/core/verification/loop";
import { KIND_LABELS, nonConformityActions, type NonConformityKind, type ReportDecision, type ReportStage } from "@/core/versions/shot-reports";

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

type ModificationCost = { fcfa: number; usd?: number; minutes: number; billed?: boolean };

/**
 * Cost of a modification (27/10): included in the video price → the indicative amount struck through, « (non facturé) »;
 * priced by KÔMIAN → « environ X FCFA ». Dollars only arrive for the KÔMIAN operator (filtered by the server).
 */
export function RelaunchCost({ cost, withMinutes = true }: { cost: ModificationCost; withMinutes?: boolean }) {
  const usd = cost.usd != null ? ` · coût réel ${cost.usd.toFixed(2).replace(".", ",")} $` : "";
  return (
    <>
      {cost.billed
        ? <>environ {formatFcfa(cost.fcfa)}</>
        : <><s className="text-[#8a8990]" aria-label={`${formatFcfa(cost.fcfa)}, non facturé`}>{formatFcfa(cost.fcfa)}</s> (non facturé)</>}
      {usd}{withMinutes ? `, environ ${cost.minutes} min` : ""}
    </>
  );
}

export type RelaunchOption = { scope?: "clip" | "full"; label: string; cost?: ReviewRequest["cost"] };

async function postJson(url: string, body: unknown, fallback: string) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? fallback);
  return data as Record<string, unknown>;
}

/**
 * 29/10 · S01 · « Non conforme » sur un plan, avant le montage. Deux voies :
 * - reprise créative : un commentaire, puis la génération du plan est relancée (limite de reprises réglée par KÔMIAN) ;
 * - erreur technique : une ou plusieurs cases de la liste fermée, puis accepter le plan, relancer la génération
 *   (jamais facturée) ou rejeter le plan (clips seulement : il est désactivé).
 * La déclaration est enregistrée d'abord (suivi KÔMIAN, recrédit des erreurs techniques), puis l'action est faite par
 * les routes existantes. Partagé par la planche des images clés, la planche des clips et le panneau de décision.
 */
export function NonConformityForm({ versionId, shotNumber, stage, relaunchOptions, revisionsLeft, onAccept, onReject, onSent, onDecided, onCancel }: {
  versionId: string;
  shotNumber: number;
  stage: ReportStage;
  relaunchOptions: RelaunchOption[];
  revisionsLeft?: number | null;
  onAccept?: () => Promise<void>;
  onReject?: () => Promise<void>;
  onSent: (conflicts: string[]) => void;
  onDecided: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<NonConformityKind | null>(null);
  const [reasons, setReasons] = useState<RevisionReason[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const actions = kind ? nonConformityActions({ kind, stage, canRelaunch: relaunchOptions.length > 0, canAccept: Boolean(onAccept), canReject: Boolean(onReject) }) : null;
  const ready = kind === "technical" ? reasons.length > 0 : kind === "creative" ? comment.trim().length > 0 : false;

  async function report(decision: ReportDecision) {
    await postJson(`/api/versions/${versionId}/shots/${shotNumber}/report`, { stage, kind, reasons: kind === "technical" ? reasons : [], comment: comment.trim() || undefined, decision }, "Le signalement n’a pas pu être enregistré.");
  }
  async function run(key: string, task: () => Promise<void>) {
    setBusy(key);
    setError("");
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "La décision n’a pas pu être enregistrée."); }
    finally { setBusy(null); }
  }
  const relaunch = (option: RelaunchOption) => run(`relaunch-${option.scope ?? "plan"}`, async () => {
    await report("relaunch");
    const data = await postJson(`/api/versions/${versionId}/shots/${shotNumber}/review`, { decision: "revise", feedback: kind === "creative" ? comment.trim() : "", reasons: kind === "technical" ? reasons : [], kind, ...(option.scope ? { scope: option.scope } : {}) }, "La relance n’a pas pu être lancée.");
    onSent(Array.isArray(data.feedbackConflicts) ? data.feedbackConflicts as string[] : []);
  });
  const decide = (decision: "accept" | "reject", action?: () => Promise<void>) => run(decision, async () => {
    if (!action) return;
    await report(decision);
    await action();
    onDecided();
  });

  return (
    <div className="space-y-3 rounded-md border border-[#e7c9c6] bg-[#fffafa] p-3">
      <fieldset>
        <legend className="text-xs font-semibold text-[#242428]">Ce plan n’est pas conforme : de quoi s’agit-il ?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["technical", "creative"] as const).map((value) => (
            <label key={value} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded border p-2 text-xs ${kind === value ? "border-[#c51e1c] bg-[#fff1ef]" : "border-[#e5e2dd] bg-white"}`}>
              <input type="radio" name={`kind-${versionId}-${shotNumber}`} checked={kind === value} onChange={() => { setKind(value); setError(""); }} className="mt-0.5 size-4 accent-[#c51e1c]" />
              <span><b className="font-semibold">{KIND_LABELS[value]}</b><span className="block text-[#55545a]">{value === "technical" ? "Un défaut de rendu : cochez ce qui ne va pas. Jamais facturé." : "Vous voulez autre chose : décrivez-le, le plan est relancé."}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "technical" && (
        <fieldset>
          <legend className="text-xs font-semibold text-[#242428]">Erreurs constatées</legend>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {REVISION_REASON_IDS.map((reason) => (
              <label key={reason} className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-[#242428]">
                <input type="checkbox" checked={reasons.includes(reason)} onChange={() => setReasons((current) => current.includes(reason) ? current.filter((value) => value !== reason) : [...current, reason])} className="size-4 accent-[#c51e1c]" />
                {REVISION_REASONS[reason].fr}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {kind === "creative" && (
        <label className="grid gap-1 text-xs font-semibold text-[#242428]">
          Ce que vous voulez changer
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={USER_FEEDBACK_MAX_LENGTH} rows={3} placeholder="Ex. je veux la voiture arrivant de la droite vers la caméra, en fin de journée." className="rounded-md border border-[#d2cec6] bg-white p-2 text-xs font-normal outline-none focus:border-[#c51e1c]" />
          <span className="text-xs font-normal text-[#626269]">{comment.length}/{USER_FEEDBACK_MAX_LENGTH} caractères · les règles de la marque restent appliquées.</span>
        </label>
      )}
      {actions && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {actions.accept && <button type="button" disabled={!ready || busy !== null} onClick={() => void decide("accept", onAccept)} className="min-h-11 rounded-full border border-[#d8d4cd] bg-white px-4 text-xs font-semibold text-[#242428] disabled:opacity-50">{busy === "accept" ? "Enregistrement…" : "Accepter le plan quand même"}</button>}
            {actions.relaunch && relaunchOptions.map((option) => (
              <button key={option.scope ?? "plan"} type="button" disabled={!ready || busy !== null} onClick={() => void relaunch(option)} className="min-h-11 rounded-full bg-[#c51e1c] px-4 text-xs font-semibold text-white disabled:opacity-50">{busy === `relaunch-${option.scope ?? "plan"}` ? "Envoi…" : option.label}</button>
            ))}
            {actions.reject && <button type="button" disabled={!ready || busy !== null} onClick={() => void decide("reject", onReject)} className="min-h-11 rounded-full border border-[#c51e1c] bg-white px-4 text-xs font-semibold text-[#b21c1a] disabled:opacity-50">{busy === "reject" ? "Enregistrement…" : "Rejeter le plan"}</button>}
          </div>
          {actions.relaunch && kind === "creative" && relaunchOptions[0]?.cost && <p className="text-xs text-[#55545a]">Coût de la reprise : <RelaunchCost cost={relaunchOptions[0].cost} />.</p>}
          {actions.relaunch && kind === "technical" && <p className="text-xs text-[#55545a]">Relance non facturée.</p>}
          {actions.relaunch && revisionsLeft != null && <p className="text-xs text-[#55545a]">{revisionsLeft} relance{revisionsLeft > 1 ? "s" : ""} possible{revisionsLeft > 1 ? "s" : ""} pour ce plan.</p>}
          {!actions.relaunch && <p className="text-xs text-[#55545a]">Plus de relance possible pour ce plan{kind === "creative" ? " : acceptez-le, signalez une erreur technique ou annulez la vidéo." : "."}</p>}
          {kind === "technical" && stage === "keyframe" && <p className="text-xs text-[#55545a]">Pour retirer un plan du film, rejetez son clip à l’étape suivante.</p>}
          {kind === "technical" && <p className="text-xs text-[#55545a]">Votre signalement est transmis à KÔMIAN, qui le traite.</p>}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[#9d352e]">{error}</p>}
      <button type="button" onClick={onCancel} disabled={busy !== null} className="min-h-11 rounded-full border border-[#d8d4cd] bg-white px-4 text-xs font-semibold text-[#242428] disabled:opacity-50">Annuler</button>
    </div>
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
                    <p className="mt-1 text-xs leading-5 text-[#55545a]">Le plan est gardé tel quel ; l’avertissement reste visible dans le détail de la vidéo.</p>
                  </div>
                  {item.stage === "keyframe" && editing !== item.shotNumber && (
                    <div>
                      <button type="button" disabled={busy !== null} onClick={() => setEditing(item.shotNumber)} className="min-h-11 rounded-full bg-[#c51e1c] px-4 text-xs font-semibold text-white disabled:opacity-50">
                        Non conforme
                      </button>
                      <p className="mt-1 text-xs leading-5 text-[#55545a]">
                        Erreur technique (à cocher) ou reprise créative (à décrire) : vous choisissez ensuite d’accepter le plan ou de le relancer{item.cost ? <> ; reprise créative : <RelaunchCost cost={item.cost} /></> : null}.
                        {item.revisionsLeft != null ? ` ${item.revisionsLeft} modification${item.revisionsLeft > 1 ? "s" : ""} possible${item.revisionsLeft > 1 ? "s" : ""} pour ce plan.` : ""}
                      </p>
                    </div>
                  )}
                  {item.stage === "keyframe" && editing === item.shotNumber && (
                    <NonConformityForm
                      versionId={versionId}
                      shotNumber={item.shotNumber}
                      stage="keyframe"
                      relaunchOptions={item.canRetry ? [{ label: "Relancer la génération", cost: item.cost }] : []}
                      revisionsLeft={item.revisionsLeft}
                      onAccept={async () => { const response = await fetch(`/api/versions/${versionId}/shots/${item.shotNumber}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "accept" }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "La décision n’a pas pu être enregistrée."); }}
                      onDecided={() => { setEditing(null); onChanged(); }}
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
