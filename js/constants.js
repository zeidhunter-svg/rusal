'use strict';

// ═══════════════════════════════════════════
//  ФИЗИЧЕСКИЕ КОНСТАНТЫ БОБИНЫ
// ═══════════════════════════════════════════
const BOBBIN_W   = 1500;   // мм
const BOBBIN_LEN = 10000;  // м
const EDGE_TRIM  = 15;     // мм кромки с каждой стороны

// ═══════════════════════════════════════════
//  СПРАВОЧНИК МЕЖКРОЙНОГО РЕЗА (сплав + толщина → мм)
// ═══════════════════════════════════════════
const REF_CUTS = [
  {alloy:'AA8011',thick:6,cut:3},{alloy:'AA8011',thick:9,cut:4},
  {alloy:'AA8011',thick:12,cut:5},{alloy:'AA8011',thick:15,cut:5},
  {alloy:'AA8011',thick:20,cut:6},{alloy:'AA8011',thick:25,cut:6},
  {alloy:'AA1235',thick:6,cut:3},{alloy:'AA1235',thick:9,cut:4},
  {alloy:'AA1235',thick:12,cut:4},{alloy:'AA1235',thick:15,cut:5},
  {alloy:'AA3003',thick:15,cut:6},{alloy:'AA3003',thick:20,cut:7},
  {alloy:'AA8079',thick:6,cut:3},{alloy:'AA8079',thick:9,cut:4},
];

function getInterCut(alloy, thick) {
  const r = REF_CUTS.find(x => x.alloy === alloy && x.thick === +thick);
  return r ? r.cut : 5;
}
