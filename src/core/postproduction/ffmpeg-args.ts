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

export type VideoFormat = '16:9' | '9:16' | '1:1' | '4:5';

const OUTPUT_DIMENSIONS: Record<VideoFormat, [number, number]> = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [1080, 1080],
  '4:5': [864, 1080],
};

export function normalizeVideoFormat(value: unknown): VideoFormat {
  return value === '9:16' || value === '1:1' || value === '4:5' ? value : '16:9';
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

/** Older versions without the setting inherit the new default: logo enabled. */
export function shouldOverlayLogo(briefJson: unknown) {
  return !briefJson || typeof briefJson !== 'object' || !('overlayLogo' in briefJson) || briefJson.overlayLogo !== false;
}
