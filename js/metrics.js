'use strict';

// ═══════════════════════════════════════════
//  МЕТРИКИ И JSON-ИНСТРУКЦИЯ ДЛЯ ЧПУ
// ═══════════════════════════════════════════
function updateMetrics() {
  const totalArea = (BOBBIN_W / 1000) * totalLen;
  let usedArea = 0;
  layout.forEach(item => { usedArea += (item.w / 1000) * item.l; });

  const cutArea = layout.reduce((s, item) => {
    const cut = getInterCut(item.alloy, item.thick);
    return s + (cut / 1000) * item.l;
  }, 0);
  const edgeArea  = (EDGE_TRIM * 2 / 1000) * totalLen;
  const wasteArea = totalArea - usedArea;
  const wastePct  = (wasteArea / totalArea * 100).toFixed(1);

  document.getElementById('mWaste').textContent = wastePct + '%';
  const cls = +wastePct < 10 ? 'good' : +wastePct < 20 ? 'warn' : 'bad';
  document.getElementById('mWaste').className = 'm-big-val ' + cls;
  document.getElementById('mUsed').textContent   = usedArea.toFixed(1) + ' м²';
  document.getElementById('mWasteA').textContent = wasteArea.toFixed(1) + ' м²';
  document.getElementById('mLen').textContent    = totalLen + ' м';
  document.getElementById('mOrders').textContent = orders.length;
  document.getElementById('mPlaced').textContent = layout.length;

  // Мини-гистограммы
  const p1a = layout.filter(i => i.priority === 1).reduce((s, i) => s + (i.w / 1000) * i.l, 0);
  const p2a = layout.filter(i => i.priority > 1).reduce((s, i) => s + (i.w / 1000) * i.l, 0);
  const bars = [
    {label: 'Очередь 1', val: p1a,       pct: p1a / totalArea * 100,                            color: '#c8f03c'},
    {label: 'Спутники',  val: p2a,       pct: p2a / totalArea * 100,                            color: '#3de0f5'},
    {label: 'Кромки',    val: edgeArea,  pct: edgeArea / totalArea * 100,                       color: 'rgba(245,184,51,.6)'},
    {label: 'Обрезки',   val: wasteArea - edgeArea, pct: Math.max(0, (wasteArea - edgeArea) / totalArea * 100), color: 'rgba(255,255,255,.2)'},
  ];
  document.getElementById('mBars').innerHTML = bars.map(b => `
    <div class="mbar-row">
      <div class="mbar-top"><span>${b.label}</span><span>${b.pct.toFixed(1)}%</span></div>
      <div class="mbar-track"><div class="mbar-fill" style="width:${b.pct}%;background:${b.color}"></div></div>
    </div>`).join('');

  // Список размещённых заказов
  document.getElementById('mBreakdown').innerHTML = layout.map(item => `
    <div class="ob-item">
      <div class="ob-dot" style="background:${item.priority === 1 ? '#c8f03c' : '#3de0f5'}"></div>
      <span class="ob-id">${item.id}</span>
      <span class="ob-dim">${item.w}×${item.l}м</span>
    </div>`).join('');

  // JSON-инструкция для ЧПУ — берём готовый ответ Python
  const jsonObj = pyResult || {
    instruction_metadata: {
      batch_id:  `RUN-${new Date().toISOString().slice(0, 10)}-001`,
      timestamp: new Date().toISOString(),
      factory:    'СаАЗ',
      machine_id: 'MILL-05'
    },
    source_material: {
      alloy:           layout[0]?.alloy || 'AA8011',
      thickness_um:    layout[0]?.thick || 15,
      bobbin_width_mm: BOBBIN_W,
      bobbin_length_m: BOBBIN_LEN
    },
    cutting_map: layout.map(item => ({
      order_id: item.id,
      priority: item.priority,
      coordinates: {x_start_mm: item.x, y_start_m: item.y, width_mm: item.w, length_m: item.l}
    })),
    efficiency_metrics: {
      total_used_area_m2: +usedArea.toFixed(2),
      waste_area_m2:      +wasteArea.toFixed(2),
      waste_percentage:   +wastePct
    }
  };

  window._jsonStr = JSON.stringify(jsonObj, null, 2);
  const hl = window._jsonStr
    .replace(/"([^"]+)":/g,       '<span class="jk">"$1"</span>:')
    .replace(/: "([^"]+)"/g,      ': <span class="js">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g,  ': <span class="jn">$1</span>');
  document.getElementById('jBody').innerHTML = hl;
}
