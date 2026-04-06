'use strict';

// ═══════════════════════════════════════════
//  ЭКСПОРТ JSON
// ═══════════════════════════════════════════
function copyJSON() {
  if (!window._jsonStr) { showToast('Сначала запустите расчёт', true); return; }
  navigator.clipboard.writeText(window._jsonStr).then(() => {
    showToast('JSON скопирован в буфер обмена');
  });
}

function downloadJSON() {
  if (!window._jsonStr) { showToast('Сначала запустите расчёт', true); return; }
  const blob = new Blob([window._jsonStr], {type: 'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cutflow_run_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON файл скачан');
}

async function downloadPNG() {
  if (!pyResult) { showToast('Сначала запустите расчёт', true); return; }
  const rolls = pyResult.rolls;
  showToast(rolls.length > 1 ? `Скачиваем PNG (${rolls.length} рулона)…` : 'Скачиваем PNG…');
  for (const roll of rolls) {
    try {
      const res = await fetch(`/api/visualize/${roll.roll_index}`);
      if (!res.ok) { showToast('Ошибка генерации PNG', true); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `cutflow_roll${roll.roll_index}_${roll.source_material.alloy}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Ошибка загрузки PNG', true); return;
    }
  }
  showToast(rolls.length > 1 ? `PNG скачан (${rolls.length} рулона)` : 'PNG скачан');
}
