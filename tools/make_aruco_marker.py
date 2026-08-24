"""Generate the printable ArUco reference marker.

This is a PHYSICAL dependency for T0. One laminated card, carried in a pocket,
reused for every tree - it is not a tag attached to a tree.

    python tools/make_aruco_marker.py

Writes docs/aruco/greenproof_marker_80mm.png at 300 DPI, plus a PDF sized to A4
so that "print at 100%" produces exactly 80 mm.

WHY ArUco AND NOT A COIN, A RULER OR A BANKNOTE
A photo has no inherent scale: a thin trunk close up is pixel-for-pixel a thick
trunk far away. Any object of known size fixes that. ArUco additionally solves
the second problem - TILT. Its four corners form a known square, so when the
card is photographed at an angle the detector sees the foreshortening and we can
tell that the measurement is unreliable. A coin cannot tell you it was tilted;
it just silently reports a smaller diameter.

PRINTING - READ THIS, IT IS THE WHOLE POINT
"Fit to page" and "Shrink oversized pages" silently rescale the marker, and a
marker of the wrong physical size makes every measurement wrong by that ratio
while looking completely normal.

    1. Print at 100% / "Actual size". Turn page scaling OFF.
    2. Measure the printed black square with a ruler.
    3. Write the measured width on the BACK of the card in pen.
    4. If it is not 80.0 mm, set DEFAULT_MARKER_MM in
       ml/greenproof_ml/signals.py to what you actually measured.

Step 2 is not optional. Printers lie.
"""

from pathlib import Path

import cv2
import numpy as np

# Must match DEFAULT_MARKER_MM in ml/greenproof_ml/signals.py.
MARKER_MM = 80.0

# 4x4_50 is the right dictionary here: few, simple, chunky cells that survive
# being photographed slightly out of focus at arm's length on a mid-range phone.
# A denser dictionary (6x6, 7x7) carries more ids we do not need and starts
# failing to decode at exactly the distances we care about.
DICT = cv2.aruco.DICT_4X4_50
MARKER_ID = 7

DPI = 300
QUIET_ZONE_CELLS = 2  # white border; ArUco needs it to find the marker at all

OUT = Path(__file__).resolve().parent.parent / "docs" / "aruco"


def mm_to_px(mm: float) -> int:
    return int(round(mm / 25.4 * DPI))


def build() -> np.ndarray:
    side_px = mm_to_px(MARKER_MM)
    d = cv2.aruco.getPredefinedDictionary(DICT)
    marker = cv2.aruco.generateImageMarker(d, MARKER_ID, side_px)

    # A 4x4 marker is 6 cells across including its own black border.
    cell = side_px // 6
    pad = cell * QUIET_ZONE_CELLS
    canvas = np.full((side_px + 2 * pad, side_px + 2 * pad), 255, dtype=np.uint8)
    canvas[pad : pad + side_px, pad : pad + side_px] = marker

    # Corner ticks at the true marker edges, so the printed size can be checked
    # with a ruler without guessing where the black square starts.
    t = max(2, cell // 8)
    for y in (pad, pad + side_px - t):
        canvas[y : y + t, pad - cell : pad] = 0
        canvas[y : y + t, pad + side_px : pad + side_px + cell] = 0

    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    img = build()

    png = OUT / f"greenproof_marker_{int(MARKER_MM)}mm.png"
    cv2.imwrite(str(png), img)
    print(f"wrote {png}  ({img.shape[1]}x{img.shape[0]} px at {DPI} DPI)")

    # A4 sheet with the marker at true size and the instructions printed beside
    # it, so the card and its own caveats never get separated.
    a4 = np.full((mm_to_px(297), mm_to_px(210)), 255, dtype=np.uint8)
    y0, x0 = mm_to_px(35), (a4.shape[1] - img.shape[1]) // 2
    a4[y0 : y0 + img.shape[0], x0 : x0 + img.shape[1]] = img

    lines = [
        "GreenProof reference marker",
        "",
        f"Print at 100% / Actual size. Page scaling OFF.",
        f"The black square must measure {MARKER_MM:.0f} mm.",
        "",
        "1. Measure it with a ruler after printing.",
        "2. Write the measured width on the back.",
        "3. Laminate, or use a clear sleeve.",
        "",
        "Hold FLAT against the trunk at chest",
        "height (1.3 m), facing the camera.",
    ]
    y = y0 + img.shape[0] + mm_to_px(15)
    for line in lines:
        cv2.putText(
            a4, line, (mm_to_px(25), y), cv2.FONT_HERSHEY_SIMPLEX, 1.1, 0, 2, cv2.LINE_AA
        )
        y += mm_to_px(9)

    sheet = OUT / "greenproof_marker_A4.png"
    cv2.imwrite(str(sheet), a4)
    print(f"wrote {sheet}  (A4 at {DPI} DPI - print this one)")

    # Verify our own output actually decodes, at full size and at a realistic
    # photographed size. A marker that generates but does not detect would be
    # discovered in a field with 40 trees to register.
    det = cv2.aruco.ArucoDetector(
        cv2.aruco.getPredefinedDictionary(DICT), cv2.aruco.DetectorParameters()
    )
    for scale, label in ((1.0, "full size"), (0.15, "as photographed, small in frame")):
        test = (
            img
            if scale == 1.0
            else cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        )
        corners, ids, _ = det.detectMarkers(test)
        ok = ids is not None and MARKER_ID in ids.flatten()
        print(f"  detect check ({label}, {test.shape[1]}px): {'OK' if ok else 'FAILED'}")


if __name__ == "__main__":
    main()
