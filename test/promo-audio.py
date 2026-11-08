"""Builds the promo video's soundtrack and muxes it into dist/grabbit-promo.mp4.

Voiceover: Kokoro-82M (Apache-2.0) via kokoro-onnx, voice "af_heart".
Music: an original track synthesized here (no samples, no licensing questions), ducked under the voice.
Clicks: short synthesized ticks at the cursor clicks in test/promo-video.js.

Setup (once):
  python3 -m venv tts && tts/bin/pip install kokoro-onnx soundfile scipy huggingface_hub
  model + voice from huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
  (onnx/model.onnx and voices/af_heart.bin, packed into voices.npz; see KOKORO_DIR below)
Run:
  KOKORO_DIR=path/to/kokoro tts/bin/python test/promo-audio.py
"""
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
VIDEO = os.path.join(DIST, 'grabbit-promo.mp4')
OUT = os.path.join(DIST, 'grabbit-promo-final.mp4')  # then replaces grabbit-promo.mp4
KDIR = os.environ.get('KOKORO_DIR', 'kokoro')
SR = 48000
DURATION = 56.0
VOICE = 'af_heart'

# (start second, line, window in seconds): windows match the scenes in test/promo-video.js
LINES = [
    (0.4, "Still copying website data by hand? There's a free, one-click fix.", 4.0),
    (5.0, "Open Grabbit on any page, and it finds the lists and tables for you.", 5.8),
    (11.3, "Wrong list? Just click any item, and Grabbit grabs everything like it.", 6.0),
    (17.8, "It follows Next buttons and infinite scroll, so you get every page, automatically.", 9.0),
    (27.3, "It even finds emails, phone numbers, and social profiles.", 4.6),
    (32.3, "Or paste hundreds of links, and scrape them all at once.", 4.6),
    (37.3, "Schedule it to track prices and stock, on autopilot.", 4.6),
    (42.4, "Then export to Excel, CSV, JSON, or Google Sheets, in one click.", 7.3),
    (50.4, "Grabbit. Free, private, and no account needed. Add it to Chrome today.", 5.4),
]
CLICKS = [12.2, 14.3, 18.4, 20.1, 44.3]


def resample(x, sr_from, sr_to):
    n = int(round(len(x) * sr_to / sr_from))
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def voiceover():
    k = Kokoro(os.path.join(KDIR, 'onnx', 'model.onnx'), os.path.join(KDIR, 'voices.npz'))
    track = np.zeros(int(DURATION * SR), np.float32)
    for start, text, window in LINES:
        speed = 1.0
        while True:  # speed up a little if a line would run past its scene
            a, sr = k.create(text, voice=VOICE, speed=speed, lang='en-us')
            if len(a) / sr <= window or speed >= 1.2:
                break
            speed = round(speed + 0.05, 2)
        a = resample(a, sr, SR)
        a = a / (np.abs(a).max() + 1e-9) * 0.9
        i = int(start * SR)
        track[i:i + len(a)] += a[: len(track) - i]
        print(f'  {start:5.1f}s  {len(a) / SR:4.1f}s / {window}s  speed {speed}  "{text}"')
    return track


def music():
    """Warm, light, 104 BPM: pad chords + plucked arpeggio + soft kick and shaker. C - G - Am - F."""
    t = np.arange(int(DURATION * SR)) / SR
    bpm = 104
    beat = 60 / bpm
    bar = beat * 4
    chords = [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]]  # MIDI
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    out = np.zeros_like(t)
    chord_at = lambda s: chords[int(s // bar) % 4]
    # pad: detuned sines with slow attack per bar
    for c in range(int(DURATION // bar) + 1):
        s0 = c * bar
        idx = (t >= s0) & (t < s0 + bar + 0.4)
        tt = t[idx] - s0
        env = np.minimum(1, tt / 0.6) * np.exp(-np.maximum(0, tt - bar) * 6)
        for m in chords[c % 4]:
            for det in (-0.12, 0.12):
                f = hz(m - 12) * 2 ** (det / 12)
                out[idx] += 0.05 * env * np.sin(2 * np.pi * f * tt)
    # pluck arpeggio on eighth notes
    eighth = beat / 2
    for n in range(int(DURATION / eighth)):
        s0 = n * eighth
        ch = chord_at(s0)
        m = ch[[0, 2, 1, 3, 2, 1, 3, 2][n % 8]] + 12
        idx = (t >= s0) & (t < s0 + 0.5)
        tt = t[idx] - s0
        f = hz(m)
        out[idx] += 0.06 * np.exp(-tt * 9) * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt))
    # soft kick on beats 1 and 3, shaker on off-beats
    rng = np.random.default_rng(7)
    for n in range(int(DURATION / beat)):
        s0 = n * beat
        if n % 2 == 0:
            idx = (t >= s0) & (t < s0 + 0.3)
            tt = t[idx] - s0
            out[idx] += 0.22 * np.exp(-tt * 18) * np.sin(2 * np.pi * (50 + 70 * np.exp(-tt * 30)) * tt)
        s1 = s0 + beat / 2
        idx = (t >= s1) & (t < s1 + 0.06)
        out[idx] += 0.025 * rng.standard_normal(idx.sum()) * np.exp(-(t[idx] - s1) * 60)
    out = sosfilt(butter(4, 7000, 'low', fs=SR, output='sos'), out)
    # fade in, and swell at the end card
    fade = np.minimum(1, t / 1.5) * np.minimum(1, (DURATION - t) / 2.5)
    out *= fade * (1 + 0.5 * np.clip((t - 49.5) / 1.0, 0, 1))
    return (out / np.abs(out).max() * 0.5).astype(np.float32)


def clicks():
    track = np.zeros(int(DURATION * SR), np.float32)
    for c in CLICKS:
        i = int(c * SR)
        tt = np.arange(int(0.04 * SR)) / SR
        track[i:i + len(tt)] += 0.35 * np.exp(-tt * 140) * np.sin(2 * np.pi * 2200 * tt)
    return track


def duck(music_track, voice_track):
    """Lower the music to ~30% while someone is speaking, with smooth 150 ms ramps."""
    env = np.abs(voice_track)
    win = int(0.15 * SR)
    env = np.convolve(env, np.ones(win) / win, mode='same')
    speaking = (env > 0.02).astype(np.float32)
    speaking = np.convolve(speaking, np.ones(win) / win, mode='same')
    return music_track * (1 - 0.7 * np.clip(speaking, 0, 1))


def main():
    print('voiceover:')
    v = voiceover()
    m = duck(music(), v)
    mix = 0.95 * v + 0.55 * m + clicks()
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)  # gentle limiter
    wav = os.path.join(DIST, 'grabbit-promo-audio.wav')
    sf.write(wav, np.stack([mix, mix], 1), SR)
    # YouTube plays at about -14 LUFS; normalize so the voice is clear and nothing clips.
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', VIDEO, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest',
                    '-movflags', '+faststart', OUT], check=True)
    os.replace(OUT, VIDEO)
    os.remove(wav)
    print('wrote', os.path.relpath(VIDEO, ROOT), '(video + voiceover + music)')


if __name__ == '__main__':
    sys.exit(main())
