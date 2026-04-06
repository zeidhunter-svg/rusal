'use strict';

// ═══════════════════════════════════════════
//  НОРМАЛИЗАЦИЯ ОТВЕТА PYTHON → app state
// ═══════════════════════════════════════════
function applyResult(result) {
  pyResult = result;
  layout   = [];
  shelves  = [];
  gaps     = [];

  let yOffset = 0; // смещение по Y для стека рулонов

  result.rolls.forEach(roll => {
    const alloy       = roll.source_material.alloy;
    const thick       = roll.source_material.thickness_um;
    const interCutMm  = roll.layout_configuration.inter_cut_mm;
    const edgeTrimMm  = roll.layout_configuration.edge_trim_mm;
    const usedLen     = roll.efficiency_metrics.used_length_m;

    // cutting_map → layout[]
    roll.cutting_map.forEach(item => {
      const c = item.coordinates;
      layout.push({
        id:          item.order_id,
        plate_id:    item.plate_id,
        x:           c.x_start_mm,
        y:           c.y_start_m + yOffset,
        w:           c.width_mm,
        l:           c.length_m,
        priority:    item.queue,
        type:        item.queue === 1 ? 'main' : 'satellite',
        alloy,
        thick,
        shelf_index: item.shelf_index,
        roll_index:  roll.roll_index,
      });
    });

    // shelves → shelves[]
    roll.shelves.forEach(s => {
      shelves.push({
        shelf_index:        s.shelf_index,
        y_start_m:          s.y_start_m + yOffset,
        height_m:           s.height_m,
        used_width_mm:      s.used_width_mm,
        created_from_queue: s.created_from_queue,
        roll_index:         roll.roll_index,
        inter_cut_mm:       interCutMm,
        edge_trim_mm:       edgeTrimMm,
      });
    });

    // gaps_remaining → gaps[]
    roll.gaps_remaining.forEach(g => {
      gaps.push({
        x_mm:       g.x_mm,
        y_m:        g.y_m + yOffset,
        width_mm:   g.width_mm,
        height_m:   g.height_m,
        roll_index: roll.roll_index,
      });
    });

    yOffset += usedLen + (result.rolls.length > 1 ? 10 : 0); // 10 м разделитель между рулонами
  });

  // Общая длина: сумма всех рулонов + разделители
  totalLen = result.rolls.reduce((s, r) => s + r.efficiency_metrics.used_length_m, 0)
           + Math.max(0, result.rolls.length - 1) * 10;

  placed = layout.length > 0;
}

// ═══════════════════════════════════════════
//  ЗАПУСК ОПТИМИЗАЦИИ (Python API)
// ═══════════════════════════════════════════
async function runOptimization() {
  if (!orders.length) { showToast('Добавьте хотя бы один заказ', true); return; }

  const btn  = document.getElementById('runBtn');
  const fill = document.getElementById('progFill');
  btn.disabled = true;
  btn.textContent = '⏳ Расчёт...';
  btn.classList.add('running');
  fill.style.width = '0%';

  let p = 0;
  const iv = setInterval(() => {
    p += Math.random() * 10 + 3;
    if (p >= 85) { clearInterval(iv); p = 85; }
    fill.style.width = p + '%';
  }, 80);

  try {
    const res = await fetch('/api/solve', {
      method:  'POST',
      headers: {'Content-Type': 'application/json'},
      body:    JSON.stringify({orders}),
    });

    clearInterval(iv);

    if (!res.ok) {
      const err = await res.json().catch(() => ({error: `HTTP ${res.status}`}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const result = await res.json();

    fill.style.width = '100%';
    setTimeout(() => { fill.style.width = '0%'; }, 700);

    applyResult(result);

    btn.disabled = false;
    btn.textContent = '▶ Пересчитать';
    btn.classList.remove('running');

    drawCanvas();
    updateMetrics();
    fitToView();

    const rolls = result.rolls.length;
    const placed_count = layout.length;
    showToast(`Раскрой рассчитан · ${placed_count} позиций · ${rolls} рулон${rolls > 1 ? 'а' : ''}`);

  } catch (e) {
    clearInterval(iv);
    fill.style.width = '0%';
    btn.disabled = false;
    btn.textContent = '▶ Запустить расчёт';
    btn.classList.remove('running');
    showToast('Ошибка: ' + e.message, true);
  }
}
