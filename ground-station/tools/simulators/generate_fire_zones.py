#!/usr/bin/env python3
"""One-time generator: bake irregular forest-fire danger zones (as GeoJSON) into a
flight telemetry CSV, so the ground station receives them as *data* — no runtime
generation. Each zone is an irregular polygon (not a perfect circle/triangle/square)
placed where the CubeSat's camera is actually LOOKING that frame — i.e. the camera
footprint is projected with the real IMU attitude (quaternion), not straight down.
Because the payload's IMU swings a lot (off-nadir tens of degrees), the zones land
scattered off the ground track instead of in a straight line under it.

Adds two trailing columns:
  * "Fire Level"   — 1 (petit/jaune) / 2 (danger/orange) / 3 (grand/rouge)
  * "Fire GeoJSON" — a GeoJSON Polygon geometry (lon/lat ring)
populated on a handful of spread-out, high-enough frames; blank everywhere else.

Idempotent: re-running strips any previously-added Fire columns first (so it never
stacks duplicates) and only backs up the pristine CSV once (<csv>.bak).

Usage:
  python3 tools/simulators/generate_fire_zones.py [csv_path]   # in place (+ .bak)
  python3 tools/simulators/generate_fire_zones.py in.csv --out out.csv
"""
import argparse
import csv
import json
import math
import random
import shutil
import sys
from pathlib import Path

# Camera optics — MUST match cesiumViewport.jsx (stripes.png projection):
# 400 mm lens on a 36x24 mm full-frame sensor. Boresight = -Z body, right = +X.
LENS_FOCAL_MM = 400.0
SENSOR_W_MM = 36.0
SENSOR_H_MM = 24.0
H_HALF_FOV = math.atan((SENSOR_W_MM / 2) / LENS_FOCAL_MM)   # east (image right)
V_HALF_FOV = math.atan((SENSOR_H_MM / 2) / LENS_FOCAL_MM)   # north (image up)
FOOTPRINT_CORNER_SIGNS = [(-1, 1), (1, 1), (1, -1), (-1, -1)]  # TL, TR, BR, BL

# WGS84.
WGS84_A = 6378137.0
WGS84_B = 6356752.3142451793
WGS84_E2 = 6.694379990141316e-3
METERS_PER_DEG_LAT = 111320.0

FIRE_COLUMNS = ["Fire Level", "Fire GeoJSON"]
FIRE_LEVELS = [3, 1, 2, 3, 2, 1]      # rouge, jaune, orange, ... so all 3 appear
FIRST_FRAME = 25                       # earliest data row a zone may sit on
MIN_ALT_M = 3000.0                     # only where the footprint is a decent size
MIN_SEPARATION_M = 1200.0              # keep sampled track frames apart
MAX_ZONES = 12
BLOB_VERTICES = 16
SEED = 1337


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# --- Attitude-aware camera footprint (port of cesiumViewport.computeCameraFootprint) -
def _geodetic_to_ecef(lat, lon, h):
    la, lo = math.radians(lat), math.radians(lon)
    sla, cla = math.sin(la), math.cos(la)
    n = WGS84_A / math.sqrt(1 - WGS84_E2 * sla * sla)
    return ((n + h) * cla * math.cos(lo),
            (n + h) * cla * math.sin(lo),
            (n * (1 - WGS84_E2) + h) * sla)


def _ecef_to_latlon(x, y, z):
    lon = math.atan2(y, x)
    p = math.hypot(x, y)
    if p < 1e-9:
        return math.copysign(90.0, z), math.degrees(lon)
    lat = math.atan2(z, p * (1 - WGS84_E2))
    for _ in range(6):
        s = math.sin(lat)
        n = WGS84_A / math.sqrt(1 - WGS84_E2 * s * s)
        h = p / math.cos(lat) - n
        lat = math.atan2(z, p * (1 - WGS84_E2 * n / (n + h)))
    return math.degrees(lat), math.degrees(lon)


def _quat_to_matrix(x, y, z, w):
    """Body->ENU rotation matrix (Cesium Matrix3.fromQuaternion convention)."""
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    x2, y2, z2, w2 = x * x, y * y, z * z, w * w
    xy, xz, xw, yz, yw, zw = x * y, x * z, x * w, y * z, y * w, z * w
    return [
        [x2 - y2 - z2 + w2, 2 * (xy - zw), 2 * (xz + yw)],
        [2 * (xy + zw), -x2 + y2 - z2 + w2, 2 * (yz - xw)],
        [2 * (xz - yw), 2 * (yz + xw), -x2 - y2 + z2 + w2],
    ]


def _enu_to_ecef_matrix(lat, lon):
    """Columns = east, north, up unit vectors in ECEF (eastNorthUpToFixedFrame)."""
    la, lo = math.radians(lat), math.radians(lon)
    sla, cla, slo, clo = math.sin(la), math.cos(la), math.sin(lo), math.cos(lo)
    return [
        [-slo, -sla * clo, cla * clo],
        [clo, -sla * slo, cla * slo],
        [0.0, cla, sla],
    ]


def _matvec(m, v):
    return (m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2])


def _ray_ellipsoid_entry_t(origin, direction):
    """First (entry) t where origin + t*direction meets WGS84, or None if it misses."""
    inv = (1 / WGS84_A, 1 / WGS84_A, 1 / WGS84_B)
    q = (origin[0] * inv[0], origin[1] * inv[1], origin[2] * inv[2])
    w = (direction[0] * inv[0], direction[1] * inv[1], direction[2] * inv[2])
    q2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2]
    qw = q[0] * w[0] + q[1] * w[1] + q[2] * w[2]
    w2 = w[0] * w[0] + w[1] * w[1] + w[2] * w[2]
    if q2 <= 1.0 or qw >= 0 or w2 == 0:      # inside / pointing away / degenerate
        return None
    disc = qw * qw - w2 * (q2 - 1.0)
    if disc < 0:
        return None
    return (-qw - math.sqrt(disc)) / w2


def attitude_footprint(lat, lon, alt, qx, qy, qz, qw):
    """4 (lon, lat) ground corners the camera sees given its IMU attitude, or None
    if it looks at/above the horizon (any corner ray misses the ellipsoid)."""
    sat = _geodetic_to_ecef(lat, lon, alt)
    body_rot = _quat_to_matrix(qx, qy, qz, qw)
    enu_rot = _enu_to_ecef_matrix(lat, lon)
    tan_h, tan_v = math.tan(H_HALF_FOV), math.tan(V_HALF_FOV)
    corners = []
    for sx, sy in FOOTPRINT_CORNER_SIGNS:
        db = (sx * tan_h, sy * tan_v, -1.0)
        norm = math.sqrt(db[0] ** 2 + db[1] ** 2 + db[2] ** 2)
        db = (db[0] / norm, db[1] / norm, db[2] / norm)
        d_ecef = _matvec(enu_rot, _matvec(body_rot, db))
        t = _ray_ellipsoid_entry_t(sat, d_ecef)
        if t is None:
            return None
        p = (sat[0] + t * d_ecef[0], sat[1] + t * d_ecef[1], sat[2] + t * d_ecef[2])
        plat, plon = _ecef_to_latlon(*p)
        corners.append((plon, plat))
    return corners


def footprint_metrics(corners):
    """(centre_lon, centre_lat, mean corner distance in metres)."""
    clon = sum(c[0] for c in corners) / len(corners)
    clat = sum(c[1] for c in corners) / len(corners)
    m_per_deg_lon = METERS_PER_DEG_LAT * math.cos(math.radians(clat))
    dist = 0.0
    for c in corners:
        dist += math.hypot((c[0] - clon) * m_per_deg_lon, (c[1] - clat) * METERS_PER_DEG_LAT)
    return clon, clat, dist / len(corners)


def clip_polygon_convex(subject, clip):
    """Sutherland-Hodgman: clip `subject` by CONVEX `clip` (both [(x, y)])."""
    if len(subject) < 3 or len(clip) < 3:
        return []
    signed = 0.0
    for i in range(len(clip)):
        ax, ay = clip[i - 1]
        bx, by = clip[i]
        signed += ax * by - bx * ay
    ccw = signed > 0

    def inside(p, a, b):
        cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        return cross >= 0 if ccw else cross <= 0

    def intersect(p, q, a, b):
        rpx, rpy = q[0] - p[0], q[1] - p[1]
        rax, ray = b[0] - a[0], b[1] - a[1]
        denom = rpx * ray - rpy * rax
        if abs(denom) < 1e-15:
            return q
        t = ((a[0] - p[0]) * ray - (a[1] - p[1]) * rax) / denom
        return (p[0] + t * rpx, p[1] + t * rpy)

    output = subject
    for e in range(len(clip)):
        a, b = clip[e], clip[(e + 1) % len(clip)]
        inp, output = output, []
        if not inp:
            break
        for i in range(len(inp)):
            cur, prev = inp[i], inp[i - 1]
            cur_in, prev_in = inside(cur, a, b), inside(prev, a, b)
            if cur_in:
                if not prev_in:
                    output.append(intersect(prev, cur, a, b))
                output.append(cur)
            elif prev_in:
                output.append(intersect(prev, cur, a, b))
    return output


def irregular_blob(rng, clat, clon, radius_m):
    """Irregular fire outline [(lon, lat), ...] ~radius_m around (clat, clon), with a
    small random centre offset. Radius wobbles per vertex (smoothed) so the shape is
    a natural blob, never a perfect circle/triangle/square."""
    m_per_deg_lon = METERS_PER_DEG_LAT * max(math.cos(math.radians(clat)), 1e-6)
    base = radius_m * rng.uniform(0.75, 1.1)
    off_e = rng.uniform(-0.25, 0.25) * radius_m
    off_n = rng.uniform(-0.25, 0.25) * radius_m
    raw = [rng.uniform(0.6, 1.35) for _ in range(BLOB_VERTICES)]
    pts = []
    for i in range(BLOB_VERTICES):
        ang = 2 * math.pi * i / BLOB_VERTICES + rng.uniform(-0.08, 0.08)
        r = base * (raw[i] + raw[(i + 1) % BLOB_VERTICES]) / 2
        east = off_e + r * math.cos(ang)
        north = off_n + r * math.sin(ang)
        pts.append((clon + east / m_per_deg_lon, clat + north / METERS_PER_DEG_LAT))
    return pts


def to_geojson_polygon(ring):
    coords = [[round(x, 6), round(y, 6)] for (x, y) in ring]
    if coords and coords[0] != coords[-1]:
        coords.append(coords[0])       # GeoJSON rings must be closed
    return json.dumps({"type": "Polygon", "coordinates": [coords]}, separators=(",", ":"))


def plan_zones(rows, cols):
    """{row_index: (level, geojson)} at spread-out, high-enough frames, each placed
    where the IMU-tilted camera footprint actually lands (off-nadir)."""
    rng = random.Random(SEED)
    zones = {}
    last_lat = last_lon = None
    for i, row in enumerate(rows):
        if len(zones) >= MAX_ZONES:
            break
        if i < FIRST_FRAME:
            continue
        lat, lon, alt = _num(row[cols["lat"]]), _num(row[cols["lon"]]), _num(row[cols["alt"]])
        if lat is None or lon is None or alt is None or abs(lat) > 90 or abs(lon) > 180 or alt < MIN_ALT_M:
            continue
        if last_lat is not None:
            m_per_deg_lon = METERS_PER_DEG_LAT * math.cos(math.radians(lat))
            if math.hypot((lat - last_lat) * METERS_PER_DEG_LAT,
                          (lon - last_lon) * m_per_deg_lon) < MIN_SEPARATION_M:
                continue
        qw = _num(row[cols["qw"]])
        qx, qy, qz = _num(row[cols["qx"]]), _num(row[cols["qy"]]), _num(row[cols["qz"]])
        if None in (qw, qx, qy, qz):
            qw, qx, qy, qz = 1.0, 0.0, 0.0, 0.0     # identity = nadir fallback
        corners = attitude_footprint(lat, lon, alt, qx, qy, qz, qw)
        if corners is None:                          # looking above the horizon
            continue
        clon, clat, radius = footprint_metrics(corners)
        blob = irregular_blob(rng, clat, clon, radius)
        seen = clip_polygon_convex(blob, corners)    # keep only what's in the vision
        if len(seen) < 3:
            continue
        level = FIRE_LEVELS[len(zones) % len(FIRE_LEVELS)]
        zones[i] = (level, to_geojson_polygon(seen), (clon, clat))
        last_lat, last_lon = lat, lon
    return zones


def _col(header, name):
    for i, h in enumerate(header):
        if h.strip() == name:
            return i
    raise SystemExit(f"Column {name!r} not found in CSV header: {header}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="?",
                        default="../Safari_GS_antenna/telemetrySender/src/telemetry.csv",
                        help="Flight telemetry CSV to bake zones into.")
    parser.add_argument("--out", default=None, help="Write here instead of in place.")
    args = parser.parse_args()

    src = Path(args.csv)
    if not src.is_absolute():
        src = (Path(__file__).resolve().parents[2] / src).resolve()
    if not src.exists():
        print(f"CSV not found: {src}", file=sys.stderr)
        return 1

    with src.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        rows = [r for r in reader if r]

    # Idempotent: drop any Fire columns from a previous run before re-adding.
    keep = [i for i, h in enumerate(header) if h.strip() not in FIRE_COLUMNS]
    header = [header[i] for i in keep]
    rows = [[r[i] if i < len(r) else "" for i in keep] for r in rows]

    cols = {
        "lat": _col(header, "U Lat"), "lon": _col(header, "U Long"), "alt": _col(header, "U Alt"),
        "qw": _col(header, "Quat_w"), "qx": _col(header, "Quat_x"),
        "qy": _col(header, "Quat_y"), "qz": _col(header, "Quat_z"),
    }
    zones = plan_zones(rows, cols)

    out_header = header + FIRE_COLUMNS
    out_rows = []
    for i, row in enumerate(rows):
        level, geojson, _ = zones.get(i, ("", "", None))
        out_rows.append(row + [level, geojson])

    dst = Path(args.out).resolve() if args.out else src
    if dst == src:
        backup = src.with_suffix(src.suffix + ".bak")
        if not backup.exists():
            shutil.copy2(src, backup)
            print(f"Backed up pristine CSV -> {backup}")
    with dst.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(out_header)
        writer.writerows(out_rows)

    print(f"Wrote {len(out_rows)} rows to {dst}")
    print(f"Baked {len(zones)} fire zones (placed where the IMU-tilted camera looks):")
    for i in sorted(zones):
        level, geojson, (clon, clat) = zones[i]
        sat_lat, sat_lon = rows[i][cols["lat"]], rows[i][cols["lon"]]
        off = footprint_offset_km(_num(sat_lat), _num(sat_lon), clat, clon)
        verts = len(json.loads(geojson)["coordinates"][0])
        print(f"  row {i}: level={level}, {verts} verts, zone @ ({clat:.4f},{clon:.4f}) "
              f"= {off:.1f} km off the track point ({sat_lat},{sat_lon})")
    return 0


def footprint_offset_km(sat_lat, sat_lon, clat, clon):
    if sat_lat is None or sat_lon is None:
        return 0.0
    m_per_deg_lon = METERS_PER_DEG_LAT * math.cos(math.radians(clat))
    return math.hypot((clat - sat_lat) * METERS_PER_DEG_LAT,
                      (clon - sat_lon) * m_per_deg_lon) / 1000.0


if __name__ == "__main__":
    raise SystemExit(main())
