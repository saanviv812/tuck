"""Render the app icon from the cast data: Pip's idle face on a pastel tile.
    npm run icons
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
cast = json.loads((ROOT / "src/buddies/cast.json").read_text(encoding="utf8"))
pip = next(b for b in cast["buddies"] if b["id"] == "pip")
hexc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
pal = {k: hexc(v) for k, v in pip["palette"].items()}
pal["#"] = hexc(cast["outline"]); pal["e"] = hexc(cast["eyeWhite"])

rows = [list(r + r[::-1]) for r in pip["half"]]
ey, ex = pip["eye"]["y"], pip["eye"]["x"]
for x in (ex, 16 - 2 - ex):  # open eyes, pupils looking at you
    for j in (0, 1):
        rows[ey + j][x] = rows[ey + j][x + 1] = "e"
rows[ey][ex + 1] = "#"; rows[ey][16 - 2 - ex] = "#"

S = 24  # icon grid
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
px = img.load()
for y in range(1, S - 1):            # tile with soft outline
    for x in range(1, S - 1):
        edge = y in (1, S - 2) or x in (1, S - 2)
        px[x, y] = pal["#"] if edge else hexc("#FFF4E4")
oy = S - 2 - len(rows) - 1
for y, r in enumerate(rows):
    for x, ch in enumerate(r):
        if ch != "." and 0 <= oy + y < S - 2:
            px[4 + x, oy + y] = pal[ch]
(ROOT / "scripts/out").mkdir(parents=True, exist_ok=True)
img.resize((1024, 1024), Image.NEAREST).save(ROOT / "scripts/out/icon-1024.png")
print("ok")
