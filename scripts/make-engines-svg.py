#!/usr/bin/env python3
"""
Animated SVG for agentkernel: a request flowing through six engines.

App -> [Router -> Memory -> Retriever -> Queue -> Media -> Auth] -> Artifact.
A signal travels left to right, lighting each engine as it passes. SMIL,
plays on GitHub README. Vector, ~kb.

Usage:  python scripts/make-engines-svg.py
Output: engines.svg in the repo root.
"""
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "engines.svg"

W, H = 900, 560
DUR = 11.0

ENGINES = [
    ("01", "Router",    "LLM routing + circuit breaker", "#6366f1"),
    ("02", "Memory",    "idempotency cache + SCAR guard", "#818cf8"),
    ("03", "Retriever", "web search + dependency graph",  "#38bdf8"),
    ("04", "Queue",     "Redis distributed + SSE stream",  "#2dd4bf"),
    ("05", "Media",     "TTS x6 + Remotion video render",  "#a855f7"),
    ("06", "Auth",      "JWT + multi-tenant isolation",    "#ec4899"),
]

# two columns x three rows of engine cards
COLS, CARD_W, CARD_H = 2, 298, 96
GAP_X, GAP_Y = 34, 22
GRID_X, GRID_Y = 124, 120


def opacity_anim(t_on):
    kt = [0, max(t_on - 0.001, 0), t_on, t_on + 0.05, 0.9, 1.0]
    vals = [0.2, 0.2, 0.2, 1, 1, 0.2]
    return (f'<animate attributeName="opacity" dur="{DUR}s" repeatCount="indefinite" '
            f'keyTimes="{";".join(f"{k:.4f}" for k in kt)}" '
            f'values="{";".join(str(v) for v in vals)}"/>')


def card_xy(i):
    col, row = i % COLS, i // COLS
    x = GRID_X + col * (CARD_W + GAP_X)
    y = GRID_Y + row * (CARD_H + GAP_Y)
    return x, y


def build():
    p = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">',
        f'<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="16" fill="#0d1117" '
        f'stroke="#30363d" stroke-width="1.5"/>',
        f'<text x="40" y="54" font-size="30" font-weight="700" fill="#e6edf3">AgentKernel</text>',
        f'<text x="40" y="84" font-size="16" fill="#8b949e">six engines — a request flows through the nervous system of autonomous software</text>',
    ]

    # App pill (left) and Artifact pill (right) — vertically centered
    midy = GRID_Y + (CARD_H + GAP_Y) * 1 + CARD_H // 2
    p.append(f'<rect x="28" y="{midy-26}" width="78" height="52" rx="10" fill="#0f172a" '
             f'stroke="#6366f1" stroke-width="2"/>'
             f'<text x="67" y="{midy+5}" font-size="14" font-weight="600" fill="#818cf8" '
             f'text-anchor="middle">App</text>')
    p.append(f'<rect x="{W-110}" y="{midy-26}" width="84" height="52" rx="10" fill="#0f172a" '
             f'stroke="#ec4899" stroke-width="2"/>'
             f'<text x="{W-68}" y="{midy+5}" font-size="13" font-weight="600" fill="#f0a5cf" '
             f'text-anchor="middle">Artifact</text>')

    # engine cards
    for i, (num, name, desc, color) in enumerate(ENGINES):
        x, y = card_xy(i)
        t_on = 0.06 + i * 0.13
        g = [f'<g opacity="0.2">{opacity_anim(t_on)}']
        g.append(f'<rect x="{x}" y="{y}" width="{CARD_W}" height="{CARD_H}" rx="12" '
                 f'fill="{color}" fill-opacity="0.10" stroke="{color}" stroke-width="2"/>')
        g.append(f'<text x="{x+20}" y="{y+34}" font-size="13" font-weight="700" fill="{color}">'
                 f'{num}</text>')
        g.append(f'<text x="{x+52}" y="{y+34}" font-size="20" font-weight="700" fill="#e6edf3">'
                 f'{name}</text>')
        g.append(f'<text x="{x+20}" y="{y+64}" font-size="13" fill="#8b949e">{desc}</text>')
        g.append('</g>')
        p.append("".join(g))

    # snaking flow path App -> engines in order -> Artifact
    pts = [(106, midy)]
    for i in range(len(ENGINES)):
        x, y = card_xy(i)
        pts.append((x + CARD_W // 2, y + CARD_H // 2))
    pts.append((W - 110, midy))
    path = "M " + " L ".join(f"{x:.0f} {y:.0f}" for x, y in pts)
    p.append(f'<path d="{path}" fill="none" stroke="#30363d" stroke-width="1.5" '
             f'stroke-dasharray="3 5"/>')
    # traveling request dot
    p.append(f'<circle r="6" fill="#ffffff">'
             f'<animateMotion dur="{DUR}s" repeatCount="indefinite" path="{path}" '
             f'keyPoints="0;1" keyTimes="0;0.88" calcMode="linear"/>'
             f'<animate attributeName="opacity" dur="{DUR}s" repeatCount="indefinite" '
             f'keyTimes="0;0.02;0.86;0.9;1" values="0;0.95;0.95;0;0"/></circle>')

    p.append('</svg>')
    OUT.write_text("\n".join(p), encoding="utf-8")
    print(f"wrote {OUT}  ({OUT.stat().st_size/1024:.1f} KB)")


if __name__ == "__main__":
    build()
