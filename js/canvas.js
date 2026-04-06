'use strict';

// ═══════════════════════════════════════════
//  CANVAS — цвета (зеркало visualizer_v3.py)
// ═══════════════════════════════════════════
const QUEUE_COLORS  = { 1: '#7DCEA0', 2: '#F9E79F', 3: '#F5B7B1' };
const DEFAULT_COLOR = '#D5D8DC';
const GAP_COLOR     = '#85C1E9';
const KERF_COLOR    = 'rgba(255,0,0,0.75)';
const KERF_EDGE     = 'darkred';
const TRIM_COLOR    = '#E5E7E9';

// ═══════════════════════════════════════════
//  МАСШТАБНЫЕ КОНСТАНТЫ
// ═══════════════════════════════════════════
const PX_PER_MM = 0.20;
const PX_PER_M  = 0.065;
const RULER_W   = 42;
const RULER_H   = 22;

function px(mm) { return mm * PX_PER_MM * scale; }
function py(m)  { return m  * PX_PER_M  * scale; }

// ═══════════════════════════════════════════
//  ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ
// ═══════════════════════════════════════════
function drawCanvas() {
  const canvas = document.getElementById('canvas');
  const empty  = document.getElementById('emptyCanvas');

  if (!placed || !layout.length) {
    canvas.style.display = 'none';
    empty.style.display  = 'flex';
    return;
  }
  canvas.style.display = 'block';
  empty.style.display  = 'none';

  const W = Math.round(px(BOBBIN_W)) + RULER_W + 4;
  const H = Math.round(py(totalLen)) + RULER_H + 20;

  // Физические пиксели = логические × DPR → чёткость на HiDPI-экранах
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); // все координаты по-прежнему в логических пикселях

  // ── тёмный фон ──
  ctx.fillStyle = '#111214';
  ctx.fillRect(0, 0, W, H);

  // область рулона (смещена на размер линеек)
  const OX = RULER_W;  // origin X
  const OY = RULER_H;  // origin Y

  // вспомогательные конвертеры с учётом линеек
  const cx = mm => OX + px(mm);
  const cy = m  => OY + py(m);

  // ══════════════════════════════════════════
  //  1. ВНЕШНЯЯ ГРАНИЦА РУЛОНА  (outer border)
  // ══════════════════════════════════════════
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(cx(0), cy(0), px(BOBBIN_W), py(totalLen));

  // ══════════════════════════════════════════
  //  2. КРОМКИ  (edge trims)
  // ══════════════════════════════════════════
  const edgePx = px(EDGE_TRIM);
  ctx.fillStyle   = hexAlpha(TRIM_COLOR, 0.88);
  ctx.fillRect(cx(0),              cy(0), edgePx,          py(totalLen));  // левая
  ctx.fillRect(cx(BOBBIN_W - EDGE_TRIM), cy(0), edgePx,   py(totalLen));  // правая
  ctx.strokeStyle = '#9E9E9E';
  ctx.lineWidth   = 0.6;
  ctx.strokeRect(cx(0),              cy(0), edgePx,         py(totalLen));
  ctx.strokeRect(cx(BOBBIN_W - EDGE_TRIM), cy(0), edgePx,  py(totalLen));
  // подписи «Кромка»
  if (edgePx > 8) {
    const fs = Math.max(7, 7.5 * scale);
    ctx.font      = `${fs}px JetBrains Mono`;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.fillText('Кромка', cx(EDGE_TRIM / 2),               cy(0) + fs + 4);
    ctx.fillText('Кромка', cx(BOBBIN_W - EDGE_TRIM / 2),    cy(0) + fs + 4);
  }

  // ══════════════════════════════════════════
  //  3. КОНТУРЫ ПОЛОК  (shelf outlines)
  //     edgecolor="#AAB7B8", linestyle="--"
  // ══════════════════════════════════════════
  if (shelves.length) {
    shelves.forEach(s => {
      const sx = cx(s.edge_trim_mm);
      const sy = cy(s.y_start_m);
      const sw = px(BOBBIN_W - 2 * s.edge_trim_mm);
      const sh = py(s.height_m);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#AAB7B8';
      ctx.lineWidth   = 0.8;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);

      // метка полки
      if (sh > 14) {
        const fs = Math.max(7, 7 * scale);
        ctx.font      = `${fs}px JetBrains Mono`;
        ctx.fillStyle = '#AAB7B8';
        ctx.textAlign = 'left';
        ctx.fillText(
          `Shelf ${s.shelf_index} (${s.created_from_queue})`,
          sx + 5,
          sy + Math.min(sh * 0.08, py(2)) + fs
        );
      }
    });
  }

  // ══════════════════════════════════════════
  //  4. ГОРИЗОНТАЛЬНЫЙ МЕЖ­ПОЛЬНЫЙ РЕЗ
  //     facecolor=KERF_COLOR, edgecolor=KERF_EDGE, alpha=0.75
  // ══════════════════════════════════════════
  for (let i = 0; i < shelves.length - 1; i++) {
    const prev = shelves[i];
    const next = shelves[i + 1];
    if (prev.roll_index !== next.roll_index) continue;

    const yKerf  = prev.y_start_m + prev.height_m;
    const kerfHm = next.y_start_m - yKerf;
    if (kerfHm < 1e-9) continue;

    const kx = cx(prev.edge_trim_mm);
    const ky = cy(yKerf);
    const kw = px(BOBBIN_W - 2 * prev.edge_trim_mm);
    const kh = py(kerfHm);

    ctx.fillStyle   = KERF_COLOR;
    ctx.fillRect(kx, ky, kw, kh);
    ctx.strokeStyle = KERF_EDGE;
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(kx, ky, kw, kh);

    // подпись «N мм» если рез достаточно высок (>= 0.003 м = 3 мм)
    if (kerfHm >= 0.003 && kh > 6) {
      ctx.font      = `${Math.max(6, 6.5 * scale)}px JetBrains Mono`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${(kerfHm * 1000).toFixed(1)} мм`,
        kx + kw / 2,
        ky + kh / 2 + 3
      );
    }
  }

  // ══════════════════════════════════════════
  //  5. ЗАКАЗЫ  (placements)
  //     facecolor=QUEUE_COLORS, edgecolor="black", alpha=0.92
  // ══════════════════════════════════════════
  layout.forEach(item => {
    const ix = cx(item.x);
    const iy = cy(item.y);
    const iw = px(item.w);
    const ih = py(item.l);

    const baseColor = QUEUE_COLORS[item.priority] || DEFAULT_COLOR;
    const isActive  = activeId === item.id;

    // заливка — активный элемент ярче
    ctx.fillStyle = isActive ? lighten(baseColor) : hexAlpha(baseColor, 0.92);
    ctx.fillRect(ix, iy, iw, ih);

    // рамка
    ctx.strokeStyle = isActive ? '#000' : 'rgba(0,0,0,0.70)';
    ctx.lineWidth   = isActive ? 2.0 : 0.7;
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    // подпись: order_id + Q{queue}  (как в visualizer)
    const fs = Math.max(7, Math.min(10, 8.5 * scale));
    if (iw > 28 && ih > 16) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.font = `600 ${fs}px JetBrains Mono`;
      const label = iw > 80 ? item.id : item.id.replace('ORD-', '#');
      if (ih > 28) {
        ctx.fillText(label,            ix + iw / 2, iy + ih / 2 - fs * 0.3);
        ctx.font = `${Math.max(6, fs - 1)}px JetBrains Mono`;
        ctx.fillText(`Q${item.priority}`, ix + iw / 2, iy + ih / 2 + fs * 0.9);
      } else {
        ctx.fillText(`${label} Q${item.priority}`, ix + iw / 2, iy + ih / 2 + fs * 0.35);
      }
    }
  });

  // ══════════════════════════════════════════
  //  6. ВЕРТИКАЛЬНЫЙ МЕЖКРОЙНЫЙ РЕЗ
  //     между соседними заказами в одной строке
  //     Логика 1:1 с visualizer (группировка по shelf_index,
  //     проверка same_row = abs(a.y - b.y) < 1e-9)
  // ══════════════════════════════════════════
  const byShelf = {};
  layout.forEach(item => {
    const key = `${item.roll_index}_${item.shelf_index}`;
    if (!byShelf[key]) byShelf[key] = [];
    byShelf[key].push(item);
  });

  Object.values(byShelf).forEach(items => {
    items.sort((a, b) => (Math.round(a.y * 1e6) - Math.round(b.y * 1e6)) || (a.x - b.x));

    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];

      if (Math.abs(a.y - b.y) >= 1e-9) continue;  // не одна строка

      const kerfXmm = a.x + a.w;
      const kerfWmm = b.x - kerfXmm;
      const kerfHm  = Math.min(a.l, b.l);

      if (kerfWmm <= 1e-9) continue;

      const kx = cx(kerfXmm);
      const ky = cy(a.y);
      const kw = px(kerfWmm);
      const kh = py(kerfHm);

      ctx.fillStyle   = KERF_COLOR;
      ctx.fillRect(kx, ky, kw, kh);
      ctx.strokeStyle = KERF_EDGE;
      ctx.lineWidth   = 0.5;
      ctx.strokeRect(kx, ky, kw, kh);

      // подпись если рез >= 3 мм
      if (kerfWmm >= 3 && kw > 8) {
        ctx.font      = `${Math.max(6, 6 * scale)}px JetBrains Mono`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${kerfWmm.toFixed(1)}`,
          kx + kw / 2,
          ky + Math.min(py(kerfHm * 0.1), py(1.5)) + Math.max(6, 6 * scale)
        );
      }
    }
  });

  // ══════════════════════════════════════════
  //  7. ПУСТОТЫ  (gaps)
  //     facecolor=GAP_COLOR, edgecolor="#1F618D", alpha=0.30
  // ══════════════════════════════════════════
  gaps.forEach(g => {
    const gx = cx(g.x_mm);
    const gy = cy(g.y_m);
    const gw = px(g.width_mm);
    const gh = py(g.height_m);
    if (gw < 1 || gh < 1) return;
    ctx.fillStyle   = hexAlpha(GAP_COLOR, 0.30);
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#1F618D';
    ctx.lineWidth   = 0.7;
    ctx.strokeRect(gx, gy, gw, gh);
  });

  // ══════════════════════════════════════════
  //  8. ЛИНЕЙКИ (поверх всего)
  // ══════════════════════════════════════════
  // верхняя (ширина, мм)
  ctx.fillStyle = 'rgba(15,16,18,0.94)';
  ctx.fillRect(0, 0, W, RULER_H);
  ctx.font = `${Math.max(8, 8.5 * scale)}px JetBrains Mono`;
  ctx.textAlign = 'center';
  for (let x = 0; x <= BOBBIN_W; x += 200) {
    const px2 = OX + px(x);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(px2, RULER_H - 4, 1, 4);
    if (x % 400 === 0 || x === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.fillText(x, px2, 12);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.font = `${Math.max(7, 7 * scale)}px JetBrains Mono`;
  ctx.textAlign = 'right';
  ctx.fillText('мм', OX + px(BOBBIN_W) + 20, 11);

  // левая (длина, м)
  ctx.fillStyle = 'rgba(15,16,18,0.94)';
  ctx.fillRect(0, RULER_H, RULER_W, H - RULER_H);
  ctx.font = `${Math.max(7, 7.5 * scale)}px JetBrains Mono`;
  ctx.textAlign = 'right';
  for (let y = 0; y <= totalLen; y += 100) {
    const py2 = OY + py(y);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(RULER_W - 4, py2, 4, 1);
    if (y % 200 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.fillText(y + 'м', RULER_W - 6, py2 + 4);
    }
  }

  // угол (перекрытие)
  ctx.fillStyle = 'rgba(15,16,18,0.94)';
  ctx.fillRect(0, 0, RULER_W, RULER_H);
}

// ═══════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════

// hex-цвет + alpha → rgba строка
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// осветляем цвет для активного элемента
function lighten(hex) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 60);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 60);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 60);
  return `rgb(${r},${g},${b})`;
}
