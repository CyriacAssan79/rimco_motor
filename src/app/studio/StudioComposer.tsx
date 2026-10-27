"use client";
import { ClipBoard } from "@/components/clip-board";
import type { ClipBoard as ClipBoardData } from "@/core/versions/clip-gate";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatFcfa } from "@/core/pricing";
import {
  getScenePresets,
  getScenePreset,
  inferVehicleCategory,
} from "@/core/scenes/catalog";
import { MAX_STORYBOARD_DIRECTION_LENGTH } from "@/core/storyboard-direction";
import { peoplePresetIds, peoplePresets, type PeoplePresetId } from "@/core/people-presets";
import type { ReviewRequest } from "@/core/verification/loop";
import { ShotReviewPanel } from "@/components/shot-review-panel";
import {
  KEEP_TAB_OPEN_MESSAGE,
  useGenerationTracker,
  useNow,
} from "@/components/generation-tracker";
import {
  isVersionRunning,
  pickStudioVersion,
  type TrackedVersion,
} from "@/core/versions/generation-tracker";
import { GenerationProgress } from "@/components/generation-progress";
import { FailedOutcome, ReadyOutcome } from "@/components/video-outcome";
import { KeyframeBoard, type Board } from "@/components/keyframe-board";
import { approvalBoxState, DEFAULT_KEYFRAME_APPROVAL_MODE, normalizeApprovalMode, type KeyframeApprovalMode } from "@/core/versions/keyframe-approval";
import type { BillingSummary, StudioSettings } from "@/core/versions/outcome";
import { preparationProgress } from "@/core/versions/progress";
import { PlaceTimeChoice } from "@/components/place-time-choice";
import type { PlaceTimeOfDay } from "@/core/motion/place-motion";

type Format = "16:9" | "9:16" | "1:1";
type Job = TrackedVersion & {
  prompt?: string;
  videoUrl?: string | null;
  tier?: string | null;
  format?: string;
  validationStatus?: string | null;
  settings?: StudioSettings | null;
  billing?: BillingSummary | null;
  keyframeApproval?: Board | null;
  clipApproval?: ClipBoardData | null;
  approvalState?: { expiredAt?: string } | null;
  priceFcfa?: number | null;
  completedShots?: number;
  totalShots?: number;
  completedKeyframes?: number;
  totalKeyframes?: number;
  checkedQualityShots?: number;
  totalQualityShots?: number;
  keyframes?: Array<{ number: number; title: string; url: string }>;
  estimatedPriceFcfa?: number;
  reviewRequired?: ReviewRequest[];
  qualityWarnings?: Array<{
    shotNumber: number;
    title: string;
    stage: "keyframe" | "video";
    issues: string[];
  }>;
};
type Model = {
  id: string;
  tier: string;
  formats: Format[];
  durations: number[];
  estimatedPricesFcfa: Record<string, number>;
  isDefault: boolean;
};
type VehicleDossier = {
  id: string | null;
  key: string;
  dossierIds?: string[];
  make: string;
  model: string;
  color?: string | null;
  variant?: string | null;
  photos: Array<{
    id: string;
    photoRole: string;
    title: string;
    angle?: string | null;
    previewUrl?: string | null;
  }>;
};
type PlaceAsset = {
  id: string;
  title?: string;
  category?: string;
  previewUrl?: string | null;
  isCurated?: boolean;
  placeProfile?: { timeOfDay?: PlaceTimeOfDay };
};
type CastAsset = { id: string; title?: string; previewUrl?: string | null };
const MAX_CAST = 2;
type StoryShot = {
  title: string;
  shotType?: "establishing" | "rolling" | "detail" | "hero";
  travelDirection?: string;
  travelSpeed?: string;
  castIds?: string[];
  withPeople?: boolean;
  scene: string;
  framing: string;
  location: string;
  action: string;
  camera: string;
  durationSeconds: number;
  vehiclePhotoId: string;
  locationPhotoId?: string | null;
};
const durationOptions = [5, 10, 15, 20];
/** No server limit exists yet: the Studio lets a user run at most two videos at a time (see docs/DECISIONS.md). */
const MAX_ACTIVE_VIDEOS = 2;
const premiumDurationOptions = [20];
const lightOptions = ["Lumière naturelle claire du matin"];

function getLightingLabel(lighting: string): string {
  const normalized = lighting.toLocaleLowerCase("fr");
  if (normalized.includes("lever du jour")) return "Lever du jour";
  if (normalized.includes("fin de journée")) return "Fin de journée";
  if (normalized.includes("nuit")) return "Nuit";
  if (normalized.includes("soirée")) return "Soirée";
  if (normalized.includes("intérieur")) return "Intérieur";
  if (normalized.includes("matin")) return "Matin";
  return lighting;
}

/** Settings of a launch, kept with the followed video for « Créer une variante » and « Relancer ». */
function settingsFromPayload(payload: Record<string, unknown>): StudioSettings | null {
  const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  if (typeof payload.vehicleDossierId !== "string") return null;
  const tier = payload.tier === "pro" || payload.tier === "premium" ? payload.tier : "standard";
  const format = payload.format === "9:16" || payload.format === "1:1" ? payload.format : "16:9";
  return {
    title: typeof payload.title === "string" ? payload.title : "",
    description: typeof payload.description === "string" ? payload.description : "",
    vehicleDossierId: payload.vehicleDossierId,
    vehiclePhotoIds: ids(payload.vehiclePhotoIds),
    placeIds: ids(payload.placeIds),
    castAssetIds: ids(payload.castAssetIds),
    tier,
    durationS: Number(payload.durationS) || 5,
    format,
    scenePresetId: typeof payload.scenePresetId === "string" ? payload.scenePresetId : "",
    audioAssetId: typeof payload.audioAssetId === "string" ? payload.audioAssetId : null,
  };
}

export function StudioComposer({ mode, showPrompt = false }: { mode: "mock" | "live"; showPrompt?: boolean }) {
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState("");
  const [assetsRetry, setAssetsRetry] = useState(0);
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const [scenePresetId, setScenePresetId] = useState("");
  const [tier, setTier] = useState<"standard" | "pro" | "premium">("standard");
  const [durationS, setDurationS] = useState(5);
  const [additionalDirection, setAdditionalDirection] = useState("");
  const [audioAssets, setAudioAssets] = useState<
    Array<{ id: string; title?: string }>
  >([]);
  const [audioAssetId, setAudioAssetId] = useState("");
  const [format, setFormat] = useState<Format>("16:9");
  const tracker = useGenerationTracker();
  /** Version launched or opened in this Studio; otherwise the running (or recently finished) one is shown again. */
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** « Relancer avec les mêmes réglages »: the form is filled, then submitted once the new state is rendered. */
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  /** 27/10 · « Valider les images clés avant la vidéo »: brand setting, and the user's choice when it is free. */
  const [approvalMode, setApprovalMode] = useState<KeyframeApprovalMode>(DEFAULT_KEYFRAME_APPROVAL_MODE);
  const [approvalChoice, setApprovalChoice] = useState<boolean | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  /** The director writes the storyboard before the video exists: shown as the « Préparation » step. */
  const [preparingSince, setPreparingSince] = useState<number | null>(null);
  /** 26/10: storyboard ready but adapted by the director: the user sees why before the video is paid. */
  const [pendingLaunch, setPendingLaunch] = useState<{ payload: Record<string, unknown>; conflicts: string[] } | null>(null);
  const purpose = "advertising" as const;
  const [vehicleDossiers, setVehicleDossiers] = useState<VehicleDossier[]>([]);
  const [places, setPlaces] = useState<PlaceAsset[]>([]);
  const [vehicleDossierId, setVehicleDossierId] = useState("");
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [timeTransition, setTimeTransition] = useState(false);
  const [locationAssetId, setLocationAssetId] = useState("");
  const [castAssets, setCastAssets] = useState<CastAsset[]>([]);
  const [castIds, setCastIds] = useState<string[]>([]);
  const [peoplePreset, setPeoplePreset] = useState<PeoplePresetId>("none");

  const selectedDossier = vehicleDossiers.find(
    (vehicle) => vehicle.key === vehicleDossierId,
  );
  const availableDurationOptions =
    tier === "premium" ? premiumDurationOptions : durationOptions;
  const effectivePlaceIds =
    durationS >= 10
      ? placeIds
      : locationAssetId
        ? [locationAssetId]
        : placeIds.slice(0, 1);
  const multiClip = Boolean(
    selectedDossier &&
    (tier === "premium" ||
      (durationS >= 10 &&
        (selectedDossier.photos.length > 1 || effectivePlaceIds.length > 1))),
  );
  const selectedPhoto =
    selectedDossier?.photos.find((photo) => photo.id === assetId) ??
    selectedDossier?.photos[0];
  const selectedAsset = selectedPhoto
    ? {
        ...selectedPhoto,
        make: selectedDossier?.make,
        model: selectedDossier?.model,
        color: selectedDossier?.color,
      }
    : undefined;
  const vehicleCategory = inferVehicleCategory(
    selectedAsset?.make,
    selectedAsset?.model,
  );
  const relevantScenes = getScenePresets(vehicleCategory);
  const allScenes = getScenePresets();
  const universalScenes = allScenes.filter(
    (scene) =>
      scene.category === "autre" &&
      !relevantScenes.some((recommended) => recommended.id === scene.id),
  );
  const sceneChoices = [...relevantScenes, ...universalScenes].slice(0, 8);
  const selectedScene = getScenePreset(scenePresetId) ?? relevantScenes[0];
  const storyboardModel = availableModels.find(
    (model) =>
      model.tier === tier &&
      model.durations.includes(durationS) &&
      model.formats.includes(format),
  );
  const estimatedPriceFcfa =
    storyboardModel?.estimatedPricesFcfa[String(durationS)];
  const runningMine = tracker.mine.filter(isVersionRunning);
  const now = useNow(runningMine.length > 0 || preparingSince !== null);
  const shownId =
    focusId ??
    pickStudioVersion(tracker.mine, {
      userId: tracker.userId,
      seenIds: tracker.seenIds,
      finishedAt: tracker.finishedAt,
      now,
    })?.id;
  const job: Job | undefined = shownId
    ? tracker.snapshot.versions.find((version) => version.id === shownId)
    : undefined;
  const approvalBox = approvalBoxState(approvalMode, tier);
  const approvalChecked = approvalBox.locked ? approvalBox.checked : approvalChoice ?? approvalBox.checked;
  const jobStatus = job ? (job.versionStatus ?? job.status) : undefined;
  const jobRunning = Boolean(job && isVersionRunning(job));
  // 27/10: keyframes not validated within 48 h: the video expired (shown like a failure, with its relaunch).
  const jobExpired = Boolean(job && jobStatus === "cancelled" && (job.keyframeApproval?.expiredAt || job.approvalState?.expiredAt));
  // A ready video opened again: its signed URL comes from /refresh (the list carries no preview).
  const fetchedReady = useRef(new Set<string>());
  useEffect(() => {
    if (!job || jobStatus !== "ready" || job.videoUrl || fetchedReady.current.has(job.id)) return;
    fetchedReady.current.add(job.id);
    const id = job.id;
    fetch(`/api/versions/${id}/refresh`, { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) tracker.receive(id, data); })
      .catch(() => undefined);
  }, [job, jobStatus, tracker]);
  const otherRunning = runningMine.filter((version) => version.id !== job?.id).length;
  const launchBlocked = runningMine.length >= MAX_ACTIVE_VIDEOS;
  const lightingChoices = Array.from(
    new Map(
      sceneChoices.map((scene) => [getLightingLabel(scene.lighting), scene]),
    ).entries(),
  ).map(([label, scene]) => ({ label, scene }));

  function clearFormError() {
    setError("");
  }

  /** Puts the settings of a finished video back in the form: a variant to adjust, or the same video again. */
  function applySettings(settings: StudioSettings, launchNow: boolean) {
    const vehicle = vehicleDossiers.find((entry) => entry.id === settings.vehicleDossierId || entry.dossierIds?.includes(settings.vehicleDossierId ?? ""));
    if (!vehicle) {
      setError("Le véhicule de cette vidéo n’est plus disponible dans la médiathèque : choisissez-en un autre.");
      return;
    }
    const validPlaces = settings.placeIds.filter((id) => places.some((place) => place.id === id));
    setTitle(launchNow || !settings.title ? settings.title : `${settings.title} · variante`);
    setAdditionalDirection(settings.description);
    setVehicleDossierId(vehicle.key);
    setAssetId(settings.vehiclePhotoIds.find((id) => vehicle.photos.some((photo) => photo.id === id)) ?? vehicle.photos[0]?.id ?? "");
    if (validPlaces.length) {
      setPlaceIds(validPlaces);
      setLocationAssetId(validPlaces[0]);
    }
    setCastIds(settings.castAssetIds.filter((id) => castAssets.some((member) => member.id === id)));
    setTier(settings.tier);
    setDurationS(settings.durationS);
    setFormat(settings.format);
    if (settings.scenePresetId) setScenePresetId(settings.scenePresetId);
    setAudioAssetId(settings.audioAssetId && audioAssets.some((track) => track.id === settings.audioAssetId) ? settings.audioAssetId : "");
    setError("");
    setPendingLaunch(null);
    if (launchNow) {
      setSettingsNotice("");
      setAutoLaunch(true);
      return;
    }
    setSettingsNotice("Réglages repris : modifiez ce que vous voulez, puis lancez la variante.");
    formRef.current?.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    if (pendingLaunch) conflictRef.current?.scrollIntoView({ block: "center" });
  }, [pendingLaunch]);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/keyframe-approval")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => { if (active && data) setApprovalMode(normalizeApprovalMode(data.mode)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!autoLaunch || busy || assetsLoading) return;
    setAutoLaunch(false);
    formRef.current?.requestSubmit();
  }, [autoLaunch, busy, assetsLoading]);

  useEffect(() => {
    const allowed = availableDurationOptions;
    if (!allowed.includes(durationS)) setDurationS(allowed[0]);
  }, [availableDurationOptions, durationS, mode, storyboardModel, tier]);

  useEffect(() => {
    if (mode !== "live") return;
    let active = true;
    setModelsLoading(true);
    setModelsError("");
    fetch("/api/models/available")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Impossible de charger les modèles.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        const models: Model[] = data.models ?? [];
        setAvailableModels(models);
      })
      .catch((loadError) => {
        if (!active) return;
        setModelsError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger les modèles.",
        );
      })
      .finally(() => {
        if (active) setModelsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    let active = true;
    setAssetsLoading(true);
    setAssetsError("");
    Promise.all([
      fetch("/api/vehicles"),
      fetch("/api/assets?kind=place&status=valid%C3%A9e"),
    ])
      .then(async ([vehiclesResponse, placesResponse]) => {
        const [vehiclesData, placesData] = await Promise.all([
          vehiclesResponse.json(),
          placesResponse.json(),
        ]);
        if (!vehiclesResponse.ok)
          throw new Error(
            vehiclesData.error ?? "Impossible de charger les véhicules.",
          );
        if (!placesResponse.ok)
          throw new Error(
            placesData.error ?? "Impossible de charger les lieux.",
          );
        if (!active) return;
        const vehicleList: VehicleDossier[] = vehiclesData.vehicles ?? [];
        setVehicleDossiers(vehicleList);
        setPlaces(placesData.assets ?? []);
        if (placesData.assets?.[0]) {
          setLocationAssetId(placesData.assets[0].id);
          setPlaceIds([placesData.assets[0].id]);
        }
        if (vehicleList[0]) {
          setVehicleDossierId(vehicleList[0].key);
          setAssetId(vehicleList[0].photos[0]?.id ?? "");
          setScenePresetId(
            getScenePresets(
              inferVehicleCategory(vehicleList[0].make, vehicleList[0].model),
            )[0]?.id ?? "",
          );
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setAssetsError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger les véhicules.",
        );
      })
      .finally(() => {
        if (active) setAssetsLoading(false);
      });
    // Casting is optional: a loading error only hides the picker.
    fetch("/api/assets?kind=character&status=valid%C3%A9e")
      .then(async (response) =>
        response.ok
          ? (((await response.json()).assets ?? []) as CastAsset[])
          : [],
      )
      .catch(() => [] as CastAsset[])
      .then((list) => {
        if (active) setCastAssets(list);
      });
    // Music is optional too (patch v3.2): validated audio tracks of the brand, mixed with fades at the edit.
    fetch("/api/assets?kind=audio&status=valid%C3%A9e")
      .then(async (response) =>
        response.ok
          ? (((await response.json()).assets ?? []) as Array<{
              id: string;
              title?: string;
            }>)
          : [],
      )
      .catch(() => [] as Array<{ id: string; title?: string }>)
      .then((list) => {
        if (active) setAudioAssets(list);
      });
    return () => {
      active = false;
    };
  }, [assetsRetry]);

  async function launch(payload: Record<string, unknown>) {
    const response = await fetch("/api/versions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "La génération n’a pas pu démarrer.");
    tracker.track(data.id, {
      status: data.status,
      title: typeof payload.title === "string" && payload.title ? payload.title : undefined,
      prompt: data.prompt,
      completedShots: data.completedShots,
      totalShots: data.totalShots,
      completedKeyframes: data.completedKeyframes,
      totalKeyframes: data.totalKeyframes,
      keyframes: data.keyframes,
      estimatedPriceFcfa: data.estimatedPriceFcfa,
      processingStage: data.processingStage,
      nextPollInSeconds: data.nextPollInSeconds,
      videoUrl: data.videoUrl,
      settings: settingsFromPayload(payload),
    });
    setFocusId(data.id);
    setSettingsNotice("");
  }

  async function confirmLaunch() {
    if (!pendingLaunch) return;
    setError("");
    setBusy(true);
    try {
      await launch(pendingLaunch.payload);
      setPendingLaunch(null);
    } catch (launchError) {
      setError(
        launchError instanceof Error
          ? launchError.message
          : "Une erreur est survenue.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPendingLaunch(null);
    setBusy(true);
    setPreparingSince(Math.round(performance.timeOrigin + event.timeStamp));
    try {
      if (launchBlocked)
        throw new Error(
          "Deux vidéos sont déjà en cours. Attendez la fin de l’une d’elles pour en lancer une nouvelle.",
        );
      if (!selectedDossier?.id || !selectedDossier.photos.length)
        throw new Error(
          "Choisissez un véhicule avec au moins une photo validée.",
        );
      if (!effectivePlaceIds.length)
        throw new Error(
          "Choisissez au moins un lieu : chaque plan est tourné dans un lieu de la médiathèque.",
        );
      const selectedVehiclePhotoIds = [
        assetId,
        ...selectedDossier.photos
          .map((photo) => photo.id)
          .filter((id) => id !== assetId),
      ].filter(Boolean);
      const workflow = durationS === 5 ? "single" : "multi_clip";
      const directorResponse = await fetch("/api/storyboard/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflow,
          vehicleDossierId: selectedDossier.id,
          vehicleDossierIds: selectedDossier.dossierIds ?? [selectedDossier.id],
          vehiclePhotoIds: selectedVehiclePhotoIds,
          placeIds: effectivePlaceIds,
          timeTransition,
          mode: tier,
          durationSeconds: durationS,
          purpose,
          direction: additionalDirection,
          lighting: selectedScene?.lighting ?? lightOptions[0],
          mood: selectedScene?.mood ?? "",
          format,
          castAssetIds: castIds,
          peoplePreset: castIds.length ? "none" : peoplePreset,
        }),
      });
      const directorData = await directorResponse.json();
      if (!directorResponse.ok)
        throw new Error(
          directorData.error ??
            "Le réalisateur IA n’a pas pu préparer la vidéo. Aucune vidéo n’a été lancée.",
        );
      const shots = directorData.storyboard as StoryShot[] | undefined;
      if (!shots?.length)
        throw new Error(
          "Le réalisateur IA n’a pas proposé de plans valides. Aucune vidéo n’a été lancée. Réessayez.",
        );
      const firstPhoto =
        selectedDossier.photos.find(
          (photo) => photo.id === shots[0].vehiclePhotoId,
        ) ?? selectedDossier.photos[0];
      const payload: Record<string, unknown> = {
        workflow: workflow === "single" ? "single_storyboard" : "multi_clip",
        description: additionalDirection,
        timeTransition,
        title,
        assetId: firstPhoto.id,
        vehicleDossierId: selectedDossier.id,
        vehicleDossierIds: selectedDossier.dossierIds ?? [selectedDossier.id],
        vehiclePhotoIds: selectedVehiclePhotoIds,
        placeIds:
          workflow === "single"
            ? effectivePlaceIds.slice(0, 1)
            : effectivePlaceIds,
        storyMode: tier,
        clipDurationSeconds: durationS,
        purpose,
        storyboard: shots,
        storyboardLedgerIds: directorData.storyboardLedgerId
          ? [directorData.storyboardLedgerId]
          : [],
        format,
        tier,
        durationS,
        overlayLogo: true,
        keyframeApproval: approvalChecked,
        ...(audioAssetId ? { audioAssetId } : {}),
        castAssetIds: castIds,
        castDescription:
          typeof directorData.castDescription === "string"
            ? directorData.castDescription
            : "",
        lighting: selectedScene?.lighting ?? lightOptions[0],
        scenePresetId: selectedScene?.id ?? "",
        vehicleCategory,
        location: selectedScene?.location ?? "",
        setting: selectedScene?.setting ?? "",
        vehicleAction:
          selectedScene?.vehicleAction ??
          "Le véhicule avance lentement et régulièrement",
        cameraMovement: selectedScene?.cameraMovement ?? "",
        mood: selectedScene?.mood ?? "",
        // 26/10: the server launches only the storyboard signed by the director's route.
        storyboardSignature: directorData.storyboardSignature,
      };
      const conflicts = Array.isArray(directorData.briefConflicts)
        ? (directorData.briefConflicts as unknown[]).filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      if (conflicts.length) {
        setPendingLaunch({ payload, conflicts });
        return;
      }
      await launch(payload);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Une erreur est survenue.",
      );
    } finally {
      setBusy(false);
      setPreparingSince(null);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-md border border-black/[.055] bg-white">
          <div className="border-t border-[#eeeae4] p-4 md:p-5">
            <textarea
              value={additionalDirection}
              onChange={(event) => {
                setAdditionalDirection(event.target.value);
                clearFormError();
              }}
              maxLength={MAX_STORYBOARD_DIRECTION_LENGTH}
              rows={3}
              placeholder="Décrivez votre vidéo…"
              aria-label="Description de la vidéo"
              className="w-full resize-y rounded-md border border-[#e9e7e2] bg-[#fcfcfb] p-3 text-sm leading-6 outline-none focus:border-[#c51e1c]"
            />
            <p className="mt-3 rounded-md border border-[#e7d7b9] bg-[#fbf6ed] p-3 text-[11px] leading-5 text-[#765d39]">
              <strong>Bon à savoir :</strong> les choix faits dans les options
              (véhicule, lieu, casting, lumière, format, niveau) sont
              généralement prioritaires sur la description. En cas de
              contradiction, c’est la sélection qui s’applique.
            </p>
            <button
              type="button"
              onClick={() => {
                setAdditionalDirection(
                  "Une vidéo publicitaire automobile élégante, avec une mise en valeur progressive du véhicule.",
                );
                clearFormError();
              }}
              className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-[#c51e1c] underline underline-offset-4"
            >
              Insérer un exemple
            </button>
            {settingsNotice && (
              <p role="status" className="mt-3 rounded-md border border-[#d7e7da] bg-[#f2f8f3] p-3 text-xs text-[#315c39]">
                {settingsNotice}
              </p>
            )}
          </div>
        </section>

        {preparingSince !== null && (
          <section
            aria-label="Préparation de la nouvelle vidéo"
            className="rounded-md border border-black/[.055] bg-white p-5"
          >
            <h2 className="text-sm font-semibold">Préparation de la nouvelle vidéo</h2>
            <p className="mt-1 text-xs leading-5 text-[#55545a]">
              Le réalisateur écrit le storyboard à partir de vos choix.
            </p>
            <GenerationProgress
              version={{
                status: "generating",
                progress: preparationProgress(preparingSince),
                observedAt: preparingSince,
              }}
              now={now}
              showShots={false}
            />
          </section>
        )}
        {job && (
          <section
            aria-labelledby="studio-job-title"
            className="rounded-md border border-black/[.055] bg-white p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="studio-job-title" className="min-w-0 truncate text-sm font-semibold">
                État de la vidéo{job.title ? ` · ${job.title}` : ""}
              </h2>
              <span className="shrink-0 text-xs font-semibold uppercase text-[#a47731]">
                {jobStatus === "ready"
                  ? "Prête"
                  : jobStatus === "failed"
                    ? "Échec"
                    : jobStatus === "cancelled"
                      ? "Annulée"
                      : job.reconciliationRequired
                        ? "Vérification requise"
                        : "En cours"}
              </span>
            </div>
            {(job.reconciliationRequired || (jobStatus === "cancelled" && !jobExpired) || (jobRunning && job.error)) && (
              <p className="mt-2 text-xs leading-5 text-[#55545a]">
                {job.reconciliationRequired
                  ? (job.error ??
                    "La génération doit être vérifiée avant toute relance. Aucune nouvelle soumission ne sera envoyée automatiquement.")
                  : jobStatus === "ready"
                    ? "Votre vidéo est prête à consulter."
                    : jobStatus === "failed"
                      ? (job.error ??
                        job.errorMessage ??
                        "La génération a échoué. Vous pouvez relancer une nouvelle vidéo.")
                      : jobStatus === "cancelled"
                        ? "La génération a été annulée."
                        : job.error}
              </p>
            )}
            {!job.reconciliationRequired && (
              <GenerationProgress version={job} now={now} />
            )}
            {jobStatus === "ready" && (
              <ReadyOutcome
                outcome={job}
                onVariant={job.settings ? () => applySettings(job.settings!, false) : undefined}
                onSeen={() => tracker.markSeen(job.id)}
                onSubmitted={() => void tracker.reload()}
              />
            )}
            {job.clipApproval && jobRunning && <ClipBoard versionId={job.id} board={job.clipApproval} onChanged={() => tracker.resolveReview(job.id)} />}
            {job.keyframeApproval && jobRunning && (
              <KeyframeBoard
                versionId={job.id}
                board={job.keyframeApproval}
                priceFcfa={job.estimatedPriceFcfa ?? job.priceFcfa}
                onChanged={() => tracker.resolveReview(job.id)}
              />
            )}
            {(jobStatus === "failed" || jobExpired) && !job.reconciliationRequired && (
              <FailedOutcome
                outcome={job}
                onRelaunch={job.settings && !launchBlocked ? () => { tracker.markSeen(job.id); applySettings(job.settings!, true); } : undefined}
                onVariant={job.settings ? () => applySettings(job.settings!, false) : undefined}
              />
            )}
            {jobRunning && (
              <p className="mt-2 text-xs leading-5 text-[#716d66]">
                {KEEP_TAB_OPEN_MESSAGE}
              </p>
            )}
            {otherRunning > 0 && (
              <p className="mt-1 text-xs leading-5 text-[#716d66]">
                {otherRunning === 1
                  ? "Une autre vidéo est en cours. "
                  : `${otherRunning} autres vidéos sont en cours. `}
                <Link
                  href="/file-generation"
                  className="font-semibold text-[#c51e1c] underline underline-offset-2"
                >
                  Voir la file de génération
                </Link>
              </p>
            )}
            <ShotReviewPanel
              versionId={job.id}
              items={job.reviewRequired ?? []}
              onChanged={() => tracker.resolveReview(job.id)}
            />
            {job.keyframes && job.keyframes.length > 0 && (
              <div className="mt-4 border-t border-[#eeeae4] pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#716d66]">
                  Images clés produites
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {job.keyframes.map((keyframe) => (
                    <figure
                      key={keyframe.number}
                      className="overflow-hidden rounded border border-[#eeeae4]"
                    >
                      <Image
                        src={keyframe.url}
                        alt={`Image-clé ${keyframe.number} : ${keyframe.title}`}
                        width={400}
                        height={225}
                        unoptimized
                        className="aspect-video w-full object-cover"
                      />
                      <figcaption className="px-2 py-1.5 text-xs text-[#716d66]">
                        {keyframe.number}. {keyframe.title}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}
            {job.qualityWarnings && job.qualityWarnings.length > 0 && (
              <div
                role="status"
                className="mt-4 rounded-md border border-[#eadfc7] bg-[#fbf6ed] p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[#675432]">
                  Points signalés par le contrôle automatique
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-4 text-[#765d39]">
                  {job.qualityWarnings.map((warning) => (
                    <li key={`${warning.shotNumber}-${warning.stage}`}>
                      ⚠ Plan {warning.shotNumber}
                      {warning.title ? ` · ${warning.title}` : ""} (
                      {warning.stage === "keyframe" ? "image-clé" : "clip"}) :{" "}
                      {warning.issues.join(" ; ") || "à vérifier"}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-[#626269]">
                  La vidéo a été générée malgré ces points ; à vérifier avant
                  validation.
                </p>
              </div>
            )}
            {typeof job.estimatedPriceFcfa === "number" && (
              <p className="mt-3 border-t border-[#eeeae4] pt-3 text-xs font-semibold text-[#716d66]">{`Montant total estimé · environ ${formatFcfa(job.estimatedPriceFcfa)}`}</p>
            )}
            {showPrompt && job.prompt && (
              <details className="mt-4 border-t border-[#eeeae4] pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-[#716d66]">
                  Voir le prompt généré
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#77736d]">
                  {job.prompt}
                </p>
              </details>
            )}
            {!jobRunning && (
              <button
                type="button"
                onClick={() => {
                  tracker.markSeen(job.id);
                  setFocusId(null);
                }}
                className="mt-3 min-h-10 text-xs font-semibold text-[#716d66] underline underline-offset-2"
              >
                Masquer ce suivi
              </button>
            )}
          </section>
        )}
      </div>

      <aside
        id="generation-options"
        className="min-w-0 space-y-3"
      >
        <section className="rounded-md border border-[#e2e2e5] bg-white p-4">
          <fieldset>
            <legend className="mb-2 text-[11px] font-semibold">
              Durée de la vidéo
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {availableDurationOptions.map((seconds) => (
                <button
                  type="button"
                  key={seconds}
                  onClick={() => {
                    setDurationS(seconds);
                    clearFormError();
                    if (seconds < 10 && placeIds.length > 1)
                      setPlaceIds((current) => current.slice(0, 1));
                  }}
                  aria-pressed={durationS === seconds}
                  className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-xs ${durationS === seconds ? "border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]" : "border-[#e5e2dd] text-[#77736d]"}`}
                >
                  {seconds} s
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#626269]">
              {tier === "premium"
                ? "Premium : quatre plans de 5 s + 2 s de logo animé = 22 s au total."
                : `${durationS} s de clips + 2 s de logo animé = ${durationS + 2} s au total.`}
            </p>
          </fieldset>
        </section>

        <section className="rounded-md border border-[#e2e2e5] bg-white p-4 text-[#161619]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[.04em]">
              Votre vidéo
            </h2>
            <span className="rounded-full bg-[#f2f1ef] px-2 py-1 text-xs text-[#626269]">
              {additionalDirection.trim() ? "Prête à lancer" : "Description à saisir"}
            </span>
          </div>
          <label className="mt-4 grid gap-1.5 text-[11px] font-semibold">
            Titre de la vidéo
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="Ex. Starlight EV · lancement Abidjan"
              className="min-h-11 rounded-md border border-[#e9e7e2] bg-white px-3 py-2 text-xs font-normal outline-none focus:border-[#c51e1c]"
            />
          </label>
          <label className="mt-4 grid gap-1.5 text-[11px] font-semibold">
            Véhicule
            <select
              value={vehicleDossierId}
              onChange={(event) => {
                const nextVehicle = vehicleDossiers.find(
                  (vehicle) => vehicle.key === event.target.value,
                );
                setVehicleDossierId(event.target.value);
                setAssetId(nextVehicle?.photos[0]?.id ?? "");
                clearFormError();
                setScenePresetId(
                  getScenePresets(
                    inferVehicleCategory(nextVehicle?.make, nextVehicle?.model),
                  )[0]?.id ?? "",
                );
              }}
              disabled={assetsLoading || !vehicleDossiers.length}
              className="min-h-11 rounded-md border border-[#e9e7e2] bg-white px-3 py-2 text-xs font-normal outline-none focus:border-[#c51e1c]"
            >
              <option value="">
                {assetsLoading ? "Chargement…" : "Choisissez un véhicule"}
              </option>
              {vehicleDossiers
                .filter((vehicle) => vehicle.photos.length > 0 && vehicle.id)
                .map((vehicle) => (
                  <option key={vehicle.key} value={vehicle.key}>
                    {vehicle.make} {vehicle.model}
                    {vehicle.color ? ` · ${vehicle.color}` : ""}
                  </option>
                ))}
            </select>
          </label>
          {selectedAsset && (
            <div className="mt-3 rounded-md bg-[#f8f7f4] p-2">
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden bg-[#ededeb]">
                  {selectedAsset.previewUrl ? (
                    <Image
                      src={selectedAsset.previewUrl}
                      alt={`${selectedAsset.make ?? "Véhicule"} ${selectedAsset.model ?? ""}`}
                      width={48}
                      height={48}
                      unoptimized
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-xl text-[#831810]" aria-hidden="true">
                      ◈
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-xs">
                    {selectedAsset.make} {selectedAsset.model}
                  </b>
                  <small className="mt-1 block truncate text-xs text-[#626269]">
                    {selectedAsset.color ?? "Photos validées"} ·{" "}
                    {selectedDossier?.photos.length ?? 0} vue(s) rattachée(s)
                  </small>
                </span>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {selectedDossier?.photos.map((photo, index) => (
                  <button
                    type="button"
                    key={photo.id}
                    onClick={() => setAssetId(photo.id)}
                    aria-pressed={photo.id === (selectedPhoto?.id ?? assetId)}
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded border ${photo.id === (selectedPhoto?.id ?? assetId) ? "border-[#c51e1c] ring-1 ring-[#c51e1c]" : "border-[#e5e2dd]"}`}
                  >
                    {photo.previewUrl && (
                      <Image
                        src={photo.previewUrl}
                        alt={photo.angle ?? photo.title ?? `Vue ${index + 1}`}
                        fill
                        sizes="80px"
                        unoptimized
                        className="object-cover"
                      />
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-left text-xs text-white">
                      {photo.angle ?? photo.title ?? `Vue ${index + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {assetsError && (
            <div
              role="alert"
              className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-700"
            >
              {assetsError}
              <button
                type="button"
                onClick={() => setAssetsRetry((value) => value + 1)}
                className="ml-2 font-semibold underline"
              >
                Réessayer
              </button>
            </div>
          )}
          {!assetsLoading && !assetsError && !vehicleDossiers.length && (
            <Link
              href="/mediatheque"
              className="mt-3 block rounded-md border border-dashed border-[#dad7d1] p-3 text-center text-xs text-[#817d76]"
            >
              ＋ Ajouter une photo validée
            </Link>
          )}
        </section>

        <section className="rounded-md border border-[#e2e2e5] bg-white p-4">
          <fieldset>
            <legend className="mb-1 text-[11px] font-semibold">
              Lieu réel · Côte d’Ivoire
            </legend>
            <p className="mb-3 text-xs leading-4 text-[#626269]">
              {durationS >= 10
                ? "À partir de 10 secondes, vous pouvez sélectionner plusieurs lieux."
                : "Pour les clips de moins de 10 secondes, un seul lieu est utilisé."}
            </p>
            {places.length ? (
              <div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto">
                {places.map((place) => {
                  const selected =
                    durationS >= 10
                      ? placeIds.includes(place.id)
                      : locationAssetId === place.id;
                  return (
                    <button
                      type="button"
                      key={place.id}
                      onClick={() => {
                        if (durationS >= 10) {
                          setPlaceIds((current) =>
                            selected
                              ? current.length > 1
                                ? current.filter((id) => id !== place.id)
                                : current
                              : [...current, place.id],
                          );
                          setLocationAssetId(
                            selected
                              ? (placeIds.find((id) => id !== place.id) ??
                                  place.id)
                              : place.id,
                          );
                        } else {
                          setLocationAssetId(
                            selected ? locationAssetId : place.id,
                          );
                          setPlaceIds([place.id]);
                        }
                        clearFormError();
                      }}
                      aria-pressed={selected}
                      className={`overflow-hidden rounded-md border text-left ${selected ? "border-[#c51e1c] ring-1 ring-[#c51e1c]" : "border-[#e5e2dd]"}`}
                    >
                      <span className="relative block h-16 bg-[#f4f2ef]">
                        {place.previewUrl && (
                          <Image
                            src={place.previewUrl}
                            alt=""
                            fill
                            sizes="140px"
                            unoptimized
                            className="object-cover"
                          />
                        )}
                      </span>
                      <span className="block truncate px-2 pt-1.5 text-xs font-medium text-[#4d4a45]">
                        {place.title ?? "Lieu"}
                      </span>
                      <span className="block truncate px-2 pb-1.5 text-xs text-[#626269]">
                        {place.category ?? "Côte d’Ivoire"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[#626269]">
                Aucun lieu validé disponible.
              </p>
            )}
            <PlaceTimeChoice places={effectivePlaceIds.map((id) => ({ id, timeOfDay: places.find((place) => place.id === id)?.placeProfile?.timeOfDay }))} transition={timeTransition} onTransition={() => { setTimeTransition(true); clearFormError(); }} onKeep={(ids) => { setPlaceIds(ids); setLocationAssetId(ids[0] ?? ''); setTimeTransition(false); clearFormError(); }} />
          </fieldset>
        </section>

        <section className="rounded-md border border-[#e2e2e5] bg-white p-4">
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-1 text-[11px] font-semibold">
                Casting
              </legend>
              <p className="mb-2 text-xs leading-4 text-[#626269]">
                {castAssets.length
                  ? `Jusqu’à ${MAX_CAST} personnes validées. Les mêmes personnes apparaissent dans toute la vidéo, sauf demande contraire dans la description.`
                  : "Aucune photo de casting validée. Ajoutez-en dans la médiathèque (catégorie Casting) pour garder les mêmes personnes d’un plan à l’autre."}
              </p>
              {castAssets.length > 0 && (
                <div className="grid max-h-48 grid-cols-3 gap-2 overflow-auto">
                  {castAssets.map((member) => {
                    const selected = castIds.includes(member.id);
                    return (
                      <button
                        type="button"
                        key={member.id}
                        onClick={() => {
                          setCastIds((current) =>
                            selected
                              ? current.filter((id) => id !== member.id)
                              : current.length >= MAX_CAST
                                ? current
                                : [...current, member.id],
                          );
                          clearFormError();
                        }}
                        aria-pressed={selected}
                        className={`overflow-hidden rounded-md border text-left ${selected ? "border-[#c51e1c] ring-1 ring-[#c51e1c]" : "border-[#e5e2dd]"}`}
                      >
                        <span className="relative block h-16 bg-[#f4f2ef]">
                          {member.previewUrl && (
                            <Image
                              src={member.previewUrl}
                              alt=""
                              fill
                              sizes="100px"
                              unoptimized
                              className="object-cover"
                            />
                          )}
                        </span>
                        <span className="block truncate px-1.5 py-1 text-xs text-[#4d4a45]">
                          {member.title ?? "Personne"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>
            {castIds.length === 0 && (
              <fieldset>
                <legend className="mb-2 text-[11px] font-semibold">
                  Personnage
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {peoplePresetIds.map((id) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => {
                        setPeoplePreset(id);
                        clearFormError();
                      }}
                      aria-pressed={peoplePreset === id}
                      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-xs transition ${peoplePreset === id ? "border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]" : "border-[#e5e2dd] text-[#77736d] hover:border-[#c51e1c]"}`}
                    >
                      {peoplePresets[id].label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-4 text-[#626269]">
                  Sans photo de casting, l’IA décrit la personne une fois et
                  la reprend dans chaque plan ; la ressemblance d’un plan à
                  l’autre reste approximative. Sans personnage, le véhicule
                  reste vide, sauf si la description demande des personnes.
                </p>
              </fieldset>
            )}
            {audioAssets.length > 0 && (
              <label className="grid gap-1.5 text-[11px] font-semibold">
                Musique
                <select
                  value={audioAssetId}
                  onChange={(event) => setAudioAssetId(event.target.value)}
                  className="min-h-11 rounded-md border border-[#e9e7e2] bg-white px-2 text-xs font-normal outline-none focus:border-[#c51e1c]"
                >
                  <option value="">Sans musique</option>
                  {audioAssets.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.title ?? "Piste validée"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset>
              <legend className="mb-2 text-[11px] font-semibold">
                Lumière
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {lightingChoices.map(({ label, scene }) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => setScenePresetId(scene.id)}
                    aria-pressed={
                      label === getLightingLabel(selectedScene?.lighting ?? "")
                    }
                    className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-xs transition ${label === getLightingLabel(selectedScene?.lighting ?? "") ? "border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]" : "border-[#e5e2dd] text-[#77736d] hover:border-[#c51e1c]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section className="rounded-md border border-[#e2e2e5] bg-white p-4">
          <fieldset>
            <legend className="mb-2 text-[11px] font-semibold">Format</legend>
            <div className="flex flex-wrap gap-1.5">
              {(["16:9", "9:16", "1:1"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => {
                    setFormat(value);
                    clearFormError();
                  }}
                  aria-pressed={format === value}
                  className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-xs ${format === value ? "border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]" : "border-[#e5e2dd] text-[#77736d]"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="mb-2 text-[11px] font-semibold">
              Niveau de génération
            </legend>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { value: "standard", label: "Standard" },
                  { value: "pro", label: "Pro" },
                  { value: "premium", label: "Premium" },
                ] as const
              ).map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    setTier(option.value);
                    if (option.value === "premium") setDurationS(20);
                    clearFormError();
                  }}
                  aria-pressed={tier === option.value}
                  className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-xs ${tier === option.value ? "border-[#c51e1c] bg-[#fff1ef] font-semibold text-[#b21c1a]" : "border-[#e5e2dd] text-[#77736d]"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#626269]">
              Clips générés : {durationS} s · vidéo finale avec logo :{" "}
              {durationS + 2} s.
            </p>
          </fieldset>
          {approvalBox.visible && (
            <label className="mt-4 flex min-h-11 items-start gap-2 text-xs text-[#242428]">
              <input
                type="checkbox"
                checked={approvalChecked}
                disabled={approvalBox.locked}
                onChange={(event) => setApprovalChoice(event.target.checked)}
                className="mt-0.5 size-4 accent-[#c51e1c]"
              />
              <span>
                <span className="font-semibold">Valider les images clés et les clips avant le montage</span>
                <span className="block text-[#626269]">
                  {approvalBox.locked
                    ? "Demandé par votre marque : les vidéos des plans, l’étape payante, attendent votre validation."
                    : "Les vidéos des plans, l’étape payante, attendent votre validation des images clés."}
                </span>
              </span>
            </label>
          )}
          {mode === "live" && modelsError && (
            <p
              role="alert"
              className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-700"
            >
              {modelsError}
            </p>
          )}
          {mode === "live" &&
            !modelsLoading &&
            !modelsError &&
            !storyboardModel && (
              <p
                role="alert"
                className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-700"
              >
                Aucune option disponible pour cette durée et ce format.
                Choisissez un autre niveau ou format.
              </p>
            )}
          {mode === "mock" && (
            <p className="mt-4 rounded-md bg-[#fbf6ed] p-3 text-xs leading-4 text-[#765d39]">
              Simulation active : aucune vidéo payante ne sera générée.
            </p>
          )}
          {mode === "live" && estimatedPriceFcfa != null && (
            <p className="mt-4 border-t border-[#eeeae4] pt-4 text-xs text-[#626269]">
              Estimation vidéo · environ {formatFcfa(estimatedPriceFcfa)}
            </p>
          )}
          <p className="mt-4 border-t border-[#eeeae4] pt-4 text-xs leading-4 text-[#626269]">
            La vidéo sera générée directement. Les plans et les lieux suivront
            automatiquement vos choix.
          </p>
        </section>
        <p className="px-1 text-xs leading-4 text-[#626269]">
          {multiClip
            ? "Les vues et lieux sélectionnés déterminent les plans, assemblés automatiquement."
            : "Un plan créatif. Si nécessaire, le modèle le répartit en plusieurs clips avant le montage final."}
        </p>
      </aside>
      <div className="space-y-3 xl:col-span-2">
        {pendingLaunch && (
          <div
            ref={conflictRef}
            role="status"
            className="rounded-md border border-[#e7d7b9] bg-[#fbf6ed] p-4 text-xs leading-5 text-[#765d39]"
          >
            <p className="font-semibold">
              Votre demande a été adaptée aux règles de la marque
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {pendingLaunch.conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
            <p className="mt-2">
              Le storyboard est prêt ; la vidéo n’est pas encore lancée.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void confirmLaunch()}
                disabled={busy}
                className="rounded-md bg-[#c51e1c] px-3 py-2 font-semibold text-white disabled:opacity-50"
              >
                Lancer la vidéo
              </button>
              <button
                type="button"
                onClick={() => setPendingLaunch(null)}
                disabled={busy}
                className="rounded-md border border-[#d2cec6] bg-white px-3 py-2 font-semibold text-[#253b4e]"
              >
                Modifier ma demande
              </button>
            </div>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-100 bg-red-50 p-4 text-xs leading-5 text-red-800"
          >
            <p>{error}</p>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 font-semibold underline underline-offset-2"
            >
              Réessayer la génération
            </button>
          </div>
        )}
        <button
          type="submit"
          disabled={
            busy ||
            launchBlocked ||
            pendingLaunch !== null ||
            !selectedDossier?.id ||
            !selectedDossier.photos.length ||
            (mode === "live" && (!storyboardModel || modelsLoading))
          }
          aria-describedby={
            launchBlocked ? "generation-lock-message" : pendingLaunch ? "conflict-choice-message" : undefined
          }
          className="w-full rounded-md bg-[#c51e1c] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[#a71715] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Le réalisateur prépare la vidéo…"
            : launchBlocked
              ? `${MAX_ACTIVE_VIDEOS} vidéos déjà en cours`
              : `Générer la vidéo · ${durationS} s`}
        </button>
        {pendingLaunch && !launchBlocked && (
          <p id="conflict-choice-message" className="text-center text-xs text-[#626269]">
            Choisissez d’abord dans l’encadré ci-dessus : lancer la vidéo adaptée ou modifier votre demande.
          </p>
        )}
        {launchBlocked && (
          <p
            id="generation-lock-message"
            className="text-center text-xs text-[#716d66]"
          >
            Attendez la fin de l’une de vos vidéos en cours pour en lancer une
            nouvelle.
          </p>
        )}
        <p className="text-center text-xs text-[#626269]">
          Lancement direct : les vues et lieux sélectionnés déterminent
          automatiquement les plans.
        </p>
      </div>
    </form>
  );
}
