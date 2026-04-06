
from __future__ import annotations

import argparse
import itertools
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

try:
    import pandas as pd
except Exception as e:
    raise SystemExit(
        "Не найден pandas. Установи его командой:\n"
        "  py -m pip install pandas openpyxl\n\n"
        f"Текст ошибки: {e}"
    )


def read_table_auto(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    suffix = path.suffix.lower()

    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path)

    last_error = None
    for enc in ("utf-8-sig", "cp1251", "utf-8"):
        try:
            return pd.read_csv(path, sep=None, engine="python", encoding=enc)
        except Exception as e:
            last_error = e
    raise RuntimeError(f"Не удалось прочитать файл {path}. Последняя ошибка: {last_error}")


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [str(c).strip().lower() for c in out.columns]
    return out


def resolve_column(df: pd.DataFrame, aliases: list[str], required: bool = True) -> Optional[str]:
    for alias in aliases:
        if alias in df.columns:
            return alias
    if required:
        raise ValueError(f"Не найдена обязательная колонка. Ожидались варианты: {aliases}")
    return None


def norm_str(x: Any) -> str:
    s = str(x).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s


def norm_float(x: Any) -> float:
    if pd.isna(x):
        raise ValueError("Пустое числовое значение")
    return round(float(str(x).strip().replace(",", ".")), 3)


def norm_int(x: Any) -> int:
    return int(round(norm_float(x)))


def norm_thickness(x: Any) -> float:
    return round(float(str(x).strip().replace(",", ".")), 2)


@dataclass(frozen=True)
class MaterialKey:
    alloy: str
    thickness_um: float


@dataclass
class MaterialRule:
    alloy: str
    thickness_um: float
    inter_cut_mm: int
    edge_trim_mm: int = 15


@dataclass
class Plate:
    plate_id: str
    order_id: str
    queue: int
    alloy: str
    thickness_um: float
    width_mm: int
    length_mm: int
    source_row: int

    @property
    def area_mm2(self) -> int:
        return self.width_mm * self.length_mm

    @property
    def material_key(self) -> MaterialKey:
        return MaterialKey(self.alloy, self.thickness_um)


@dataclass
class Placement:
    plate_id: str
    order_id: str
    queue: int
    shelf_index: int
    x_mm: int
    y_mm: int
    width_mm: int
    length_mm: int


@dataclass
class Gap:
    gap_id: str
    shelf_index: int
    x_mm: int
    y_mm: int
    width_mm: int
    height_mm: int
    source: str

    @property
    def area_mm2(self) -> int:
        return self.width_mm * self.height_mm


@dataclass
class Shelf:
    shelf_index: int
    y_mm: int
    height_mm: int
    placements: list[Placement] = field(default_factory=list)
    used_width_mm: int = 0
    created_from_queue: str = "Q1"


@dataclass
class RollPlan:
    roll_index: int
    alloy: str
    thickness_um: float
    inter_cut_mm: int
    edge_trim_mm: int
    raw_roll_width_mm: int
    raw_roll_length_mm: int
    effective_width_mm: int
    effective_length_mm: int
    shelves: list[Shelf] = field(default_factory=list)
    gaps: list[Gap] = field(default_factory=list)

    @property
    def used_length_mm(self) -> int:
        """
        Реально занятая длина рулона = последняя полка + ее высота.
        Межполочный рез учитывается тем, что y следующей полки уже смещен вниз на inter_cut_mm.
        Поэтому отдельный +inter_cut здесь не нужен.
        """
        if not self.shelves:
            return 0
        return max((s.y_mm + s.height_mm for s in self.shelves), default=0)


@dataclass
class SolveConfig:
    roll_width_mm: int = 1500
    roll_length_mm: int = 10_000_000
    max_combo_size: int = 3
    combo_candidate_limit: int = 12
    empty_width_threshold: float = 0.30
    force_single_roll: bool = False   # все заказы на один рулон
    defaults_orders_path: str = r"C:\Users\Dima\Desktop\Русал_задача\orders.csv"
    defaults_rules_path: str = r"C:\Users\Dima\Desktop\Русал_задача\intercut.csv"
    defaults_output_path: str = r"C:\Users\Dima\Desktop\Русал_задача\solution_shelf_v3.json"


class DataLoader:
    ORDER_ALIASES = {
        "order_id": ["order_id", "заказ", "номер_заказа", "id_заказа", "номер заказа"],
        "queue": ["queue", "очередь", "priority", "приоритет", "очередность заказа", "очередность"],
        "alloy": ["alloy", "сплав"],
        "thickness": ["thickness", "толщина", "толщина (мкм)", "толщина материала (мкм)"],
        "width_mm": ["width_mm", "ширина", "ширина_мм", "width", "ширина листа заказа (мм)", "ширина заказа (мм)"],
        "length_m": ["length_m", "длина", "длина_м", "length", "длина листа заказа (м)", "длина заказа (м)"],
        "quantity": ["quantity", "qty", "количество"],
    }

    RULE_ALIASES = {
        "alloy": ["alloy", "сплав"],
        "thickness": ["thickness", "толщина", "толщина (мкм)", "толщина материала (мкм)"],
        "inter_cut_mm": [
            "inter_cut_mm", "inter_cut", "межкройный_рез", "межкрой",
            "ширина межкройного реза (мм)", "межкройный рез (мм)", "межкройный рез"
        ],
        "edge_trim_mm": [
            "edge_trim_mm", "edge_trim", "кромка", "обрезь_кромки",
            "ширина кромки (мм)", "кромка (мм)"
        ],
    }

    @classmethod
    def load_rules(cls, path: str | Path) -> dict[MaterialKey, MaterialRule]:
        df = normalize_columns(read_table_auto(path))
        alloy_col = resolve_column(df, cls.RULE_ALIASES["alloy"])
        thickness_col = resolve_column(df, cls.RULE_ALIASES["thickness"])
        inter_cut_col = resolve_column(df, cls.RULE_ALIASES["inter_cut_mm"])
        edge_trim_col = resolve_column(df, cls.RULE_ALIASES["edge_trim_mm"], required=False)

        rules: dict[MaterialKey, MaterialRule] = {}
        for _, row in df.iterrows():
            alloy = norm_str(row[alloy_col])
            thickness_um = norm_thickness(row[thickness_col])
            inter_cut_mm = norm_int(row[inter_cut_col])
            edge_trim_mm = 15 if edge_trim_col is None or pd.isna(row[edge_trim_col]) else norm_int(row[edge_trim_col])

            key = MaterialKey(alloy, thickness_um)
            rules[key] = MaterialRule(
                alloy=alloy,
                thickness_um=thickness_um,
                inter_cut_mm=inter_cut_mm,
                edge_trim_mm=edge_trim_mm,
            )
        return rules

    @classmethod
    def load_orders(cls, path: str | Path) -> list[Plate]:
        df = normalize_columns(read_table_auto(path))
        order_col = resolve_column(df, cls.ORDER_ALIASES["order_id"])
        queue_col = resolve_column(df, cls.ORDER_ALIASES["queue"])
        alloy_col = resolve_column(df, cls.ORDER_ALIASES["alloy"])
        thickness_col = resolve_column(df, cls.ORDER_ALIASES["thickness"])
        width_col = resolve_column(df, cls.ORDER_ALIASES["width_mm"])
        length_col = resolve_column(df, cls.ORDER_ALIASES["length_m"])
        qty_col = resolve_column(df, cls.ORDER_ALIASES["quantity"], required=False)

        plates: list[Plate] = []
        next_id = 1
        for row_idx, row in df.iterrows():
            order_id = str(row[order_col]).strip()
            queue = norm_int(row[queue_col])
            alloy = norm_str(row[alloy_col])
            thickness_um = norm_thickness(row[thickness_col])
            width_mm = norm_int(row[width_col])
            length_mm = int(round(norm_float(row[length_col]) * 1000.0))
            quantity = 1 if qty_col is None else norm_int(row[qty_col])

            if width_mm <= 0 or length_mm <= 0 or quantity <= 0:
                raise ValueError(f"Некорректные размеры/количество в строке {row_idx + 2}")

            for _ in range(quantity):
                plates.append(
                    Plate(
                        plate_id=f"P{next_id:07d}",
                        order_id=order_id,
                        queue=queue,
                        alloy=alloy,
                        thickness_um=thickness_um,
                        width_mm=width_mm,
                        length_mm=length_mm,
                        source_row=row_idx + 2,
                    )
                )
                next_id += 1
        return plates


class ShelfOptimizer:
    def __init__(self, config: SolveConfig, rules: dict[MaterialKey, MaterialRule]):
        self.config = config
        self.rules = rules
        self.gap_counter = 1

    def solve(self, plates: list[Plate]) -> dict[str, Any]:
        roll_plans: list[RollPlan] = []
        material_summaries: list[dict[str, Any]] = []

        if self.config.force_single_roll:
            # Все заказы на один рулон — используем правило доминирующего материала
            from collections import Counter
            counts = Counter(p.material_key for p in plates)
            dominant_key = counts.most_common(1)[0][0]
            rule = self.rules.get(dominant_key) or MaterialRule(
                alloy=dominant_key.alloy,
                thickness_um=dominant_key.thickness_um,
                inter_cut_mm=5,
                edge_trim_mm=15,
            )
            roll = self._solve_one_material_group(1, plates, rule)
            roll_plans = [roll]
            material_summaries = [self._material_summary(roll)]
        else:
            groups: dict[MaterialKey, list[Plate]] = {}
            for plate in plates:
                groups.setdefault(plate.material_key, []).append(plate)

            roll_index = 1
            for material_key, group_plates in sorted(groups.items(), key=lambda kv: (kv[0].alloy, kv[0].thickness_um)):
                rule = self.rules.get(material_key)
                if rule is None:
                    raise ValueError(f"Нет межкройного реза для сплава {material_key.alloy} и толщины {material_key.thickness_um}")

                roll = self._solve_one_material_group(roll_index, group_plates, rule)
                roll_plans.append(roll)
                material_summaries.append(self._material_summary(roll))
                roll_index += 1

        total_used_area = sum(
            sum(p.width_mm * p.length_mm for shelf in roll.shelves for p in shelf.placements)
            for roll in roll_plans
        )
        total_consumed_area = sum(roll.effective_width_mm * roll.used_length_mm for roll in roll_plans)
        waste_area = max(total_consumed_area - total_used_area, 0)
        waste_pct = 0.0 if total_consumed_area == 0 else waste_area / total_consumed_area * 100.0

        return {
            "meta": {
                "solver": "priority_shelf_bestfit_combinations_v3_with_real_kerf_xy",
                "roll_width_mm": self.config.roll_width_mm,
                "roll_length_m": self.config.roll_length_mm / 1000.0,
                "max_combo_size": self.config.max_combo_size,
                "combo_candidate_limit": self.config.combo_candidate_limit,
                "empty_width_threshold": self.config.empty_width_threshold,
            },
            "summary": {
                "rolls_used": len(roll_plans),
                "used_area_m2": round(total_used_area / 1_000_000.0, 3),
                "consumed_area_m2": round(total_consumed_area / 1_000_000.0, 3),
                "waste_area_m2": round(waste_area / 1_000_000.0, 3),
                "waste_percentage": round(waste_pct, 3),
            },
            "materials": material_summaries,
            "rolls": [self._serialize_roll(roll) for roll in roll_plans],
        }

    def _solve_one_material_group(self, roll_index: int, plates: list[Plate], rule: MaterialRule) -> RollPlan:
        effective_width = self.config.roll_width_mm - 2 * rule.edge_trim_mm
        if effective_width <= 0:
            raise ValueError(f"Полезная ширина <= 0 для {rule.alloy}/{rule.thickness_um}")

        roll = RollPlan(
            roll_index=roll_index,
            alloy=rule.alloy,
            thickness_um=rule.thickness_um,
            inter_cut_mm=rule.inter_cut_mm,
            edge_trim_mm=rule.edge_trim_mm,
            raw_roll_width_mm=self.config.roll_width_mm,
            raw_roll_length_mm=self.config.roll_length_mm,
            effective_width_mm=effective_width,
            effective_length_mm=self.config.roll_length_mm,
        )

        q1 = self._sort_plates([p for p in plates if p.queue == 1])
        other = self._sort_plates([p for p in plates if p.queue != 1])

        current_y = 0
        shelf_index = 1

        while q1:
            shelf, q1, new_gaps = self._build_one_shelf(shelf_index, current_y, q1, roll, "Q1")
            roll.shelves.append(shelf)
            roll.gaps.extend(new_gaps)
            shelf_index += 1

            if q1:
                current_y += shelf.height_mm + roll.inter_cut_mm
            else:
                current_y += shelf.height_mm

        remainder = self._sort_plates(other)
        roll.gaps = self._sort_gaps(roll.gaps)
        remainder = self._fill_gaps_in_order(roll, roll.gaps, remainder)

        while remainder:
            shelf, remainder, new_gaps = self._build_one_shelf(shelf_index, current_y, remainder, roll, "Q2+")
            roll.shelves.append(shelf)
            roll.gaps.extend(new_gaps)
            shelf_index += 1

            if remainder:
                current_y += shelf.height_mm + roll.inter_cut_mm
            else:
                current_y += shelf.height_mm

            roll.gaps = self._sort_gaps(roll.gaps)
            remainder = self._fill_gaps_in_order(roll, roll.gaps, remainder)
            remainder = self._sort_plates(remainder)

        return roll

    def _sort_plates(self, plates: list[Plate]) -> list[Plate]:
        return sorted(plates, key=lambda p: (-p.width_mm, -p.length_mm, p.queue, p.order_id, p.plate_id))

    def _sort_gaps(self, gaps: list[Gap]) -> list[Gap]:
        return sorted(gaps, key=lambda g: (g.shelf_index, g.y_mm, g.x_mm, g.source))

    def _combo_width_in_empty_region(self, combo: tuple[Plate, ...], inter_cut_mm: int) -> int:
        if not combo:
            return 0
        return sum(p.width_mm for p in combo) + max(0, len(combo) - 1) * inter_cut_mm

    def _extra_width_after_existing_left_neighbor(self, combo: tuple[Plate, ...], inter_cut_mm: int) -> int:
        if not combo:
            return 0
        return inter_cut_mm + self._combo_width_in_empty_region(combo, inter_cut_mm)

    def _place_combo_in_empty_region(
        self,
        combo: tuple[Plate, ...],
        start_x_mm: int,
        y_mm: int,
        shelf_index: int,
        inter_cut_mm: int,
    ) -> list[Placement]:
        placements: list[Placement] = []
        x = start_x_mm
        for idx, plate in enumerate(combo):
            placements.append(
                Placement(
                    plate_id=plate.plate_id,
                    order_id=plate.order_id,
                    queue=plate.queue,
                    shelf_index=shelf_index,
                    x_mm=x,
                    y_mm=y_mm,
                    width_mm=plate.width_mm,
                    length_mm=plate.length_mm,
                )
            )
            x += plate.width_mm
            if idx < len(combo) - 1:
                x += inter_cut_mm
        return placements

    def _build_one_shelf(self, shelf_index: int, y_mm: int, source_plates: list[Plate], roll: RollPlan, source_label: str):
        if not source_plates:
            raise ValueError("Попытка открыть полку на пустом наборе пластин")

        base = source_plates[0]
        shelf = Shelf(
            shelf_index=shelf_index,
            y_mm=y_mm,
            height_mm=base.length_mm,
            placements=[],
            used_width_mm=0,
            created_from_queue=source_label,
        )
        remaining = list(source_plates)

        base_placement = Placement(
            plate_id=base.plate_id,
            order_id=base.order_id,
            queue=base.queue,
            shelf_index=shelf_index,
            x_mm=roll.edge_trim_mm,
            y_mm=y_mm,
            width_mm=base.width_mm,
            length_mm=base.length_mm,
        )
        shelf.placements.append(base_placement)
        shelf.used_width_mm = base.width_mm
        remaining.remove(base)

        while True:
            residual_width = roll.effective_width_mm - shelf.used_width_mm - roll.inter_cut_mm
            if residual_width <= 0:
                break

            combo = self._find_best_combo_for_empty_region(
                remaining,
                residual_width,
                shelf.height_mm,
                roll.inter_cut_mm,
            )
            if combo is None:
                break

            start_x = roll.edge_trim_mm + shelf.used_width_mm + roll.inter_cut_mm
            new_placements = self._place_combo_in_empty_region(
                combo,
                start_x,
                y_mm,
                shelf_index,
                roll.inter_cut_mm,
            )
            shelf.placements.extend(new_placements)

            for plate in combo:
                remaining.remove(plate)

            shelf.used_width_mm += self._extra_width_after_existing_left_neighbor(combo, roll.inter_cut_mm)

        new_gaps = self._extract_gaps_from_shelf(shelf, roll)
        return shelf, self._sort_plates(remaining), new_gaps

    def _find_best_combo_for_empty_region(
        self,
        candidates: list[Plate],
        empty_width_mm: int,
        max_height_mm: int,
        inter_cut_mm: int,
    ):
        filtered = [p for p in candidates if p.length_mm <= max_height_mm and p.width_mm <= empty_width_mm]
        if not filtered:
            return None
        filtered = self._sort_plates(filtered)[: self.config.combo_candidate_limit]

        best_combo = None
        best_score = None
        max_r = min(self.config.max_combo_size, len(filtered))

        for r in range(1, max_r + 1):
            for combo in itertools.combinations(filtered, r):
                consumed_width = self._combo_width_in_empty_region(combo, inter_cut_mm)
                if consumed_width > empty_width_mm:
                    continue

                filled_area = sum(p.width_mm * p.length_mm for p in combo)
                leftover_width = empty_width_mm - consumed_width
                score = (
                    -filled_area,
                    leftover_width,
                    -sum(p.width_mm for p in combo),
                    -max(p.length_mm for p in combo),
                )
                if best_score is None or score < best_score:
                    best_score = score
                    best_combo = combo
        return best_combo

    def _extract_gaps_from_shelf(self, shelf: Shelf, roll: RollPlan) -> list[Gap]:
        gaps: list[Gap] = []

        # Пустоты над короткими плитами внутри полки
        for placement in sorted(shelf.placements, key=lambda p: p.x_mm):
            empty_h = shelf.height_mm - placement.length_mm
            if empty_h > 0:
                gaps.append(
                    Gap(
                        gap_id=self._next_gap_id(),
                        shelf_index=shelf.shelf_index,
                        x_mm=placement.x_mm,
                        y_mm=placement.y_mm + placement.length_mm,
                        width_mm=placement.width_mm,
                        height_mm=empty_h,
                        source=f"{shelf.created_from_queue.lower()}_above_plate",
                    )
                )

        # Правая пустота: перед будущей соседней плитой справа нужен межкройный рез
        raw_right_width = roll.effective_width_mm - shelf.used_width_mm - roll.inter_cut_mm
        if raw_right_width > 0:
            left_ratio = raw_right_width / roll.effective_width_mm
            if left_ratio > self.config.empty_width_threshold:
                gaps.append(
                    Gap(
                        gap_id=self._next_gap_id(),
                        shelf_index=shelf.shelf_index,
                        x_mm=roll.edge_trim_mm + shelf.used_width_mm + roll.inter_cut_mm,
                        y_mm=shelf.y_mm,
                        width_mm=raw_right_width,
                        height_mm=shelf.height_mm,
                        source=f"{shelf.created_from_queue.lower()}_shelf_right",
                    )
                )
        return self._sort_gaps(gaps)

    def _fill_gaps_in_order(self, roll: RollPlan, gaps: list[Gap], remaining: list[Plate]) -> list[Plate]:
        active_gaps = list(gaps)
        remaining_plates = list(remaining)
        next_round_gaps: list[Gap] = []

        for gap in self._sort_gaps(active_gaps):
            if not remaining_plates:
                next_round_gaps.append(gap)
                continue

            combo = self._find_best_combo_for_empty_region(
                remaining_plates,
                gap.width_mm,
                gap.height_mm,
                roll.inter_cut_mm,
            )
            if combo is None:
                next_round_gaps.append(gap)
                continue

            owner_shelf = next(s for s in roll.shelves if s.shelf_index == gap.shelf_index)
            new_placements = self._place_combo_in_empty_region(
                combo,
                gap.x_mm,
                gap.y_mm,
                gap.shelf_index,
                roll.inter_cut_mm,
            )
            owner_shelf.placements.extend(new_placements)

            for plate in combo:
                remaining_plates.remove(plate)

            combo_width = self._combo_width_in_empty_region(combo, roll.inter_cut_mm)

            for placement in new_placements:
                above_h = gap.height_mm - placement.length_mm
                if above_h > 0:
                    next_round_gaps.append(
                        Gap(
                            gap_id=self._next_gap_id(),
                            shelf_index=gap.shelf_index,
                            x_mm=placement.x_mm,
                            y_mm=placement.y_mm + placement.length_mm,
                            width_mm=placement.width_mm,
                            height_mm=above_h,
                            source="gap_subgap_above_plate",
                        )
                    )

            # После заполнения текущего gap справа тоже резервируем один межкройный рез
            remaining_right = gap.width_mm - combo_width - roll.inter_cut_mm
            if remaining_right > 0:
                next_round_gaps.append(
                    Gap(
                        gap_id=self._next_gap_id(),
                        shelf_index=gap.shelf_index,
                        x_mm=gap.x_mm + combo_width + roll.inter_cut_mm,
                        y_mm=gap.y_mm,
                        width_mm=remaining_right,
                        height_mm=gap.height_mm,
                        source="gap_subgap_right",
                    )
                )

        roll.gaps = self._sort_gaps(next_round_gaps)
        return self._sort_plates(remaining_plates)

    def _next_gap_id(self) -> str:
        gid = f"G{self.gap_counter:07d}"
        self.gap_counter += 1
        return gid

    def _material_summary(self, roll: RollPlan) -> dict[str, Any]:
        used_area_mm2 = sum(p.width_mm * p.length_mm for s in roll.shelves for p in s.placements)
        consumed_area_mm2 = roll.effective_width_mm * roll.used_length_mm
        waste_area_mm2 = max(consumed_area_mm2 - used_area_mm2, 0)
        waste_pct = 0.0 if consumed_area_mm2 == 0 else waste_area_mm2 / consumed_area_mm2 * 100.0

        return {
            "roll_index": roll.roll_index,
            "alloy": roll.alloy,
            "thickness_um": roll.thickness_um,
            "inter_cut_mm": roll.inter_cut_mm,
            "edge_trim_mm": roll.edge_trim_mm,
            "used_length_m": round(roll.used_length_mm / 1000.0, 3),
            "used_area_m2": round(used_area_mm2 / 1_000_000.0, 3),
            "consumed_area_m2": round(consumed_area_mm2 / 1_000_000.0, 3),
            "waste_area_m2": round(waste_area_mm2 / 1_000_000.0, 3),
            "waste_percentage": round(waste_pct, 3),
            "shelves_count": len(roll.shelves),
            "gaps_remaining": len(roll.gaps),
        }

    def _serialize_roll(self, roll: RollPlan) -> dict[str, Any]:
        used_area_mm2 = sum(p.width_mm * p.length_mm for s in roll.shelves for p in s.placements)
        consumed_area_mm2 = roll.effective_width_mm * roll.used_length_mm
        waste_area_mm2 = max(consumed_area_mm2 - used_area_mm2, 0)
        waste_pct = 0.0 if consumed_area_mm2 == 0 else waste_area_mm2 / consumed_area_mm2 * 100.0

        placements = []
        for shelf in sorted(roll.shelves, key=lambda s: s.shelf_index):
            for p in sorted(shelf.placements, key=lambda z: (z.y_mm, z.x_mm, z.queue)):
                placements.append(
                    {
                        "plate_id": p.plate_id,
                        "order_id": p.order_id,
                        "queue": p.queue,
                        "shelf_index": p.shelf_index,
                        "coordinates": {
                            "x_start_mm": p.x_mm,
                            "y_start_m": round(p.y_mm / 1000.0, 3),
                            "width_mm": p.width_mm,
                            "length_m": round(p.length_mm / 1000.0, 3),
                        },
                    }
                )

        gaps = [
            {
                "gap_id": g.gap_id,
                "shelf_index": g.shelf_index,
                "x_mm": g.x_mm,
                "y_m": round(g.y_mm / 1000.0, 3),
                "width_mm": g.width_mm,
                "height_m": round(g.height_mm / 1000.0, 3),
                "source": g.source,
            }
            for g in self._sort_gaps(roll.gaps)
        ]

        return {
            "roll_index": roll.roll_index,
            "source_material": {
                "alloy": roll.alloy,
                "thickness_um": roll.thickness_um,
                "bobbin_width_mm": roll.raw_roll_width_mm,
                "bobbin_length_m": round(roll.raw_roll_length_mm / 1000.0, 3),
            },
            "layout_configuration": {
                "inter_cut_mm": roll.inter_cut_mm,
                "edge_trim_mm": roll.edge_trim_mm,
                "effective_width_mm": roll.effective_width_mm,
            },
            "shelves": [
                {
                    "shelf_index": s.shelf_index,
                    "y_start_m": round(s.y_mm / 1000.0, 3),
                    "height_m": round(s.height_mm / 1000.0, 3),
                    "created_from_queue": s.created_from_queue,
                    "used_width_mm": s.used_width_mm,
                }
                for s in sorted(roll.shelves, key=lambda s: s.shelf_index)
            ],
            "cutting_map": placements,
            "gaps_remaining": gaps,
            "efficiency_metrics": {
                "used_length_m": round(roll.used_length_mm / 1000.0, 3),
                "total_used_area_m2": round(used_area_mm2 / 1_000_000.0, 3),
                "consumed_area_m2": round(consumed_area_mm2 / 1_000_000.0, 3),
                "waste_area_m2": round(waste_area_mm2 / 1_000_000.0, 3),
                "waste_percentage": round(waste_pct, 3),
            },
        }


def solve_to_json(orders_path: str | Path, rules_path: str | Path, output_path: str | Path, config: SolveConfig) -> dict[str, Any]:
    rules = DataLoader.load_rules(rules_path)
    plates = DataLoader.load_orders(orders_path)
    optimizer = ShelfOptimizer(config=config, rules=rules)
    result = optimizer.solve(plates)
    Path(output_path).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main():
    defaults = SolveConfig()
    parser = argparse.ArgumentParser(description="Shelf-based optimizer for RUSAL task (correct kerf coordinates in X and Y)")
    parser.add_argument("--orders", default=defaults.defaults_orders_path, help="Path to orders CSV/XLSX")
    parser.add_argument("--rules", default=defaults.defaults_rules_path, help="Path to intercut CSV/XLSX")
    parser.add_argument("--output", default=defaults.defaults_output_path, help="Path to output JSON")
    parser.add_argument("--roll-width-mm", type=int, default=defaults.roll_width_mm)
    parser.add_argument("--roll-length-mm", type=int, default=defaults.roll_length_mm)
    parser.add_argument("--max-combo-size", type=int, default=defaults.max_combo_size)
    parser.add_argument("--combo-candidate-limit", type=int, default=defaults.combo_candidate_limit)
    parser.add_argument("--empty-width-threshold", type=float, default=defaults.empty_width_threshold)
    args = parser.parse_args()

    config = SolveConfig(
        roll_width_mm=args.roll_width_mm,
        roll_length_mm=args.roll_length_mm,
        max_combo_size=args.max_combo_size,
        combo_candidate_limit=args.combo_candidate_limit,
        empty_width_threshold=args.empty_width_threshold,
        defaults_orders_path=args.orders,
        defaults_rules_path=args.rules,
        defaults_output_path=args.output,
    )

    result = solve_to_json(args.orders, args.rules, args.output, config)
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
