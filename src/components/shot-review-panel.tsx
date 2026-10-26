"use client";

import { useEffect, useState } from "react";
import { formatFcfa } from "@/core/pricing";
import { describeDefects } from "@/core/verification/defects";
import type { ReviewRequest } from "@/core/verification/loop";

type Viewed = { src: string; kind: "image" | "video"; label: string };

/** Relaunch cost: FCFA for everyone, dollars added for an administrator only (sent by the server by role). */
export function relaunchCostText(cost: NonNullable<ReviewRequest["cost"]>) {
  const usd = cost.usd != null ? ` (${cost.usd.toFixed(2).replace(".", ",")} $)` : "";
  return `environ ${formatFcfa(cost.fcfa)}${usd}, environ ${cost.minutes} min`;
}

/** Full-screen view of a refused image, a clip or a reference photo; Escape or a click outside closes it. */
function FullScreen({ viewed, onClose }: { viewed: Viewed; onClose: () => void }) {
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

function Thumbnail({ src, label, onOpen }: { src: string | null; label: string; onOpen: (viewed: Viewed) => void }) {
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
  if (!items.length) return null;
  const ordered = [...items].sort((left, right) => left.shotNumber - right.shotNumber || (left.stage === "keyframe" ? -1 : 1));

  async function decide(shotNumber: number, decision: "accept" | "retry") {
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
        {ordered.length > 1 ? `${ordered.length} décisions requises` : "Décision requise"}
      </h3>
      <p className="mt-1 text-xs leading-5 text-[#6f4a46]">
        Le contrôle automatique refuse encore {ordered.length > 1 ? "ces plans" : "ce plan"} après les corrections du réalisateur. Rien n’est animé ni monté sans votre accord.
      </p>
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
                    <button type="button" disabled={busy !== null} onClick={() => void decide(item.shotNumber, "accept")} className="min-h-11 rounded-full border border-[#d8d4cd] bg-white px-4 text-xs font-semibold text-[#242428] disabled:opacity-50">
                      {busy === `${item.shotNumber}-accept` ? "Enregistrement…" : "Accepter ce plan"}
                    </button>
                    <p className="mt-1 text-xs leading-5 text-[#55545a]">Le plan est gardé tel quel ; le valideur verra l’avertissement.</p>
                  </div>
                  {item.canRetry && (
                    <div>
                      <button type="button" disabled={busy !== null} onClick={() => void decide(item.shotNumber, "retry")} className="min-h-11 rounded-full bg-[#c51e1c] px-4 text-xs font-semibold text-white disabled:opacity-50">
                        {busy === `${item.shotNumber}-retry` ? "Envoi au réalisateur…" : "Relancer avec le réalisateur"}
                      </button>
                      <p className="mt-1 text-xs leading-5 text-[#55545a]">
                        Le réalisateur corrige le plan : nouvelle image clé et nouveau contrôle, puis la vidéo du plan{item.cost ? ` ; ${relaunchCostText(item.cost)}` : ""}.
                      </p>
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
