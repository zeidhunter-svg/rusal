'use strict';

// ═══════════════════════════════════════════
//  ТУЛТИП И КООРДИНАТНАЯ СТРОКА
// ═══════════════════════════════════════════
function onCanvasMove(e) {
  const canvas = document.getElementById('canvas');
  if (!placed || canvas.style.display === 'none') return;

  const rect = canvas.getBoundingClientRect();
  const rx = e.clientX - rect.left;
  const ry = e.clientY - rect.top;
  const mmX = Math.round((rx - RULER_W) / PX_PER_MM / scale);
  const mY  = ((ry - RULER_H) / PX_PER_M / scale).toFixed(1);

  document.getElementById('cbX').textContent = mmX >= 0 && mmX <= BOBBIN_W ? mmX + 'мм' : '—';
  document.getElementById('cbY').textContent = mY >= 0 ? mY + 'м' : '—';

  const hit = layout.find(item => {
    const ix = RULER_W + px(item.x), iy = RULER_H + py(item.y);
    const iw = px(item.w),           ih = py(item.l);
    return rx >= ix && rx <= ix + iw && ry >= iy && ry <= iy + ih;
  });

  const tt = document.getElementById('tt');
  if (hit) {
    tt.classList.remove('hide');
    tt.style.left = (e.clientX + 15) + 'px';
    tt.style.top  = (e.clientY - 8) + 'px';
    const cut = getInterCut(hit.alloy, hit.thick);
    tt.innerHTML = `
      <div class="tt-id">${hit.id}</div>
      <div class="tt-row"><span class="tt-k">Очередь</span><span class="tt-v">${hit.priority}${hit.priority === 1 ? ' (основной)' : ' (спутник)'}</span></div>
      <div class="tt-row"><span class="tt-k">Ширина</span><span class="tt-v">${hit.w} мм</span></div>
      <div class="tt-row"><span class="tt-k">Длина</span><span class="tt-v">${hit.l} м</span></div>
      <div class="tt-row"><span class="tt-k">Площадь</span><span class="tt-v">${((hit.w / 1000) * hit.l).toFixed(2)} м²</span></div>
      <div class="tt-row"><span class="tt-k">Сплав</span><span class="tt-v">${hit.alloy} / ${hit.thick}мкм</span></div>
      <div class="tt-row"><span class="tt-k">Межкрой</span><span class="tt-v">${cut} мм</span></div>
      <div class="tt-row"><span class="tt-k">X</span><span class="tt-v">${hit.x} мм</span></div>
      <div class="tt-row"><span class="tt-k">Y</span><span class="tt-v">${hit.y} м</span></div>`;
    document.getElementById('cbHint').innerHTML = `<span style="color:var(--accent)">${hit.id}</span>`;
  } else {
    tt.classList.add('hide');
    document.getElementById('cbHint').innerHTML = '';
  }
}

function onCanvasLeave() {
  document.getElementById('tt').classList.add('hide');
  document.getElementById('cbX').textContent = '—';
  document.getElementById('cbY').textContent = '—';
}
