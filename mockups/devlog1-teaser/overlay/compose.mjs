import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
const { values: o } = parseArgs({ options: {
  bg: { type: 'string', multiple: true },
  overlay: { type: 'string', default: 'overlay-1920x1080.mov' },
  audio: { type: 'string', default: 'blips.wav' },
  size: { type: 'string', default: '1920x1080' },
  duration: { type: 'string', default: '20' },
  out: { type: 'string', default: 'sample.mp4' }
} });
const [W, H] = o.size.split('x').map(Number);
const segs = (o.bg || []).map(spec => {
  const m = spec.match(/^(.*?)(?:@([\d.]+)\+([\d.]+))?$/);
  return { path: m[1], start: m[2] || '0', len: m[3] };
});
if (!segs.length) { console.error('pass --bg path[@start+seconds] one or more times'); process.exit(2); }
const inputs = segs.flatMap(s => [...(/\.(png|jpe?g)$/i.test(s.path) ? ['-loop', '1', '-framerate', '60'] : []), '-ss', s.start, ...(s.len ? ['-t', s.len] : ['-t', o.duration]), '-i', s.path]);
const fit = segs.map((_, i) => `[${i}:v]fps=60,scale=${W}:${H}:force_original_aspect_ratio=increase:flags=neighbor,crop=${W}:${H},setsar=1,setpts=PTS-STARTPTS[b${i}]`).join(';');
const bg = `${fit};${segs.map((_, i) => `[b${i}]`).join('')}concat=n=${segs.length}:v=1:a=0[bg]`;
const n = segs.length;
const args = ['-loglevel', 'error', '-y', ...inputs, ...(/\.webm$/i.test(o.overlay) ? ['-c:v', 'libvpx-vp9'] : []), '-i', o.overlay, '-i', o.audio,
  '-filter_complex', `${bg};[bg][${n}:v]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]`,
  '-map', '[v]', '-map', `${n + 1}:a`, '-r', '60', '-t', o.duration,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', o.out];
const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
