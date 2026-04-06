from __future__ import annotations

import io
import os
import sys
import tempfile
from pathlib import Path

# Корень проекта — папка выше api/
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from flask import Flask, jsonify, request, send_from_directory

from rusal_shelf_optimizer_v3 import (
    MaterialKey,
    MaterialRule,
    Plate,
    RollPlan,
    ShelfOptimizer,
    SolveConfig,
)
from rusal_shelf_visualizer_v3 import draw_roll

app = Flask(__name__)

# ═══════════════════════════════════════════
#  СПРАВОЧНИК (зеркало JS constants.js)
# ═══════════════════════════════════════════
_REF_CUTS = [
    ("AA8011",  6, 3), ("AA8011",  9, 4), ("AA8011", 12, 5), ("AA8011", 15, 5),
    ("AA8011", 20, 6), ("AA8011", 25, 6),
    ("AA1235",  6, 3), ("AA1235",  9, 4), ("AA1235", 12, 4), ("AA1235", 15, 5),
    ("AA3003", 15, 6), ("AA3003", 20, 7),
    ("AA8079",  6, 3), ("AA8079",  9, 4),
]
DEFAULT_EDGE_TRIM = 15
DEFAULT_CUT       = 5


def _build_rules() -> dict[MaterialKey, MaterialRule]:
    rules: dict[MaterialKey, MaterialRule] = {}
    for alloy, thick, cut in _REF_CUTS:
        key = MaterialKey(alloy, float(thick))
        rules[key] = MaterialRule(
            alloy=alloy,
            thickness_um=float(thick),
            inter_cut_mm=cut,
            edge_trim_mm=DEFAULT_EDGE_TRIM,
        )
    return rules


def _orders_to_plates(orders: list[dict]) -> list[Plate]:
    plates: list[Plate] = []
    next_id = 1
    for o in orders:
        qty      = max(1, int(o.get("qty", 1)))
        alloy    = str(o.get("alloy", "AA8011"))
        thick    = float(o.get("thick", 15))
        width_mm = int(o["w"])
        # l приходит в метрах → конвертируем в мм
        length_mm = int(round(float(o["l"]) * 1000))
        queue    = int(o.get("priority", 1))
        order_id = str(o["id"])

        if width_mm <= 0 or length_mm <= 0:
            continue

        for _ in range(qty):
            plates.append(
                Plate(
                    plate_id=f"P{next_id:07d}",
                    order_id=order_id,
                    queue=queue,
                    alloy=alloy,
                    thickness_um=thick,
                    width_mm=width_mm,
                    length_mm=length_mm,
                    source_row=0,
                )
            )
            next_id += 1
    return plates


# ── Хранилище последнего результата (in-memory) ──
_last_result: dict | None = None


# ═══════════════════════════════════════════
#  СТАТИЧЕСКИЕ ФАЙЛЫ
# ═══════════════════════════════════════════
@app.route("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.route("/<path:path>")
def static_files(path: str):
    return send_from_directory(ROOT, path)


# ═══════════════════════════════════════════
#  API: РАСЧЁТ РАСКРОЯ
# ═══════════════════════════════════════════
@app.route("/api/solve", methods=["POST"])
def solve():
    global _last_result
    data = request.get_json(silent=True) or {}
    orders = data.get("orders", [])

    if not orders:
        return jsonify({"error": "Нет заказов"}), 400

    try:
        rules  = _build_rules()
        plates = _orders_to_plates(orders)

        if not plates:
            return jsonify({"error": "Не удалось разобрать заказы"}), 400

        config = SolveConfig(
            roll_width_mm=1500,
            roll_length_mm=10_000_000,  # 10 000 м в мм
            force_single_roll=True,
        )
        optimizer = ShelfOptimizer(config=config, rules=rules)
        result = optimizer.solve(plates)

        _last_result = result
        return jsonify(result)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ═══════════════════════════════════════════
#  API: СКАЧАТЬ PNG РУЛОНА
# ═══════════════════════════════════════════
@app.route("/api/visualize/<int:roll_index>")
def visualize(roll_index: int):
    if _last_result is None:
        return jsonify({"error": "Сначала запустите расчёт"}), 400

    rolls = _last_result.get("rolls", [])
    roll  = next((r for r in rolls if r["roll_index"] == roll_index), None)
    if roll is None:
        return jsonify({"error": f"Рулон {roll_index} не найден"}), 404

    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            tmp_path = f.name

        draw_roll(roll=roll, output_path=tmp_path)

        alloy = roll["source_material"]["alloy"]
        thick = roll["source_material"]["thickness_um"]
        fname = f"cutflow_roll{roll_index}_{alloy}_{thick}um.png"

        return send_from_directory(
            os.path.dirname(tmp_path),
            os.path.basename(tmp_path),
            as_attachment=True,
            download_name=fname,
            mimetype="image/png",
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    print("CutFlow API · http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
