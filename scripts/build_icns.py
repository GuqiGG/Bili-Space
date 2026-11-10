"""Build Bili-Space.icns from the shipped PNG for the macOS app bundle.

macOS reads the Dock/Finder icon from Contents/Resources/<CFBundleIconFile>.icns.
Without that file the bundle shows the generic white document icon, which is what
happened before this script existed.

Uses only Apple's own tools (`sips` to resize, `iconutil` to pack), so the macOS
runner needs no extra Python packages. Falls back to a raw icns writer when
iconutil is unavailable, e.g. when previewing the icon on a non-macOS machine.
"""
from pathlib import Path
import argparse
import shutil
import struct
import subprocess
import tempfile

# icns type codes for the slots iconutil expects in an .iconset directory.
ICONSET = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]
# Same slots as raw icns chunks, used by the fallback writer.
RAW = [
    (b"icp4", 16), (b"icp5", 32), (b"icp6", 64),
    (b"ic07", 128), (b"ic08", 256), (b"ic09", 512), (b"ic10", 1024),
    (b"ic11", 32), (b"ic12", 64), (b"ic13", 256), (b"ic14", 512),
]


def have(*tools: str) -> bool:
    return all(shutil.which(tool) for tool in tools)


def build_with_iconutil(png: Path, out: Path) -> bool:
    if not have("sips", "iconutil"):
        return False
    with tempfile.TemporaryDirectory() as work:
        iconset = Path(work) / "Bili-Space.iconset"
        iconset.mkdir()
        for name, size in ICONSET:
            target = iconset / name
            result = subprocess.run(
                ["sips", "-z", str(size), str(size), str(png), "--out", str(target)],
                capture_output=True,
            )
            if result.returncode != 0 or not target.exists():
                return False
        out.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(out)],
            capture_output=True,
        )
        return result.returncode == 0 and out.exists()


def build_raw(png: Path, out: Path) -> None:
    """Fallback: wrap PNG payloads directly. macOS reads these chunks too."""
    from PIL import Image
    import io
    chunks = []
    with Image.open(png) as source:
        image = source.convert("RGBA")
        side = max(image.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
        for code, size in RAW:
            buffer = io.BytesIO()
            canvas.resize((size, size), Image.LANCZOS).save(buffer, format="PNG", optimize=True)
            payload = buffer.getvalue()
            chunks.append(code + struct.pack(">I", len(payload) + 8) + payload)
    body = b"".join(chunks)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--png", default="assets/branding/bili-space.png")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    png = Path(args.png)
    if not png.is_absolute():
        png = root / png
    if not png.exists():
        raise SystemExit(f"icon source missing: {png}")
    out = Path(args.output)
    if not build_with_iconutil(png, out):
        build_raw(png, out)
    print(f"{out} {out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
