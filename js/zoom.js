'use strict';

// ═══════════════════════════════════════════
//  МАСШТАБ И ВПИСЫВАНИЕ В ЭКРАН
// ═══════════════════════════════════════════
function zoom(delta) {
  scale = Math.max(0.3, Math.min(4.0, scale + delta));
  document.getElementById('zoomLbl').textContent = Math.round(scale * 100) + '%';
  if (placed) drawCanvas();
}

function fitToView() {
  const wrap = document.getElementById('cwrap');
  if (!placed || !totalLen) return;
  const ww = wrap.clientWidth - 40;
  const wh = wrap.clientHeight - 40;
  const sw = ww / (BOBBIN_W * PX_PER_MM);
  const sh = wh / (totalLen  * PX_PER_M);
  scale = Math.min(sw, sh, 3.0);
  document.getElementById('zoomLbl').textContent = Math.round(scale * 100) + '%';
  drawCanvas();
}

function resetZoom() {
  scale = 1;
  document.getElementById('zoomLbl').textContent = '100%';
  if (placed) drawCanvas();
}

// ═══════════════════════════════════════════
//  ЗOOM КОЛЕСОМ МЫШИ (к позиции курсора)
// ═══════════════════════════════════════════
function onWheelZoom(e) {
  e.preventDefault();
  const wrap = document.getElementById('cwrap');
  const rect  = wrap.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const oldScale = scale;
  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  const newScale = Math.max(0.3, Math.min(4.0, scale + delta));
  if (newScale === oldScale) return;

  // Сохраняем точку под курсором
  const pointX = wrap.scrollLeft + mouseX;
  const pointY = wrap.scrollTop  + mouseY;

  scale = newScale;
  document.getElementById('zoomLbl').textContent = Math.round(scale * 100) + '%';
  if (placed) drawCanvas();

  // Корректируем скролл так, чтобы та же точка осталась под курсором
  wrap.scrollLeft = pointX * (newScale / oldScale) - mouseX;
  wrap.scrollTop  = pointY * (newScale / oldScale) - mouseY;
}

// ═══════════════════════════════════════════
//  ПЕРЕМЕЩЕНИЕ ХОЛСТА ЗАЖАТОЙ ЛКМ
// ═══════════════════════════════════════════
const _drag = {active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0};

function onDragStart(e) {
  if (e.button !== 0) return;
  const wrap = document.getElementById('cwrap');
  _drag.active  = true;
  _drag.startX  = e.clientX;
  _drag.startY  = e.clientY;
  _drag.scrollX = wrap.scrollLeft;
  _drag.scrollY = wrap.scrollTop;
  wrap.style.cursor = 'grabbing';
  e.preventDefault();
}

function onDragMove(e) {
  if (!_drag.active) return;
  const wrap = document.getElementById('cwrap');
  wrap.scrollLeft = _drag.scrollX - (e.clientX - _drag.startX);
  wrap.scrollTop  = _drag.scrollY - (e.clientY - _drag.startY);
}

function onDragEnd() {
  if (!_drag.active) return;
  _drag.active = false;
  document.getElementById('cwrap').style.cursor = 'grab';
}

// ── Подключаем события после загрузки DOM ──
const _cwrap = document.getElementById('cwrap');
_cwrap.addEventListener('wheel',     onWheelZoom, {passive: false});
_cwrap.addEventListener('mousedown', onDragStart);
window.addEventListener('mousemove', onDragMove);
window.addEventListener('mouseup',   onDragEnd);
