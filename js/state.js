'use strict';

// ═══════════════════════════════════════════
//  ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ═══════════════════════════════════════════
let orders   = [];   // {id, w, l, alloy, thick, qty, priority}
let layout   = [];   // {id, plate_id, w, l, alloy, thick, priority, type, x, y, shelf_index, roll_index}
let shelves  = [];   // {shelf_index, y_start_m, height_m, inter_cut_mm, edge_trim_mm, roll_index, ...}
let gaps     = [];   // {x_mm, y_m, width_mm, height_m, roll_index}
let pyResult = null; // полный ответ Python API (для экспорта JSON/PNG)
let placed   = false;
let scale    = 1.0;
let totalLen = 0;
let orderIdCounter = 1;
let activeId = null;

// ═══════════════════════════════════════════
//  ДЕМО-ДАННЫЕ (загружаются при старте)
// ═══════════════════════════════════════════
const DEMO = [
  {id:'ORD-7712', w:800, l:450, alloy:'AA8011', thick:15, qty:1, priority:1},
  {id:'ORD-7713', w:530, l:420, alloy:'AA8011', thick:15, qty:2, priority:1},
  {id:'ORD-7714', w:400, l:380, alloy:'AA8011', thick:15, qty:1, priority:1},
  {id:'ORD-9950', w:400, l:120, alloy:'AA8011', thick:15, qty:1, priority:2},
  {id:'ORD-9951', w:320, l:250, alloy:'AA8011', thick:15, qty:1, priority:2},
  {id:'ORD-9952', w:220, l:180, alloy:'AA8011', thick:15, qty:1, priority:2},
];
orders = DEMO.map(o => ({...o}));
orderIdCounter = 9953;
