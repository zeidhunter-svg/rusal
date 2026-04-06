'use strict';

// ═══════════════════════════════════════════
//  ТОСТ-УВЕДОМЛЕНИЯ
// ═══════════════════════════════════════════
let toastTimer = null;
function showToast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderColor = err ? 'rgba(240,80,74,.4)' : 'var(--borderB)';
  t.style.color       = err ? 'var(--red)' : 'var(--text)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ═══════════════════════════════════════════
//  ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ═══════════════════════════════════════════
function switchTab(tab, el) {
  document.querySelectorAll('.hdr-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  if (tab !== 'layout') showToast('Раздел «' + el.textContent + '» — в разработке');
}

// ═══════════════════════════════════════════
//  ГОРЯЧИЕ КЛАВИШИ
// ═══════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === '+' || e.key === '=') zoom(+0.25);
  if (e.key === '-')                  zoom(-0.25);
  if (e.key === '0')                  fitToView();
  if (e.key === 'Enter' && !document.getElementById('overlay').classList.contains('open')) runOptimization();
  if (e.key === 'Escape')             closeModal();
});

// ═══════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════
(function init() {
  // Таблица справочника реза
  const tb = document.getElementById('refBody');
  tb.innerHTML = REF_CUTS.map(r => `<tr><td>${r.alloy}</td><td>${r.thick}</td><td>${r.cut}</td></tr>`).join('');

  renderOrders();

  // Показываем пустой экран канваса
  document.getElementById('canvas').style.display    = 'none';
  document.getElementById('emptyCanvas').style.display = 'flex';
})();
