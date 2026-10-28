# Generate the original stopwatch beep using only Python's standard library.
import math
from pathlib import Path
import re
import struct
import wave

root = Path(__file__).resolve().parent.parent
source = (root / 'src/utils/timerTone.ts').read_text(encoding='utf-8')
values = {key: float(value) for key, value in re.findall(r'(frequency|duration|attack|release|volume):\s*([\d.]+)', source)}
rate = 48000
count = round(rate * values['duration'])
samples = []
for index in range(count):
    envelope = min(1, index / (rate * values['attack']), (count - 1 - index) / (rate * values['release']))
    tone = 1 if math.sin(2 * math.pi * values['frequency'] * index / rate) >= 0 else -1
    samples.append(round(32767 * values['volume'] * envelope * tone))
target = root / 'assets/sounds/timer-beep.wav'
target.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(target), 'wb') as sound:
    sound.setnchannels(1)
    sound.setsampwidth(2)
    sound.setframerate(rate)
    sound.writeframes(struct.pack(f'<{len(samples)}h', *samples))
