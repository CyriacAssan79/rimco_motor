// Local synthetic benchmark, no network or provider calls. At most six five-second 1080p clips, one encoder thread.
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';

const directory = await mkdtemp(join(tmpdir(), 'rimco-preview-bench-'));
try {
  const source = join(directory, 'source.mp4');
  let result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=5', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', source], { timeout: 55_000, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  const filters = Array.from({ length: 6 }, (_, i) => `[${i}:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,setpts=PTS-STARTPTS[v${i}]`);
  filters.push(`${Array.from({ length: 6 }, (_, i) => `[v${i}]`).join('')}concat=n=6:v=1:a=0[out]`);
  const start = performance.now();
  result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...Array.from({ length: 6 }, () => ['-i', source]).flat(), '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-threads', '1', '-movflags', '+faststart', join(directory, 'preview.mp4')], { timeout: 50_000, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  console.log(JSON.stringify({ shots: 6, input: '1080p/30fps', output: '540p/24fps', seconds: 30, encoderThreads: 1, encodingMs: Math.round(performance.now() - start) }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
