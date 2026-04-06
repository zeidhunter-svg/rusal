
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

QUEUE_COLORS = {
    1: "#7DCEA0",
    2: "#F9E79F",
    3: "#F5B7B1",
}
DEFAULT_COLOR = "#D5D8DC"
GAP_COLOR = "#85C1E9"
KERF_COLOR = "red"
KERF_EDGE = "darkred"
TRIM_COLOR = "#E5E7E9"


def load_solution(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def get_rolls(data: dict[str, Any]) -> list[dict[str, Any]]:
    rolls = data.get("rolls", [])
    if not rolls:
        raise ValueError("В solution JSON нет блока 'rolls'")
    return rolls


def draw_roll(
    roll: dict[str, Any],
    output_path: str | Path,
    show_gaps: bool = True,
    show_vertical_kerf: bool = True,
    show_horizontal_kerf: bool = True,
    max_length_m: float | None = None,
) -> None:
    source = roll["source_material"]
    layout = roll["layout_configuration"]
    metrics = roll["efficiency_metrics"]

    raw_width = float(source["bobbin_width_mm"])
    raw_length = float(source["bobbin_length_m"])
    edge_trim = float(layout["edge_trim_mm"])
    effective_width = float(layout["effective_width_mm"])
    inter_cut_mm = float(layout["inter_cut_mm"])

    visible_length = raw_length if max_length_m is None else min(raw_length, max_length_m)

    fig, ax = plt.subplots(figsize=(12, 18))

    # Outer border
    ax.add_patch(Rectangle((0, 0), raw_width, visible_length, fill=False, linewidth=2, edgecolor="black"))

    # Edge trims
    if edge_trim > 0:
        ax.add_patch(Rectangle((0, 0), edge_trim, visible_length, facecolor=TRIM_COLOR, edgecolor="gray", alpha=0.9))
        ax.add_patch(Rectangle((raw_width - edge_trim, 0), edge_trim, visible_length, facecolor=TRIM_COLOR, edgecolor="gray", alpha=0.9))
        ax.text(edge_trim / 2, min(visible_length * 0.02, 2), "Кромка", ha="center", va="top", fontsize=7)
        ax.text(raw_width - edge_trim / 2, min(visible_length * 0.02, 2), "Кромка", ha="center", va="top", fontsize=7)

    shelves = sorted(roll.get("shelves", []), key=lambda s: s["shelf_index"])

    # Shelf outlines
    for shelf in shelves:
        y = float(shelf["y_start_m"])
        h = float(shelf["height_m"])
        if y >= visible_length:
            continue
        if y + h > visible_length:
            h = visible_length - y

        ax.add_patch(
            Rectangle((edge_trim, y), effective_width, h, fill=False, edgecolor="#AAB7B8", linewidth=0.8, linestyle="--")
        )
        ax.text(edge_trim + 5, y + min(h * 0.08, 2), f"Shelf {shelf['shelf_index']} ({shelf['created_from_queue']})", fontsize=7, va="top")

    # Horizontal kerf between shelves
    if show_horizontal_kerf and len(shelves) >= 2:
        for prev_shelf, next_shelf in zip(shelves[:-1], shelves[1:]):
            y_prev = float(prev_shelf["y_start_m"])
            h_prev = float(prev_shelf["height_m"])
            y_next = float(next_shelf["y_start_m"])

            y_kerf = y_prev + h_prev
            kerf_h = y_next - y_kerf

            if y_kerf >= visible_length:
                continue
            if y_kerf + kerf_h > visible_length:
                kerf_h = visible_length - y_kerf

            if kerf_h > 1e-9:
                ax.add_patch(
                    Rectangle(
                        (edge_trim, y_kerf),
                        effective_width,
                        kerf_h,
                        facecolor=KERF_COLOR,
                        edgecolor=KERF_EDGE,
                        alpha=0.75,
                        linewidth=0.5,
                    )
                )
                if kerf_h >= 0.003:
                    ax.text(
                        edge_trim + effective_width / 2,
                        y_kerf + kerf_h / 2,
                        f"{round(kerf_h * 1000, 1)} мм",
                        ha="center",
                        va="center",
                        fontsize=6,
                        color="white",
                    )

    # Placements
    placements = []
    for item in roll.get("cutting_map", []):
        c = item["coordinates"]
        x = float(c["x_start_mm"])
        y = float(c["y_start_m"])
        w = float(c["width_mm"])
        h = float(c["length_m"])
        if y >= visible_length:
            continue
        if y + h > visible_length:
            h = visible_length - y
        placements.append({
            "x": x, "y": y, "w": w, "h": h,
            "queue": int(item.get("queue", 0)),
            "order_id": item["order_id"],
            "shelf_index": int(item.get("shelf_index", -1)),
        })

    placements.sort(key=lambda z: (z["shelf_index"], z["y"], z["x"]))

    for p in placements:
        color = QUEUE_COLORS.get(p["queue"], DEFAULT_COLOR)
        ax.add_patch(
            Rectangle((p["x"], p["y"]), p["w"], p["h"], facecolor=color, edgecolor="black", linewidth=0.7, alpha=0.92)
        )
        ax.text(p["x"] + p["w"] / 2, p["y"] + p["h"] / 2, f"{p['order_id']}\nQ{p['queue']}", ha="center", va="center", fontsize=6)

    # Vertical kerf strips between neighbors in same row
    if show_vertical_kerf and inter_cut_mm > 0:
        by_shelf: dict[int, list[dict[str, Any]]] = {}
        for p in placements:
            by_shelf.setdefault(p["shelf_index"], []).append(p)

        for shelf_index, items in by_shelf.items():
            items.sort(key=lambda z: (round(z["y"], 6), z["x"]))

            for i in range(len(items) - 1):
                a = items[i]
                b = items[i + 1]

                same_row = abs(a["y"] - b["y"]) < 1e-9
                if not same_row:
                    continue

                kerf_x = a["x"] + a["w"]
                kerf_w = b["x"] - kerf_x
                kerf_h = min(a["h"], b["h"])

                if kerf_w <= 1e-9:
                    continue

                ax.add_patch(
                    Rectangle(
                        (kerf_x, a["y"]),
                        kerf_w,
                        kerf_h,
                        facecolor=KERF_COLOR,
                        edgecolor=KERF_EDGE,
                        alpha=0.75,
                        linewidth=0.5,
                    )
                )

                if kerf_w >= 3:
                    ax.text(
                        kerf_x + kerf_w / 2,
                        a["y"] + min(kerf_h * 0.1, 1.5),
                        f"{round(kerf_w, 1)} мм",
                        ha="center",
                        va="top",
                        fontsize=6,
                        color="white",
                    )

    # Gaps
    if show_gaps:
        for gap in roll.get("gaps_remaining", []):
            x = float(gap["x_mm"])
            y = float(gap["y_m"])
            w = float(gap["width_mm"])
            h = float(gap["height_m"])
            if y >= visible_length:
                continue
            if y + h > visible_length:
                h = visible_length - y
            ax.add_patch(Rectangle((x, y), w, h, facecolor=GAP_COLOR, edgecolor="#1F618D", linewidth=0.7, alpha=0.30))

    title = (
        f"Раскрой рулона #{roll['roll_index']} — {source['alloy']} / {source['thickness_um']} мкм\n"
        f"Intercut: {inter_cut_mm} мм, кромка: {edge_trim} мм, "
        f"использовано: {metrics['used_length_m']} м, отход: {metrics['waste_percentage']}%"
    )
    ax.set_title(title)
    ax.set_xlabel("Ширина, мм")
    ax.set_ylabel("Длина, м")
    ax.set_xlim(0, raw_width)
    ax.set_ylim(visible_length, 0)
    plt.tight_layout()

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=220)
    plt.close(fig)


def draw_all_rolls(
    solution_path: str | Path,
    output_dir: str | Path,
    show_gaps: bool = True,
    show_vertical_kerf: bool = True,
    show_horizontal_kerf: bool = True,
    max_length_m: float | None = None,
) -> list[Path]:
    data = load_solution(solution_path)
    rolls = get_rolls(data)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    out_files: list[Path] = []
    for roll in rolls:
        alloy = str(roll["source_material"]["alloy"])
        thickness = str(roll["source_material"]["thickness_um"])
        roll_index = roll["roll_index"]
        out_path = output_dir / f"roll_{roll_index}_{alloy}_{thickness}.png"
        draw_roll(
            roll=roll,
            output_path=out_path,
            show_gaps=show_gaps,
            show_vertical_kerf=show_vertical_kerf,
            show_horizontal_kerf=show_horizontal_kerf,
            max_length_m=max_length_m,
        )
        out_files.append(out_path)
    return out_files


def main() -> None:
    parser = argparse.ArgumentParser(description="Visualizer for shelf optimizer JSON with vertical and horizontal kerf")
    parser.add_argument("--solution", default=r"C:\Users\Dima\Desktop\Русал_задача\solution_shelf_v3.json")
    parser.add_argument("--outdir", default=r"C:\Users\Dima\Desktop\Русал_задача\viz_shelf_v3")
    parser.add_argument("--hide-gaps", action="store_true")
    parser.add_argument("--hide-vertical-kerf", action="store_true")
    parser.add_argument("--hide-horizontal-kerf", action="store_true")
    parser.add_argument("--max-length-m", type=float, default=None)
    args = parser.parse_args()

    files = draw_all_rolls(
        solution_path=args.solution,
        output_dir=args.outdir,
        show_gaps=not args.hide_gaps,
        show_vertical_kerf=not args.hide_vertical_kerf,
        show_horizontal_kerf=not args.hide_horizontal_kerf,
        max_length_m=args.max_length_m,
    )
    print("Сохранено файлов:", len(files))
    for f in files:
        print(f)


if __name__ == "__main__":
    main()
