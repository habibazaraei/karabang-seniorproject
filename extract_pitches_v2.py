"""
extract_pitches_v2.py
---------------------
Uses multiple pitch detection strategies and picks the best result per frame.

Improvements over v1:
- Tries both pyin AND autocorrelation, picks the more confident result
- Applies harmonic filtering to reduce octave errors
- Smooths out jitter between frames
- Better silence detection using RMS energy
- Lower confidence thresholds to catch more voiced frames
- Handles complex vocals (falsetto, harmonies, rapid changes)

Usage:
    py extract_pitches_v2.py --audio vocals.mp3 --out song_pitches.json
    py extract_pitches_v2.py --folder ./audio/vocals/

Requirements:
    pip install librosa numpy scipy soundfile
"""

import argparse
import json
import os
import numpy as np
import librosa
from scipy.signal import medfilt


# ─── Configuration ─────

HOP_DURATION = 0.01    # seconds between frames (10ms)
MIN_NOTE = "A1"    # lowest expected note (~55 Hz)
MAX_NOTE = "C8"    # highest expected note (~4186 Hz)
CONFIDENCE_THRESH  = 0.12    # lower = more frames detected (was 0.5)
RMS_THRESH  = 0.002   # silence threshold (lower = more sensitive)
SMOOTH_WINDOW = 5       # median filter window for smoothing jitter


# ─── Core Extraction ──────

def extract_pitches(audio_path: str) -> dict:
    print(f"\nLoading: {audio_path}")
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    hop_length = int(sr * HOP_DURATION)

    print(f" Duration : {len(y)/sr:.1f}s")
    print(f" Sample rate: {sr} Hz")

    # ── Step 1: RMS energy per frame (to detect silence) ────
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]

    # ── Step 2: PYIN pitch detection ─────
    print("  Running pyin pitch detection...")
    f0_pyin, voiced_flag, voiced_probs = librosa.pyin(
        y,
        fmin=librosa.note_to_hz(MIN_NOTE),
        fmax=librosa.note_to_hz(MAX_NOTE),
        sr=sr,
        hop_length=hop_length,
        fill_na=0.0,
    )

    # ── Step 3: Autocorrelation pitch detection (backup) ──────
    print("  Running autocorrelation pitch detection...")
    f0_ac = librosa.yin(
        y,
        fmin=librosa.note_to_hz(MIN_NOTE),
        fmax=librosa.note_to_hz(MAX_NOTE),
        sr=sr,
        hop_length=hop_length,
    )

    # ── Step 4: Merge both detections ───────
    # Align lengths (they can differ by 1 frame)
    min_len = min(len(f0_pyin), len(f0_ac), len(voiced_probs), len(rms))
    f0_pyin = f0_pyin[:min_len]
    f0_ac = f0_ac[:min_len]
    voiced_probs = voiced_probs[:min_len]
    rms = rms[:min_len]

    f0_merged = np.zeros(min_len)

    for i in range(min_len):
        # Skip silent frames
        if rms[i] < RMS_THRESH:
            continue

        pyin_val  = f0_pyin[i] if f0_pyin[i] > 0 else 0
        ac_val = f0_ac[i]if f0_ac[i] > 0   else 0
        prob = voiced_probs[i]

        if prob >= CONFIDENCE_THRESH and pyin_val > 0:
            # Trust pyin when confident
            f0_merged[i] = pyin_val
        elif ac_val > 0 and rms[i] > RMS_THRESH * 3:
            # Fall back to autocorrelation for louder frames
            f0_merged[i] = ac_val
        elif pyin_val > 0 and prob >= CONFIDENCE_THRESH * 0.5:
            # Accept lower confidence pyin if it's all we have
            f0_merged[i] = pyin_val

    # ── Step 5: Octave correction ────
    # Sometimes pitch detectors report an octave too high or too low.
    # If a frame jumps more than 1 octave from its neighbors, correct it.
    f0_merged = correct_octave_errors(f0_merged)

    # ── Step 6: Smooth out jitter ─────
    # Apply median filter to remove single-frame spikes
    nonzero_mask = f0_merged > 0
    if np.any(nonzero_mask):
        smoothed = medfilt(f0_merged, kernel_size=SMOOTH_WINDOW)
        # Only apply smoothing where we had a pitch (don't fill silence)
        f0_merged = np.where(nonzero_mask, smoothed, 0.0)

    # ── Step 7: Fill small gaps ───────
    # If a voiced frame is surrounded by voiced frames, fill it in
    f0_merged = fill_small_gaps(f0_merged, max_gap=3)

    # ── Results ──────
    voiced_count = np.sum(f0_merged > 0)
    print(f"  Voiced frames: {voiced_count} / {min_len} ({100*voiced_count/min_len:.1f}%)")

    pitches = [round(float(p), 2) for p in f0_merged]
    return {"hop_duration": HOP_DURATION, "pitches": pitches}


# ─── Helper Functions ───────

def correct_octave_errors(f0: np.ndarray, threshold: float = 0.6) -> np.ndarray:
    """
    Corrects frames that jump more than a 6th (threshold ratio) from neighbors.
    Octave errors show up as sudden 2x or 0.5x jumps in frequency.
    """
    corrected = f0.copy()
    for i in range(1, len(f0) - 1):
        if f0[i] <= 0:
            continue
        prev = f0[i - 1] if f0[i - 1] > 0 else None
        nxt = f0[i + 1] if f0[i + 1] > 0 else None

        neighbors = [n for n in [prev, nxt] if n is not None]
        if not neighbors:
            continue

        avg_neighbor = np.mean(neighbors)

        # Check if current frame is an octave above neighbors
        if f0[i] / avg_neighbor > 1.8:
            corrected[i] = f0[i] / 2
        # Check if current frame is an octave below neighbors
        elif avg_neighbor / f0[i] > 1.8:
            corrected[i] = f0[i] * 2

    return corrected


def fill_small_gaps(f0: np.ndarray, max_gap: int = 3) -> np.ndarray:
    """
    Fills short silent gaps between voiced frames using linear interpolation.
    Gaps longer than max_gap frames are left as silence.
    """
    filled = f0.copy()   
    i = 0
    while i < len(f0):
        if f0[i] == 0:
            # Find the end of this gap
            gap_start = i
            while i < len(f0) and f0[i] == 0:
                i += 1
            gap_end = i
            gap_len = gap_end - gap_start

            # Only fill short gaps between voiced frames
            if gap_len <= max_gap and gap_start > 0 and gap_end < len(f0):
                start_val = f0[gap_start - 1]
                end_val   = f0[gap_end]
                if start_val > 0 and end_val > 0:
                    interpolated = np.linspace(start_val, end_val, gap_len + 2)[1:-1]
                    filled[gap_start:gap_end] = interpolated
        else:
            i += 1
    return filled


# ─── File I/O ─────

def process_file(audio_path: str, out_path: str = None):
    if out_path is None:
        base    = os.path.splitext(audio_path)[0]
        out_path = base + "_pitches.json"

    data = extract_pitches(audio_path)

    with open(out_path, "w") as f:
        json.dump(data, f)

    print(f"  Saved → {out_path}")


def process_folder(folder: str):
    extensions = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}
    found = 0
    for fname in sorted(os.listdir(folder)):
        ext = os.path.splitext(fname)[1].lower()
        if ext in extensions:
            process_file(os.path.join(folder, fname))
            found += 1
    if found == 0:
        print("No audio files found in folder.")


# ─── Entry Point ─────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Improved pitch extractor for KaraBang.")
    parser.add_argument("--audio",  help="Path to a single audio file (preferably vocals only)")
    parser.add_argument("--out",    help="Output JSON path (optional)")
    parser.add_argument("--folder", help="Batch process all audio files in a folder")
    args = parser.parse_args()

    if args.folder:
        process_folder(args.folder)
    elif args.audio:
        process_file(args.audio, args.out)
    else:
        parser.print_help()
