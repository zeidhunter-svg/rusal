'use strict';

// ═══════════════════════════════════════════
//  АЛГОРИТМ РАСКРОЯ — Greedy Strip Packing
//  с поддержкой приоритетов и спутников
// ═══════════════════════════════════════════
function computeLayout() {
  layout = [];
  const usable = BOBBIN_W - 2 * EDGE_TRIM;
  let yOff = 0;
  const placedSet = new Set();

  // Разворачиваем qty > 1 в отдельные позиции
  const expanded = [];
  orders.forEach(o => {
    for (let q = 0; q < o.qty; q++) {
      expanded.push({...o, id: o.qty > 1 ? `${o.id}-${q + 1}` : o.id});
    }
  });

  // Сортировка: сначала приоритет 1, затем по ширине убыв. (лучшая упаковка)
  const sorted = [...expanded].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.w - a.w;
  });

  const p1Items = sorted.filter(x => x.priority === 1);
  const allP1Placed = () => p1Items.every(x => placedSet.has(x.id));

  // Жадный алгоритм: полоса за полосой
  let idx = 0;
  while (idx < sorted.length) {
    const anchor = sorted[idx];
    if (anchor.priority > 1 && !allP1Placed()) { idx++; continue; }
    if (placedSet.has(anchor.id)) { idx++; continue; }

    const cut = getInterCut(anchor.alloy, anchor.thick);
    let xCursor = EDGE_TRIM;
    let stripH  = anchor.l;

    // Размещаем якорный элемент
    if (anchor.w <= usable) {
      layout.push({...anchor, x: xCursor, y: yOff, type: anchor.priority === 1 ? 'main' : 'satellite'});
      placedSet.add(anchor.id);
      xCursor += anchor.w + cut;
    }
    idx++;

    // Заполняем остаток полосы спутниками
    const remain = BOBBIN_W - EDGE_TRIM - xCursor;
    if (remain > 50) {
      const candidates = sorted.filter(c =>
        !placedSet.has(c.id) &&
        c.alloy === anchor.alloy && c.thick === anchor.thick &&
        c.w <= remain &&
        c.l <= stripH * 2
      ).sort((a, b) => b.w - a.w);

      let xC = xCursor;
      for (const cand of candidates) {
        const rem2 = BOBBIN_W - EDGE_TRIM - xC;
        if (cand.w <= rem2) {
          layout.push({...cand, x: xC, y: yOff, type: 'satellite'});
          placedSet.add(cand.id);
          stripH = Math.max(stripH, cand.l);
          xC += cand.w + cut;
          if (xC + 100 > BOBBIN_W - EDGE_TRIM) break;
        }
      }
    }

    yOff += stripH + cut;
  }

  // Неразмещённые элементы (другой сплав/толщина или слишком широкие)
  for (const item of sorted) {
    if (placedSet.has(item.id)) continue;
    const cut = getInterCut(item.alloy, item.thick);
    layout.push({...item, x: EDGE_TRIM, y: yOff, type: item.priority === 1 ? 'main' : 'satellite'});
    placedSet.add(item.id);
    yOff += item.l + cut;
  }

  return Math.max(yOff + 20, 200);
}
