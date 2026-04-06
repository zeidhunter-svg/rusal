'use strict';

// ═══════════════════════════════════════════
//  ЗАГРУЗКА ФАЙЛОВ (CSV / Excel)
// ═══════════════════════════════════════════
function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, {header: true, skipEmptyLines: true, complete: (r) => ingestCSV(r.data, file.name)});
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, {type: 'binary'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, {defval: ''});
      ingestCSV(data, file.name);
    };
    reader.readAsBinaryString(file);
  } else {
    showToast('Поддерживаются CSV и Excel файлы');
  }
}

function ingestCSV(rows, fname) {
  let added = 0;
  rows.forEach(row => {
    const id    = row['Номер заказа'] || row['id'] || row['ID'] || `ORD-${orderIdCounter++}`;
    const w     = parseFloat(row['Ширина']      || row['w']     || row['width']    || 0);
    const l     = parseFloat(row['Длина']       || row['l']     || row['length']   || 0);
    const alloy = String(row['Сплав']           || row['alloy'] || 'AA8011').trim();
    const thick = parseFloat(row['Толщина']     || row['thick'] || 15);
    const qty   = parseInt(row['Количество']    || row['qty']   || 1);
    const pri   = parseInt(row['Очередность']   || row['priority'] || 1);
    if (w > 0 && l > 0) { orders.push({id, w, l, alloy, thick, qty, priority: pri}); added++; }
  });
  const zone = document.getElementById('dropzone');
  zone.querySelector('.ud-icon').textContent = '✓';
  zone.querySelector('.ud-label').innerHTML =
    `<strong style="color:var(--accent2,#3cf0a0)">${fname}</strong><br>${added} заказов загружено`;
  zone.style.borderColor = 'rgba(61,224,245,.4)';
  renderOrders();
  showToast(`Загружено ${added} заказов из ${fname}`);
}

// ── Drag & drop ──
const dz = document.getElementById('dropzone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) { const inp = dz.querySelector('input'); inp.files = e.dataTransfer.files; handleFile({target: inp}); }
});
