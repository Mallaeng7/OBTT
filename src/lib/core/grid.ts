const GRID_CELL = 146.25;

function columnLetter(index: number): string {
  let s = '';
  let i = index;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

/** 월드 좌표 → 맵 그리드 (예: "K13") */
export function toGrid(x: number, y: number, mapSize: number): string {
  if (!mapSize || mapSize <= 0) return '?';
  const col = Math.max(0, Math.min(Math.floor(x / GRID_CELL), Math.floor(mapSize / GRID_CELL)));
  const row = Math.max(0, Math.min(Math.floor((mapSize - y) / GRID_CELL), Math.floor(mapSize / GRID_CELL)));
  return `${columnLetter(col)}${row}`;
}
