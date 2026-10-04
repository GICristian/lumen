import { expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { buildSaveArgs, concatLine } from '../shared/replay';
import { normalizeWebmTracks } from '../shared/webmTracks';

it('keeps voice samples and video intact when independent segments reverse their stream order', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lumen-audio-'));
  const run = (args: string[]) => {
    const result = spawnSync(ffmpeg!, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    expect(result.status, result.stderr.toString()).toBe(0);
    return result;
  };
  try {
    const files: string[] = [];
    for (let index = 0; index < 3; index++) {
      const file = path.join(dir, `${index}.mkv`);
      run(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=30:duration=1',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
        ...(index === 1 ? ['-map', '1:a', '-map', '0:v'] : ['-map', '0:v', '-map', '1:a']),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-write_crc32', '0', file]);
      files.push(file);
    }
    const list = path.join(dir, 'list.txt');
    await writeFile(list, files.map(concatLine).join('\n'));
    // The previous index-based concat silently fed video packets to the audio decoder.
    const broken = spawnSync(ffmpeg!, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
      '-c:v', 'copy', '-c:a', 'aac', path.join(dir, 'broken.mp4')], { windowsHide: true });
    expect(broken.stderr.toString()).toMatch(/Error submitting|Error parsing/);
    const before = await readFile(files[1]);
    const after = normalizeWebmTracks(before);
    expect(after).not.toBe(before);
    expect(after.byteLength).toBe(before.byteLength);
    await writeFile(files[1], after);
    const output = path.join(dir, 'saved.mp4');
    run(buildSaveArgs(list, output, true, 3));
    const decoded = run(['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-']);
    expect(decoded.stderr.toString()).not.toMatch(/Invalid data|no frame|Error submitting/);
    const audio = run(['-v', 'error', '-i', output, '-vn', '-ac', '1', '-f', 'f32le', '-']);
    const samples = audio.stdout.length / 4;
    expect(samples / 48000).toBeGreaterThan(2.95);
    expect(samples / 48000).toBeLessThan(3.05);
    let peak = 0;
    for (let at = 0; at < audio.stdout.length; at += 4) peak = Math.max(peak, Math.abs(audio.stdout.readFloatLE(at)));
    expect(peak).toBeGreaterThan(.08);
    expect(peak).toBeLessThan(.5); // Allow codec transients, never full-scale bursts from wrong packets.
    for (const seconds of [.2, 1.2, 2.2]) {
      let sum = 0;
      const start = Math.floor(seconds * 48000);
      for (let n = start; n < start + 4800; n++) sum += audio.stdout.readFloatLE(n * 4) ** 2;
      expect(Math.sqrt(sum / 4800)).toBeGreaterThan(.06);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}, 15000);

it('leaves truncated and unrelated headers intact', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array([0x18, 0x53]), new Uint8Array([0, 1, 2])]) {
    expect(normalizeWebmTracks(bytes)).toBe(bytes);
  }
});
