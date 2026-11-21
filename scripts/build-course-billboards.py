#!/usr/bin/env python3
"""Assemble the course-local 512×211 billboard faces into eight WebP atlases."""
from hashlib import sha256
import json
from pathlib import Path

from PIL import Image

from course_billboards_city import PAINTERS as CITY
from course_billboards_industry import PAINTERS as INDUSTRY
from course_billboards_sun import PAINTERS as SUN

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/art/course-billboards"
WIDTH, HEIGHT = 512, 211


def main():
    OUT.mkdir(exist_ok=True)
    outputs = {}
    for slug, painters in sorted({**CITY, **INDUSTRY, **SUN}.items()):
        atlas = Image.new("RGB", (WIDTH, HEIGHT * len(painters)))
        for index, paint in enumerate(painters):
            face = paint()
            if face.size != (WIDTH, HEIGHT) or face.mode != "RGB":
                raise ValueError(f"{slug}: invalid size or mode from {paint.__name__}")
            atlas.paste(face, (0, index * HEIGHT))
        path = OUT / f"{slug}.webp"
        atlas.save(path, quality=92, method=6)
        outputs[path.name] = sha256(path.read_bytes()).hexdigest()
    manifest = {"source": "scripts/build-course-billboards.py", "outputs": outputs}
    (ROOT / "src/course-billboard-provenance.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
