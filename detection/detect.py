#!/usr/bin/env python3
"""
AstroParks YOLO v8 parking space detector.

Identifies vehicles in a camera image, maps each detected car to a numbered
parking space using polygon coordinates from parking_spaces.json, and persists
the results to PostgreSQL or posts them to the Node.js API.

Usage:
    python detect.py --image /path/to/frame.jpg
    python detect.py --image /path/to/frame.jpg --write-db
    python detect.py --image /path/to/frame.jpg --post-url http://localhost:3000
    python detect.py --image /path/to/frame.jpg --annotate out.jpg
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from dotenv import load_dotenv
from ultralytics import YOLO

# Load .env from the detection/ directory (keeps DB creds separate from Node .env)
load_dotenv(dotenv_path=Path(__file__).parent / '.env')

SPACES_JSON = Path(__file__).parent / 'parking_spaces.json'
YOLO_MODEL  = 'yolov8n.pt'   # downloaded automatically on first run
COCO_CAR_ID = 2               # COCO class index for 'car'
CONF_THRESH  = 0.35           # minimum YOLO confidence to consider a detection


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_spaces(json_path: Path) -> list:
    """Load parking space definitions from JSON. Returns list of space dicts."""
    with open(json_path, 'r') as f:
        data = json.load(f)
    spaces = data.get('spaces', [])
    if not spaces:
        raise ValueError(f'No spaces found in {json_path}')
    return spaces


# ---------------------------------------------------------------------------
# YOLO inference
# ---------------------------------------------------------------------------

def run_yolo(model: YOLO, image_path: str) -> list:
    """
    Run YOLOv8 on image_path, filter to cars only.

    Returns list of dicts:
        {bbox: [x1,y1,x2,y2], confidence: float, class_name: str}
    Bboxes are in original image pixel coordinates (ultralytics auto-scales).
    """
    results = model(image_path, conf=CONF_THRESH, verbose=False)
    detections = []
    for result in results:
        boxes = result.boxes
        for i in range(len(boxes)):
            cls_id = int(boxes.cls[i].item())
            if cls_id != COCO_CAR_ID:
                continue
            x1, y1, x2, y2 = boxes.xyxy[i].tolist()
            detections.append({
                'bbox': [int(x1), int(y1), int(x2), int(y2)],
                'confidence': round(float(boxes.conf[i].item()), 4),
                'class_name': 'car',
            })
    return detections


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def car_centroid(bbox: list) -> tuple:
    """Return (cx, cy) centroid of a [x1,y1,x2,y2] bounding box."""
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) // 2, (y1 + y2) // 2)


def build_contour(polygon_pixels: list) -> np.ndarray:
    """Build an OpenCV contour array from a list of {x,y} dicts."""
    return np.array([[p['x'], p['y']] for p in polygon_pixels], dtype=np.int32)


def centroid_in_polygon(cx: int, cy: int, polygon_pixels: list) -> bool:
    """Return True if (cx, cy) is inside or on the boundary of the polygon."""
    contour = build_contour(polygon_pixels)
    return cv2.pointPolygonTest(contour, (float(cx), float(cy)), False) >= 0


# ---------------------------------------------------------------------------
# Assignment logic
# ---------------------------------------------------------------------------

def assign_detections_to_spaces(spaces: list, detections: list) -> list:
    """
    For each parking space, determine whether any detected car occupies it.

    Strategy:
    - Compute the centroid of each detected car bbox.
    - Use cv2.pointPolygonTest to check if the centroid falls inside the space polygon.
    - Greedy assignment: each car is assigned to the first matching space found;
      once assigned, that car is removed from further consideration to avoid
      double-counting a single vehicle in two adjacent spaces.

    Returns a list of result dicts (one per space) sorted by space label.
    """
    unassigned_cars = list(detections)  # copy so we can pop matched cars
    results = []

    for space in spaces:
        polygon_pixels = space.get('polygonPixels', [])
        if not polygon_pixels:
            results.append(_space_result(space, occupied=False))
            continue

        matched_car = None
        for car in unassigned_cars:
            cx, cy = car_centroid(car['bbox'])
            if centroid_in_polygon(cx, cy, polygon_pixels):
                matched_car = car
                break

        if matched_car:
            unassigned_cars.remove(matched_car)
            bx1, by1, bx2, by2 = matched_car['bbox']
            results.append({
                'space_label': space['label'],
                'is_occupied': True,
                'confidence': matched_car['confidence'],
                'car_bbox_x1': bx1,
                'car_bbox_y1': by1,
                'car_bbox_x2': bx2,
                'car_bbox_y2': by2,
            })
        else:
            results.append(_space_result(space, occupied=False))

    return results


def _space_result(space: dict, occupied: bool) -> dict:
    return {
        'space_label': space['label'],
        'is_occupied': occupied,
        'confidence': None,
        'car_bbox_x1': None,
        'car_bbox_y1': None,
        'car_bbox_x2': None,
        'car_bbox_y2': None,
    }


# ---------------------------------------------------------------------------
# Output / persistence
# ---------------------------------------------------------------------------

def post_to_api(results: list, image_source: str, detected_at: str, api_url: str) -> None:
    """HTTP POST detection batch to Node.js POST /api/detections."""
    import requests  # imported here to keep startup fast when not used
    payload = {
        'image_source': image_source,
        'detected_at': detected_at,
        'spaces': results,
    }
    resp = requests.post(f'{api_url.rstrip("/")}/api/detections', json=payload, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    print(f'[INFO]  Posted to API: {data.get("inserted", "?")} detection rows inserted.',
          file=sys.stderr)


def write_to_db(results: list, image_source: str, detected_at: str, db_url: str) -> None:
    """Write detection results directly to PostgreSQL via psycopg2."""
    import psycopg2  # imported here to keep startup fast when not used

    conn = psycopg2.connect(db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                for row in results:
                    cur.execute(
                        'SELECT id FROM parking_spaces WHERE space_label = %s LIMIT 1',
                        (row['space_label'],)
                    )
                    rec = cur.fetchone()
                    if not rec:
                        print(f'[WARN]  Space label "{row["space_label"]}" not found in DB, skipping.',
                              file=sys.stderr)
                        continue
                    space_id = rec[0]
                    cur.execute(
                        '''INSERT INTO parking_detections
                           (space_id, image_source, detected_at, is_occupied,
                            confidence, car_bbox_x1, car_bbox_y1, car_bbox_x2, car_bbox_y2)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                        (space_id, image_source, detected_at, row['is_occupied'],
                         row['confidence'], row['car_bbox_x1'], row['car_bbox_y1'],
                         row['car_bbox_x2'], row['car_bbox_y2'])
                    )
        print(f'[INFO]  Wrote {len(results)} detection rows to DB.', file=sys.stderr)
    finally:
        conn.close()


def annotate_image(image_path: str, spaces: list, detections: list,
                   assignment_results: list, output_path: str) -> None:
    """Draw YOLO bboxes and space polygons on the image and save to output_path."""
    img = cv2.imread(image_path)
    if img is None:
        print(f'[WARN]  Could not read image for annotation: {image_path}', file=sys.stderr)
        return

    # Draw space polygons
    space_map = {r['space_label']: r for r in assignment_results}
    for space in spaces:
        polygon_pixels = space.get('polygonPixels', [])
        if not polygon_pixels:
            continue
        contour = build_contour(polygon_pixels)
        result = space_map.get(space['label'], {})
        color = (0, 0, 200) if result.get('is_occupied') else (0, 180, 0)  # red / green
        cv2.polylines(img, [contour], isClosed=True, color=color, thickness=2)
        cx = int(np.mean([p['x'] for p in polygon_pixels]))
        cy = int(np.mean([p['y'] for p in polygon_pixels]))
        cv2.putText(img, space['label'], (cx - 10, cy + 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)

    # Draw YOLO bboxes
    for det in detections:
        x1, y1, x2, y2 = det['bbox']
        cv2.rectangle(img, (x1, y1), (x2, y2), (255, 80, 80), 2)
        label = f"car {det['confidence']:.2f}"
        cv2.putText(img, label, (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 80, 80), 1, cv2.LINE_AA)

    cv2.imwrite(output_path, img)
    print(f'[INFO]  Annotated image saved to {output_path}', file=sys.stderr)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description='AstroParks YOLO v8 parking detector')
    parser.add_argument('--image',    required=True, help='Path to input camera frame')
    parser.add_argument('--spaces',   default=str(SPACES_JSON),
                        help='Path to parking_spaces.json (default: detection/parking_spaces.json)')
    parser.add_argument('--model',    default=YOLO_MODEL,
                        help='YOLOv8 model weights (default: yolov8n.pt)')
    parser.add_argument('--write-db', action='store_true',
                        help='Write results directly to PostgreSQL via DATABASE_URL')
    parser.add_argument('--post-url', default='',
                        help='Node.js server URL to POST results to (e.g. http://localhost:3000)')
    parser.add_argument('--annotate', default='',
                        help='If set, save annotated image to this path')
    args = parser.parse_args()

    if not os.path.isfile(args.image):
        print(f'[ERROR] Image not found: {args.image}', file=sys.stderr)
        sys.exit(1)

    # Load space definitions
    try:
        spaces = load_spaces(Path(args.spaces))
    except Exception as e:
        print(f'[ERROR] Failed to load spaces JSON: {e}', file=sys.stderr)
        sys.exit(1)

    # Run YOLO
    print(f'[INFO]  Loading model {args.model}...', file=sys.stderr)
    model = YOLO(args.model)
    print(f'[INFO]  Running detection on {args.image}...', file=sys.stderr)
    detections = run_yolo(model, args.image)
    print(f'[INFO]  Detected {len(detections)} car(s).', file=sys.stderr)

    # Assign cars to spaces
    assignment_results = assign_detections_to_spaces(spaces, detections)
    occupied_count = sum(1 for r in assignment_results if r['is_occupied'])

    detected_at = datetime.now(timezone.utc).isoformat()
    output = {
        'image_source': args.image,
        'detected_at': detected_at,
        'total_cars_detected': len(detections),
        'occupied_spaces': occupied_count,
        'spaces': assignment_results,
    }

    # Always print JSON to stdout
    print(json.dumps(output, indent=2))

    # Optionally annotate image
    if args.annotate:
        annotate_image(args.image, spaces, detections, assignment_results, args.annotate)

    # Optionally persist
    if args.post_url:
        try:
            post_to_api(assignment_results, args.image, detected_at, args.post_url)
        except Exception as e:
            print(f'[ERROR] Failed to post to API: {e}', file=sys.stderr)
            sys.exit(1)

    if args.write_db:
        db_url = os.getenv('DATABASE_URL')
        if not db_url:
            print('[ERROR] DATABASE_URL not set. Add it to detection/.env', file=sys.stderr)
            sys.exit(1)
        try:
            write_to_db(assignment_results, args.image, detected_at, db_url)
        except Exception as e:
            print(f'[ERROR] Failed to write to DB: {e}', file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    main()
