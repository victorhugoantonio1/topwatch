"""Gera o som do alerta grave (renderer/sounds/alerta.wav): dois toques curtos, subindo, com um eco leve.

Sintetizado aqui mesmo, sem amostra de terceiros. Uso: python scripts/alert-sound.py (precisa do numpy)
"""

import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "renderer" / "sounds" / "alerta.wav"


def tone(f, dur, at, buf, gain):
    t = np.arange(int(dur * SR)) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 9) + 0.12 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 14)
    s *= np.exp(-t * 6.5) * np.minimum(1, t / 0.004)
    i = int(at * SR)
    buf[i : i + len(s)] += s * gain


buf = np.zeros(int(1.1 * SR))
tone(784.0, 0.6, 0.00, buf, 0.55)  # G5
tone(1046.5, 0.8, 0.16, buf, 0.6)  # C6
echo = np.zeros_like(buf)
d = int(0.12 * SR)
echo[d:] = buf[:-d] * 0.22
buf += echo
buf *= np.linspace(1, 0, len(buf)) ** 0.5
buf /= np.max(np.abs(buf)) / 0.7
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((buf * 32767).astype("<i2").tobytes())
print(f"som salvo em {OUT}")
