'use strict';

// ═══════════════════════════════════════════
//  РЕНДЕР СПИСКА ЗАКАЗОВ
// ═══════════════════════════════════════════
function renderOrders() {
  const list = document.getElementById('ordersList');
  document.getElementById('orderCount').textContent = orders.length;

  if (!orders.length) {
    list.innerHTML = '<div class="no-orders">Нет заказов.<br>Загрузите файл или добавьте вручную.</div>';
    return;
  }

  list.innerHTML = '';
  orders.forEach((o, i) => {
    const div = document.createElement('div');
    div.className = `ocard ${o.priority === 1 ? 'p1' : 'p2'}${activeId === o.id ? ' sel' : ''}`;
    div.style.animationDelay = (i * 0.04) + 's';
    div.innerHTML = `
      <div class="ocard-top">
        <span class="ocard-id">${o.id}</span>
        <span class="badge ${o.priority === 1 ? 'b1' : 'b2'}">Очередь ${o.priority}</span>
      </div>
      <div class="ocard-dims">${o.w}мм × ${o.l}м × ${o.qty}шт</div>
      <div class="ocard-tags">
        <span class="tag">${o.alloy}</span>
        <span class="tag">${o.thick}мкм</span>
        <span class="tag">${((o.w / 1000) * o.l * o.qty).toFixed(1)}м²</span>
      </div>
      <button class="ocard-del" onclick="deleteOrder('${o.id}', event)">✕</button>`;
    div.onclick = () => {
      activeId = activeId === o.id ? null : o.id;
      renderOrders();
      if (placed) drawCanvas();
    };
    list.appendChild(div);
  });
}

function deleteOrder(id, e) {
  e.stopPropagation();
  orders = orders.filter(o => o.id !== id);
  if (activeId === id) activeId = null;
  renderOrders();
  if (placed) { layout = layout.filter(l => l.id !== id); drawCanvas(); updateMetrics(); }
}
