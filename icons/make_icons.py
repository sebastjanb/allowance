#!/usr/bin/env python3
"""Generates the PWA icons (no third-party libraries).

Blue squircle-ish rounded square with a white checkmark, drawn with 4x
supersampling for clean edges. Run:  python3 icons/make_icons.py
"""
import math, struct, zlib, os

OUT = os.path.dirname(os.path.abspath(__file__))
SS  = 4                                     # supersampling factor

def lerp(a, b, t): return a + (b - a) * t

def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L = vx * vx + vy * vy
    t = 0.0 if L == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return math.hypot(dx, dy)

def rounded_rect_sdf(x, y, w, h, r):
    """Signed distance, negative inside."""
    qx = abs(x - w / 2) - (w / 2 - r)
    qy = abs(y - h / 2) - (h / 2 - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r

def render(size, pad_ratio=0.0, radius_ratio=0.225):
    """pad_ratio > 0 keeps the artwork inside the maskable safe zone."""
    S = size * SS
    px = bytearray(S * S * 4)
    pad = S * pad_ratio
    box = S - 2 * pad
    r   = box * (0.5 if pad_ratio > 0.18 else radius_ratio)

    # checkmark in unit coordinates of the box
    pts = [(0.275, 0.520), (0.435, 0.680), (0.735, 0.330)]
    stroke = 0.098 * box

    for j in range(S):
        for i in range(S):
            x, y = i + 0.5 - pad, j + 0.5 - pad
            d = rounded_rect_sdf(x, y, box, box, r)
            a = max(0.0, min(1.0, 0.5 - d))          # 1px AA
            o = (j * S + i) * 4
            if a <= 0:
                continue
            # vertical blue gradient + soft top-left specular highlight
            t  = y / box
            rr = lerp(0x62, 0x00, t); gg = lerp(0xB2, 0x53, t); bb = lerp(0xFF, 0xC8, t)
            spec = max(0.0, 1.0 - math.hypot(x - box * 0.28, y - box * 0.18) / (box * 0.72))
            spec = spec ** 2 * 0.30
            rr = lerp(rr, 255, spec); gg = lerp(gg, 255, spec); bb = lerp(bb, 255, spec)

            dm = min(
                seg_dist(x, y, pts[0][0] * box, pts[0][1] * box, pts[1][0] * box, pts[1][1] * box),
                seg_dist(x, y, pts[1][0] * box, pts[1][1] * box, pts[2][0] * box, pts[2][1] * box))
            m = max(0.0, min(1.0, 0.5 - (dm - stroke / 2)))
            rr = lerp(rr, 255, m); gg = lerp(gg, 255, m); bb = lerp(bb, 255, m)

            px[o]     = int(rr)
            px[o + 1] = int(gg)
            px[o + 2] = int(bb)
            px[o + 3] = int(a * 255)

    # downsample
    out = bytearray()
    n = SS * SS
    for j in range(size):
        out.append(0)                                  # PNG filter: none
        for i in range(size):
            R = G = B = A = 0
            for dy in range(SS):
                base = ((j * SS + dy) * S + i * SS) * 4
                for dx in range(SS):
                    o = base + dx * 4
                    A += px[o + 3]; R += px[o] * px[o + 3]; G += px[o + 1] * px[o + 3]; B += px[o + 2] * px[o + 3]
            if A:
                out += bytes((R // A, G // A, B // A, A // n))
            else:
                out += b"\0\0\0\0"
    return bytes(out)

def write_png(path, size, raw):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
           chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    open(path, "wb").write(png)
    print(f"  {os.path.basename(path):<24} {len(png)//1024} kB")

if __name__ == "__main__":
    print("rendering icons…")
    for s in (180, 192, 512):
        write_png(os.path.join(OUT, f"icon-{s}.png"), s, render(s))
    write_png(os.path.join(OUT, "icon-512-maskable.png"), 512, render(512, pad_ratio=0.0, radius_ratio=0.0))
