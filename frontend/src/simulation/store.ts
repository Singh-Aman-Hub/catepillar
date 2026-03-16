import { create } from 'zustand';
import { GridCell, Zone, Truck, SimMetrics, Point, TruckState } from './types';
import { DEFAULT_CONFIG, ZONE_COLORS, ZONE_BORDER_COLORS, TRUCK_COLORS, ENTRY_POINT } from './config';
import { playDumpSound } from './sounds';
import { Particle, createDumpParticles, updateParticles } from './particles';

interface SimulationState {
  // State
  running: boolean;
  speed: number;
  viewMode: '2d' | '3d';
  showHeatmap: boolean;
  tick: number;

  // Data
  grid: GridCell[][];
  zones: Zone[];
  trucks: Truck[];
  metrics: SimMetrics;
  particles: Particle[];
  currentZoneIndex: number; // which zone is being filled

  // Actions
  init: () => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setSpeed: (s: number) => void;
  setViewMode: (m: '2d' | '3d') => void;
  toggleHeatmap: () => void;
  step: () => void;
}

function createGrid(): GridCell[][] {
  const { gridRows, gridCols, yardPadding } = DEFAULT_CONFIG;
  const cellW = (DEFAULT_CONFIG.yardWidth - yardPadding * 2) / gridCols;
  const cellH = (DEFAULT_CONFIG.yardHeight - yardPadding * 2) / gridRows;

  const grid: GridCell[][] = [];
  for (let r = 0; r < gridRows; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < gridCols; c++) {
      row.push({
        row: r,
        col: c,
        x: yardPadding + c * cellW + cellW / 2,
        y: yardPadding + r * cellH + cellH / 2,
        height: 0,
        filled: false,
        zoneId: -1,
      });
    }
    grid.push(row);
  }
  return grid;
}

function assignZones(grid: GridCell[][]): Zone[] {
  const { numZones, gridRows, gridCols } = DEFAULT_CONFIG;
  const zones: Zone[] = [];

  // Fixed grid split into zones
  const zoneCols = Math.ceil(Math.sqrt(numZones));
  const zoneRows = Math.ceil(numZones / zoneCols);

  for (let z = 0; z < numZones; z++) {
    zones.push({
      id: z,
      center: { x: 0, y: 0 },
      color: ZONE_COLORS[z % ZONE_COLORS.length],
      cells: [],
      dumpCount: 0,
    });
  }

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const zr = Math.min(Math.floor(r / (gridRows / zoneRows)), zoneRows - 1);
      const zc = Math.min(Math.floor(c / (gridCols / zoneCols)), zoneCols - 1);
      const zoneId = Math.min(zr * zoneCols + zc, numZones - 1);
      grid[r][c].zoneId = zoneId;
      zones[zoneId].cells.push(grid[r][c]);
    }
  }

  // Compute centers
  for (const z of zones) {
    if (z.cells.length > 0) {
      z.center = {
        x: z.cells.reduce((s, c) => s + c.x, 0) / z.cells.length,
        y: z.cells.reduce((s, c) => s + c.y, 0) / z.cells.length,
      };
    }
  }

  return zones;
}

function createTrucks(zones: Zone[]): Truck[] {
  const trucks: Truck[] = [];
  for (let i = 0; i < DEFAULT_CONFIG.numTrucks; i++) {
    const zoneId = i % zones.length;
    trucks.push({
      id: i,
      label: `TRK-${String(i + 1).padStart(2, '0')}`,
      x: ENTRY_POINT.x,
      y: ENTRY_POINT.y + (i - DEFAULT_CONFIG.numTrucks / 2) * 18,
      targetX: ENTRY_POINT.x,
      targetY: ENTRY_POINT.y,
      speed: DEFAULT_CONFIG.truckSpeed + (Math.random() - 0.5) * 0.5,
      state: 'idle',
      assignedZone: zoneId,
      dumpCount: 0,
      targetCell: null,
      path: [],
      waitTimer: 0,
      dumpTimer: 0,
      color: TRUCK_COLORS[i % TRUCK_COLORS.length],
    });
  }
  return trucks;
}

function cornerDistanceSort(cells: GridCell[]): GridCell[] {
  // Sort cells so corners come first, then edges, then interior (spiral inward)
  if (cells.length === 0) return [];
  const minR = Math.min(...cells.map(c => c.row));
  const maxR = Math.max(...cells.map(c => c.row));
  const minC = Math.min(...cells.map(c => c.col));
  const maxC = Math.max(...cells.map(c => c.col));
  const centerR = (minR + maxR) / 2;
  const centerC = (minC + maxC) / 2;

  // Distance from center (higher = more corner-like)
  return [...cells].sort((a, b) => {
    const distA = Math.abs(a.row - centerR) + Math.abs(a.col - centerC);
    const distB = Math.abs(b.row - centerR) + Math.abs(b.col - centerC);
    return distB - distA; // corners first (farthest from center)
  });
}

function findNextDumpCell(zone: Zone, grid: GridCell[][]): GridCell | null {
  // Corner-first: sort cells by distance from zone center (corners first)
  const sorted = cornerDistanceSort(zone.cells);
  for (const cell of sorted) {
    const gc = grid[cell.row][cell.col];
    if (!gc.filled && gc.height < 5) return gc;
  }
  return null;
}

function isZoneComplete(zone: Zone, grid: GridCell[][]): boolean {
  return zone.cells.every(c => grid[c.row][c.col].filled || grid[c.row][c.col].height >= 5);
}

function isCellOccupied(trucks: Truck[], cell: { row: number; col: number }, excludeId: number): boolean {
  return trucks.some(t =>
    t.id !== excludeId &&
    t.targetCell &&
    t.targetCell.row === cell.row &&
    t.targetCell.col === cell.col &&
    (t.state === 'moving_to_dump' || t.state === 'dumping')
  );
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function moveToward(truck: Truck, tx: number, ty: number, speed: number): boolean {
  const dx = tx - truck.x;
  const dy = ty - truck.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < speed) {
    truck.x = tx;
    truck.y = ty;
    return true;
  }
  truck.x += (dx / dist) * speed;
  truck.y += (dy / dist) * speed;
  return false;
}

function checkTruckCollision(truck: Truck, trucks: Truck[]): boolean {
  for (const other of trucks) {
    if (other.id === truck.id) continue;
    if (other.state === 'idle') continue;
    const d = distance(truck, other);
    if (d < 20) return true; // increased safe distance
  }
  return false;
}

// Steer around nearby trucks instead of just stopping
function avoidanceSteering(truck: Truck, trucks: Truck[]): { vx: number; vy: number } {
  let avoidX = 0;
  let avoidY = 0;
  for (const other of trucks) {
    if (other.id === truck.id || other.state === 'idle') continue;
    const dx = truck.x - other.x;
    const dy = truck.y - other.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 30 && d > 0) {
      const force = (30 - d) / 30;
      avoidX += (dx / d) * force * 1.5;
      avoidY += (dy / d) * force * 1.5;
    }
  }
  return { vx: avoidX, vy: avoidY };
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  running: false,
  speed: 1,
  viewMode: '2d',
  showHeatmap: false,
  tick: 0,
  grid: [],
  zones: [],
  trucks: [],
  particles: [],
  currentZoneIndex: 0,
  metrics: {
    totalDumps: 0,
    missedDumps: 0,
    avgSpacing: 1.0,
    packingDensity: 0,
    densityHistory: [],
    zoneDumps: [],
    timeSteps: 0,
  },

  init: () => {
    const grid = createGrid();
    const zones = assignZones(grid);
    const trucks = createTrucks(zones);
    set({
      grid,
      zones,
      trucks,
      particles: [],
      currentZoneIndex: 0,
      tick: 0,
      running: false,
      metrics: {
        totalDumps: 0,
        missedDumps: 0,
        avgSpacing: 1.0,
        packingDensity: 0,
        densityHistory: [0],
        zoneDumps: zones.map(() => 0),
        timeSteps: 0,
      },
    });
  },

  start: () => set({ running: true }),
  pause: () => set({ running: false }),
  reset: () => {
    get().init();
  },
  setSpeed: (s) => set({ speed: s }),
  setViewMode: (m) => set({ viewMode: m }),
  toggleHeatmap: () => set(s => ({ showHeatmap: !s.showHeatmap })),

  step: () => {
    const state = get();
    if (!state.running) return;

    const { grid, zones, trucks, metrics, speed, particles, currentZoneIndex } = state;
    const newTrucks = trucks.map(t => ({ ...t }));
    let newDumps = 0;
    let missedThisStep = 0;
    let newParticles = updateParticles([...particles]);
    let zoneIdx = currentZoneIndex;

    // Determine active zone - complete one zone before moving to next
    const activeZone = zones[zoneIdx];
    if (activeZone && isZoneComplete(activeZone, grid)) {
      zoneIdx = Math.min(zoneIdx + 1, zones.length - 1);
    }

    for (const truck of newTrucks) {
      const effectiveSpeed = truck.speed * speed;

      switch (truck.state) {
        case 'idle': {
          // All trucks focus on current zone first
          const primaryZone = zones[zoneIdx];
          let cell = findNextDumpCell(primaryZone, grid);
          
          if (!cell) {
            // Current zone is done, try others
            let found = false;
            for (let zi = 0; zi < zones.length; zi++) {
              const z = zones[zi];
              const c = findNextDumpCell(z, grid);
              if (c && !isCellOccupied(newTrucks, c, truck.id)) {
                truck.targetCell = { row: c.row, col: c.col };
                truck.targetX = c.x;
                truck.targetY = c.y;
                truck.state = 'moving_to_dump';
                truck.path = [{ x: truck.x, y: truck.y }, { x: c.x, y: c.y }];
                found = true;
                break;
              }
            }
            if (!found) missedThisStep++;
            break;
          }
          
          if (isCellOccupied(newTrucks, cell, truck.id)) {
            const sorted = cornerDistanceSort(primaryZone.cells);
            const altCells = sorted.filter(c => !grid[c.row][c.col].filled && grid[c.row][c.col].height < 5 && !isCellOccupied(newTrucks, c, truck.id));
            if (altCells.length > 0) {
              const alt = altCells[0];
              truck.targetCell = { row: alt.row, col: alt.col };
              truck.targetX = alt.x;
              truck.targetY = alt.y;
              truck.state = 'moving_to_dump';
              truck.path = [{ x: truck.x, y: truck.y }, { x: alt.x, y: alt.y }];
            } else {
              truck.waitTimer = 10;
              truck.state = 'waiting';
            }
            break;
          }
          truck.targetCell = { row: cell.row, col: cell.col };
          truck.targetX = cell.x;
          truck.targetY = cell.y;
          truck.state = 'moving_to_dump';
          truck.path = [{ x: truck.x, y: truck.y }, { x: cell.x, y: cell.y }];
          break;
        }

        case 'moving_to_dump': {
          // Apply avoidance steering instead of hard stop
          const avoid = avoidanceSteering(truck, newTrucks);
          const tooClose = checkTruckCollision(truck, newTrucks);
          
          if (tooClose && (Math.abs(avoid.vx) > 0.1 || Math.abs(avoid.vy) > 0.1)) {
            // Steer around
            truck.x += avoid.vx * 0.8;
            truck.y += avoid.vy * 0.8;
            // Still try to move toward target
            moveToward(truck, truck.targetX, truck.targetY, effectiveSpeed * 0.3);
          } else if (tooClose) {
            truck.state = 'waiting';
            truck.waitTimer = 5;
            break;
          } else {
            const arrived = moveToward(truck, truck.targetX, truck.targetY, effectiveSpeed);
            if (arrived) {
              truck.state = 'dumping';
              truck.dumpTimer = DEFAULT_CONFIG.dumpDuration;
            }
          }
          break;
        }

        case 'dumping': {
          truck.dumpTimer -= speed;
          if (truck.dumpTimer <= 0) {
            if (truck.targetCell) {
              const cell = grid[truck.targetCell.row][truck.targetCell.col];
              cell.height = Math.min(cell.height + 1, 5);
              if (cell.height >= 3) cell.filled = true;
              truck.dumpCount++;
              newDumps++;
              zones[truck.assignedZone].dumpCount++;
              
              // Spawn particles at dump location
              newParticles.push(...createDumpParticles(truck.x, truck.y));
              
              // Play sound
              playDumpSound();
            }
            truck.state = 'returning';
            truck.targetX = ENTRY_POINT.x;
            truck.targetY = ENTRY_POINT.y + (truck.id - DEFAULT_CONFIG.numTrucks / 2) * 18;
            truck.path = [{ x: truck.x, y: truck.y }, { x: truck.targetX, y: truck.targetY }];
            truck.targetCell = null;
          }
          break;
        }

        case 'returning': {
          // Apply avoidance while returning too
          const avoid = avoidanceSteering(truck, newTrucks);
          if (Math.abs(avoid.vx) > 0.1 || Math.abs(avoid.vy) > 0.1) {
            truck.x += avoid.vx * 0.5;
            truck.y += avoid.vy * 0.5;
          }
          const arrived = moveToward(truck, truck.targetX, truck.targetY, effectiveSpeed * 1.2);
          if (arrived) {
            truck.state = 'idle';
            truck.path = [];
          }
          break;
        }

        case 'waiting': {
          truck.waitTimer -= speed;
          if (truck.waitTimer <= 0) {
            truck.state = 'idle';
          }
          break;
        }
      }
    }

    // Compute metrics
    const totalCells = grid.flat().length;
    const filledCells = grid.flat().filter(c => c.height > 0).length;
    const density = totalCells > 0 ? (filledCells / totalCells) * 100 : 0;
    const newMetrics: SimMetrics = {
      totalDumps: metrics.totalDumps + newDumps,
      missedDumps: metrics.missedDumps + missedThisStep,
      avgSpacing: 1.0,
      packingDensity: Math.round(density * 10) / 10,
      densityHistory: [...metrics.densityHistory, Math.round(density * 10) / 10].slice(-60),
      zoneDumps: zones.map(z => z.dumpCount),
      timeSteps: metrics.timeSteps + 1,
    };

    set({
      trucks: newTrucks,
      grid: [...grid],
      metrics: newMetrics,
      tick: state.tick + 1,
      particles: newParticles,
      currentZoneIndex: zoneIdx,
    });
  },
}));
