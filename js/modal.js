'use strict';

// ═══════════════════════════════════════════
//  МОДАЛЬНОЕ ОКНО — ДОБАВЛЕНИЕ ЗАКАЗА
// ═══════════════════════════════════════════
function openModal() {
  document.getElementById('fId').value = 'ORD-' + orderIdCounter;
  document.getElementById('fW').value  = '';
  document.getElementById('fL').value  = '';
  document.getElementById('fQty').value = 1;
  document.getElementById('overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
}

document.getElementById('overlay').onclick = e => {
  if (e.target === e.currentTarget) closeModal();
};

function saveOrder() {
  const id       = document.getElementById('fId').value.trim() || 'ORD-' + orderIdCounter;
  const w        = parseFloat(document.getElementById('fW').value);
  const l        = parseFloat(document.getElementById('fL').value);
  const alloy    = document.getElementById('fAlloy').value;
  const thick    = parseInt(document.getElementById('fThick').value);
  const qty      = parseInt(document.getElementById('fQty').value) || 1;
  const priority = Math.max(1, parseInt(document.getElementById('fPri').value) || 1);

  if (!w || !l || w <= 0 || l <= 0) {
    showToast('Введите корректные размеры', true); return;
  }
  if (w > BOBBIN_W - 2 * EDGE_TRIM) {
    showToast(`Ширина не может превышать ${BOBBIN_W - 2 * EDGE_TRIM} мм`, true); return;
  }

  orders.push({id, w, l, alloy, thick, qty, priority});
  orderIdCounter++;
  renderOrders();
  closeModal();
  showToast(`Заказ ${id} добавлен`);
}
