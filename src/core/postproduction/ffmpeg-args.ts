type FinalVideoArgs = {
  rawFile: string;
  audioFile: string | null;
  logoFile: string;
  outputFile: string;
  durationSeconds: number;
  overlayLogo: boolean;
  format?: VideoFormat;
};

type MontageArgs = {
  shotFiles: [string, string];
  logoFile: string;
  outputFile: string;
  durationSeconds: number;
  overlayLogo: boolean;
  format?: VideoFormat;
};

type MultiClipMontageArgs = {
  shotFiles: string[];
  shotDurations: number[];
  logoFile: string;
  outputFile: string;
  finalDurationSeconds: number;
  clipDurationSeconds?: 5 | 10 | 15 | 20;
  singleStoryboardMode?: boolean;
  qualityCrf?: number;
  format?: VideoFormat;
  /** Seconds skipped at the head of each generated clip (I2V clips often start almost still). */
  shotStartOffsets?: number[];
  /** Optional validated music bed, looped/trimmed to the final duration with fades. */
  audioFile?: string | null;
  /** Light common grade (contrast, saturation) to unify clips from different engines. */
  grade?: boolean;
  /** Montage cadence chosen from the clips' native frame rates (see chooseMontageFps); defaults to 24. */
  fps?: number;
};

type PhotoFidelityShotArgs = {
  backgroundFile: string;
  vehicleFile?: string;
  outputFile: string;
  durationSeconds: number;
  format?: VideoFormat;
};

export type VideoFormat = '16:9' | '9:16' | '1:1' | '4:5';

const OUTPUT_DIMENSIONS: Record<VideoFormat, [number, number]> = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [1080, 1080],
  '4:5': [864, 1080],
};

/** Storyboard montages are delivered in 1080p; generated clips are upscaled with lanczos. */
const MONTAGE_DIMENSIONS: Record<VideoFormat, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
};

/** Starting point to be calibrated with the DA: subtle, never a look that changes paint color. */
// Film grain (noise=alls=3:allf=t) helps against the 'plastic' look but costs ~60 % more encode time:
// enable it once the montage runs in a worker instead of a 60 s serverless function.
/** Default montage cadence when the clips' native frame rate cannot be read. */
export const MONTAGE_FPS = 24;
/** Cadences the montage may keep. Converting 30 → 24 drops one frame in five and makes wheels and backgrounds judder. */
export const MONTAGE_FPS_CHOICES = [24, 25, 30] as const;

/** Reads the video frame rate printed by `ffmpeg -i` (ffprobe is not shipped with ffmpeg-static). */
export function parseFfmpegFps(stderr: string): number | null {
  const match = /Stream #[^\n]*Video:[^\n]*?([\d.]+) fps/.exec(stderr) ?? /Stream #[^\n]*Video:[^\n]*?([\d.]+) tbr/.exec(stderr);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Keeps the dominant native cadence of the clips (23.976 → 24, 29.97 → 30) instead of forcing 24 i/s.
 * Ties go to the higher cadence (fewer dropped frames); unknown rates fall back to 24. Never interpolates.
 */
export function chooseMontageFps(rates: Array<number | null>): number {
  const counts = new Map<number, number>();
  for (const rate of rates) {
    if (rate === null || !Number.isFinite(rate) || rate <= 0) continue;
    const nearest = MONTAGE_FPS_CHOICES.reduce((best, choice) => Math.abs(choice - rate) < Math.abs(best - rate) ? choice : best, MONTAGE_FPS_CHOICES[0] as number);
    if (Math.abs(nearest - rate) > 1.5) continue;
    counts.set(nearest, (counts.get(nearest) ?? 0) + 1);
  }
  if (!counts.size) return MONTAGE_FPS;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}
/** Encoding quality of the 1080p montage: CRF 20 keeps the file and the Supabase egress close to the 720p version. */
export const MONTAGE_CRF = 20;
/** The bitmap logo is never enlarged more than this: beyond it, the brand mark turns soft. Provide an HD logo to reach the target size. */
export const MAX_LOGO_UPSCALE = 1.5;

export const MONTAGE_GRADE_FILTER = 'eq=contrast=1.04:saturation=1.05:gamma=0.99';

export function normalizeVideoFormat(value: unknown): VideoFormat {
  return value === '9:16' || value === '1:1' || value === '4:5' ? value : '16:9';
}

/** Build one deterministic shot from the original location image and optional alpha vehicle cutout. */
export function makePhotoFidelityShotArgs(input: PhotoFidelityShotArgs) {
  const format = normalizeVideoFormat(input.format);
  const [width, height] = OUTPUT_DIMENSIONS[format];
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', input.backgroundFile];
  let composition = '[0:v:0]scale=' + width + ':' + height + ':force_original_aspect_ratio=increase,crop=' + width + ':' + height + ',setsar=1[background]';
  if (input.vehicleFile) {
    args.push('-loop', '1', '-framerate', '30', '-i', input.vehicleFile);
    composition += `;[1:v:0]format=rgba,scale=${Math.round(width * 0.62)}:${Math.round(height * 0.7)}:force_original_aspect_ratio=decrease[vehicle];[background][vehicle]overlay=x=(W-w)/2:y=(H-h)/2:format=auto:shortest=1[scene]`;
  } else composition += ';[background]copy[scene]';
  composition += `;[scene]zoompan=z='min(zoom+0.00008,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=30,trim=duration=${input.durationSeconds},setpts=PTS-STARTPTS,format=yuv420p[vout]`;
  args.push('-filter_complex', composition, '-map', '[vout]', '-an', '-t', String(input.durationSeconds), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', input.outputFile);
  return args;
}

function normalizeVideoFilter(format: VideoFormat, source: string, output: string) {
  const [width, height] = OUTPUT_DIMENSIONS[format];
  return `[${source}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[${output}]`;
}

export function makeFinalVideoArgs(input: FinalVideoArgs) {
  const format = normalizeVideoFormat(input.format);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input.rawFile];
  if (input.audioFile) args.push('-stream_loop', '-1', '-i', input.audioFile);
  if (input.overlayLogo) args.push('-loop', '1', '-i', input.logoFile);

  if (!input.overlayLogo) {
    args.push('-filter_complex', normalizeVideoFilter(format, '0:v:0', 'base'), '-map', '[base]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p');
  }
  else {
    const logoIndex = input.audioFile ? 2 : 1;
    // Taille lisible sans dominer l’image (12 % de la largeur vidéo).
    args.push(
      '-filter_complex',
      `${normalizeVideoFilter(format, '0:v:0', 'normalized')};[${logoIndex}:v:0]format=rgba[logo_rgba];[logo_rgba][normalized]scale2ref=w=main_w*0.12:h=-1[logo][base];[base][logo]overlay=x=main_w*0.035:y=main_h*0.035:format=auto:eof_action=repeat[vout]`,
      '-map', '[vout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    );
  }

  if (input.audioFile) args.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '128k');
  else args.push('-an');
  args.push('-t', String(input.durationSeconds), '-movflags', '+faststart', input.outputFile);
  return args;
}

export function makeShotMontageArgs(input: MontageArgs) {
  const format = normalizeVideoFormat(input.format);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input.shotFiles[0], '-i', input.shotFiles[1]];
  if (input.overlayLogo) args.push('-loop', '1', '-i', input.logoFile);
  const concat = `[0:v:0][1:v:0]concat=n=2:v=1:a=0[concat]`;
  if (input.overlayLogo) {
    // Même échelle pour les montages storyboard afin de garder une identité constante.
    args.push(
      '-filter_complex',
      `${concat};${normalizeVideoFilter(format, 'concat', 'normalized')};[2:v:0]format=rgba[logo_rgba];[logo_rgba][normalized]scale2ref=w=main_w*0.12:h=-1[logo][video];[video][logo]overlay=x=main_w*0.035:y=main_h*0.035:format=auto:eof_action=repeat[vout]`,
      '-map', '[vout]',
    );
  } else args.push('-filter_complex', `${concat};${normalizeVideoFilter(format, 'concat', 'vout')}`, '-map', '[vout]');
  args.push('-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(input.durationSeconds), input.outputFile);
  return args;
}

/** Assemble generated footage, then append a distinct two-second animated brand end card. */
export function makeMultiClipMontageArgs(input: MultiClipMontageArgs) {
  if (input.shotFiles.length < 1 || input.shotFiles.length > 6 || input.shotFiles.length !== input.shotDurations.length) throw new Error('Le montage ne contient pas le nombre attendu de plans.');
  const clipSeconds = input.shotDurations.reduce((sum, seconds) => sum + seconds, 0);
  const hasNewDurationContract = input.clipDurationSeconds !== undefined;
  if (hasNewDurationContract && (![7, 12, 17, 22].includes(input.finalDurationSeconds) || input.finalDurationSeconds !== input.clipDurationSeconds! + 2)) throw new Error('La vidéo finale doit ajouter exactement deux secondes au logo.');
  if (!hasNewDurationContract && ![5, 10, 15, 20, 30].includes(input.finalDurationSeconds)) throw new Error('La durée enregistrée n’est pas prise en charge.');
  const footageSeconds = input.clipDurationSeconds ?? input.finalDurationSeconds - 2;
  if ((input.singleStoryboardMode ? clipSeconds < footageSeconds : clipSeconds !== footageSeconds) || input.shotDurations.some((seconds) => !Number.isFinite(seconds) || seconds <= 0)) throw new Error('Les plans doivent laisser exactement deux secondes au logo final.');
  const offsets = input.shotStartOffsets ?? [];
  if (offsets.length && (offsets.length !== input.shotFiles.length || offsets.some((offset) => !Number.isFinite(offset) || offset < 0 || offset > 2))) throw new Error('Les décalages de début de plan sont invalides.');
  const format = normalizeVideoFormat(input.format);
  const [width, height] = MONTAGE_DIMENSIONS[format];
  const grade = input.grade !== false;
  const fps = MONTAGE_FPS_CHOICES.includes(input.fps as (typeof MONTAGE_FPS_CHOICES)[number]) ? input.fps! : MONTAGE_FPS;
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  input.shotFiles.forEach((file) => args.push('-i', file));
  args.push('-loop', '1', '-i', input.logoFile);
  const audioIndex = input.shotFiles.length + 1;
  if (input.audioFile) args.push('-stream_loop', '-1', '-i', input.audioFile);
  const filters = input.shotFiles.map((_, index) => {
    const offset = offsets[index] ?? 0;
    const head = offset > 0 ? `trim=start=${offset},` : '';
    return `[${index}:v:0]${head}setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${input.shotDurations[index]},trim=duration=${input.shotDurations[index]},scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},setsar=1,fps=${fps}[v${index}]`;
  });
  filters.push(`${input.shotFiles.map((_, index) => `[v${index}]`).join('')}concat=n=${input.shotFiles.length}:v=1:a=0[footage_all]`);
  filters.push(`[footage_all]trim=duration=${footageSeconds},setpts=PTS-STARTPTS${grade ? `,${MONTAGE_GRADE_FILTER}` : ''}[footage]`);
  // End card: logo aimed at ~32 % of the frame width, capped at 1.5x its native size so it never turns soft.
  const logoWidth = Math.round(Math.min(width, height * 1.6) * 0.32);
  filters.push(`color=c=white:s=${width}x${height}:r=${fps}:d=2[card];[${input.shotFiles.length}:v:0]format=rgba,scale=w='min(${logoWidth},iw*${MAX_LOGO_UPSCALE})*(0.94+0.06*min(t/0.6,1))':h=-1:eval=frame:flags=lanczos[logo];[card][logo]overlay=(W-w)/2:(H-h)/2:format=auto,fade=t=in:st=0:d=0.45,fade=t=out:st=1.55:d=0.45,fps=${fps}[brand]`);
  filters.push('[footage][brand]concat=n=2:v=1:a=0[vout]');
  if (input.audioFile) {
    const fadeOutStart = Math.max(0, input.finalDurationSeconds - 1.5);
    filters.push(`[${audioIndex}:a:0]atrim=duration=${input.finalDurationSeconds},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=${fadeOutStart}:d=1.5[aout]`);
  }
  const qualityCrf = Number.isInteger(input.qualityCrf) && input.qualityCrf! >= 0 && input.qualityCrf! <= 51 ? input.qualityCrf! : MONTAGE_CRF;
  args.push('-filter_complex', filters.join(';'), '-map', '[vout]');
  if (input.audioFile) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
  else args.push('-an');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(qualityCrf), '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', '-t', String(input.finalDurationSeconds), input.outputFile);
  return args;
}

/** On-demand review preview: silent, no logo, 540p, at most six clips, normalized before concatenation. */
export function makeClipPreviewArgs(input: { shotFiles: string[]; shotDurations: number[]; outputFile: string; format: VideoFormat }) {
  if (!input.shotFiles.length || input.shotFiles.length > 6 || input.shotFiles.length !== input.shotDurations.length || input.shotDurations.some((n) => !Number.isFinite(n) || n <= 0 || n > 30)) throw new Error('Les clips de l’aperçu sont invalides.');
  const dimensions: Record<VideoFormat, [number, number]> = { '16:9': [960, 540], '9:16': [540, 960], '1:1': [540, 540], '4:5': [432, 540] };
  const [w, h] = dimensions[input.format];
  const filters = input.shotFiles.map((_, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,trim=duration=${input.shotDurations[i]},setpts=PTS-STARTPTS[v${i}]`);
  filters.push(`${input.shotFiles.map((_, i) => `[v${i}]`).join('')}concat=n=${input.shotFiles.length}:v=1:a=0[out]`);
  return ['-hide_banner', '-loglevel', 'error', '-y', ...input.shotFiles.flatMap((file) => ['-i', file]), '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-threads', '1', '-movflags', '+faststart', input.outputFile];
}

/** Older versions without the setting inherit the new default: logo enabled. */
export function shouldOverlayLogo(briefJson: unknown) {
  return !briefJson || typeof briefJson !== 'object' || !('overlayLogo' in briefJson) || briefJson.overlayLogo !== false;
}
