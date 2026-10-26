"use client";

import { useState } from "react";
import Image from "next/image";
import type { ReviewRequest } from "@/core/verification/loop";

/**
 * Plans arrêtés par un vérificateur : rien n'est animé ni monté sans décision.
 * « Abandonner » réutilise l'annulation de la génération (réservations libérées).
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
  if (!items.length) return null;

  async function decide(shotNumber: number, decision: "accept" | "retry") {
    setBusy(`${shotNumber}-${decision}`);
    setError("");
    try {
      const response = await fetch(
        `/api/versions/${versionId}/shots/${shotNumber}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error ?? "La décision n’a pas pu être enregistrée.");
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "La décision n’a pas pu être enregistrée.",
      );
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
      aria-labelledby={`review-${versionId}`}
      className="mt-4 rounded-md border border-[#e7c9c6] bg-[#fdf4f3] p-3"
    >
      <h3
        id={`review-${versionId}`}
        className="text-[10px] font-semibold uppercase tracking-wide text-[#831810]"
      >
        Décision requise
      </h3>
      <p className="mt-1 text-[11px] leading-5 text-[#6f4a46]">
        Le contrôle automatique refuse encore {items.length > 1 ? "ces plans" : "ce plan"} après
        les corrections du réalisateur. Rien n’est animé ni monté sans votre accord.
      </p>
      <div className="mt-3 grid gap-3">
        {items.map((item) => (
          <article
            key={`${item.shotNumber}-${item.stage}`}
            className="grid gap-3 rounded border border-[#eeeae4] bg-white p-2.5 sm:grid-cols-[180px_1fr]"
          >
            {item.url ? (
              item.stage === "keyframe" ? (
                <Image
                  src={item.url}
                  alt={`Image-clé refusée du plan ${item.shotNumber} : ${item.title}`}
                  width={360}
                  height={203}
                  unoptimized
                  className="aspect-video w-full rounded object-cover"
                />
              ) : (
                <video
                  src={item.url}
                  controls
                  muted
                  playsInline
                  className="aspect-video w-full rounded bg-black object-contain"
                  aria-label={`Clip refusé du plan ${item.shotNumber} : ${item.title}`}
                />
              )
            ) : (
              <div className="grid aspect-video w-full place-items-center rounded bg-[#f3f1ee] text-[10px] text-[#88847d]">
                Aperçu indisponible
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#242428]">
                Plan {item.shotNumber} · {item.title}{" "}
                <span className="font-normal text-[#88847d]">
                  ({item.stage === "keyframe" ? "image-clé" : "clip"})
                </span>
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-[#765d39]">
                {(item.issues.length ? item.issues : ["Défaut non précisé"]).map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void decide(item.shotNumber, "accept")}
                  className="min-h-9 rounded-full border border-[#d8d4cd] px-3 text-[11px] font-semibold text-[#242428] disabled:opacity-50"
                >
                  Accepter ce plan
                </button>
                {item.canRetry && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void decide(item.shotNumber, "retry")}
                    className="min-h-9 rounded-full bg-[#c51e1c] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    Relancer avec le réalisateur
                  </button>
                )}
              </div>
              {item.canRetry && (
                <p className="mt-1.5 text-[10px] text-[#88847d]">
                  Une relance coûte environ 0,15 $ (correction, nouvelle image et contrôle).
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void cancelVideo()}
        className="mt-3 text-[11px] font-semibold text-[#831810] underline disabled:opacity-50"
      >
        Annuler la vidéo
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-[#9d352e]">
          {error}
        </p>
      )}
    </section>
  );
}
