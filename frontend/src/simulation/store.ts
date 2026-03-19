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

  // Custom Yard Drawing
  isDrawing: boolean;
  polygonVertices: Point[];
  settingEntryPoint: boolean;
  entryPoint: Point | null;
  yardPolygon: Point[];

  // Data
  grid: GridCell[][];
  zones: Zone[];
  trucks: Truck[];
  metrics: SimMetrics;
  particles: Particle[];
  currentZoneIndex: number; // which zone is being filled

  // Actions
  init: () => Promise<void>;
  start: () => void;
  pause: () => void;
  reset: () => Promise<void>;
  setSpeed: (s: number) => void;
  setViewMode: (m: '2d' | '3d') => void;
  toggleHeatmap: () => void;
  step: () => void;
  
  // Custom Yard Actions
  addPolygonVertex: (p: Point) => void;
  finishPolygon: () => void;
  setEntryPointMode: () => void;
  setEntryPoint: (p: Point) => void;
  resetDrawing: () => void;
  startDrawingMode: () => void;
  submitCustomYard: () => Promise<void>;
}

const API_BASE = 'http://localhost:8000/api';

async function registerZoneWithBackend(zone: Zone, grid: GridCell[][]) {
  try {
    const minR = Math.min(...zone.cells.map(c => c.row));
    const maxR = Math.max(...zone.cells.map(c => c.row));
    const minC = Math.min(...zone.cells.map(c => c.col));
    const maxC = Math.max(...zone.cells.map(c => c.col));
    
    // Create polygon defining boundaries (extend out to cover whole cells)
    const cellW = (DEFAULT_CONFIG.yardWidth - DEFAULT_CONFIG.yardPadding * 2) / DEFAULT_CONFIG.gridCols;
    const cellH = (DEFAULT_CONFIG.yardHeight - DEFAULT_CONFIG.yardPadding * 2) / DEFAULT_CONFIG.gridRows;

    const p1 = grid[minR][minC];
    const p3 = grid[maxR][maxC];
    
    const polygon = [
      { x: p1.x - cellW/2, y: p1.y - cellH/2 },      // Top-Left
      { x: p3.x + cellW/2, y: p1.y - cellH/2 },      // Top-Right
      { x: p3.x + cellW/2, y: p3.y + cellH/2 },      // Bottom-Right
      { x: p1.x - cellW/2, y: p3.y + cellH/2 }       // Bottom-Left
    ];

    await fetch(`${API_BASE}/zones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `zone_${zone.id}`, polygon })
    });
  } catch (e) { console.error('Error registering zone', e); }
}

async function registerTruckWithBackend(truck: Truck) {
  try {
    await fetch(`${API_BASE}/trucks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: truck.id.toString(),
        type: 'large',
        payload_capacity: 100,
        turn_radius: 5,
        width: 4,
        length: 8,
        dump_radius: Math.max((DEFAULT_CONFIG.yardWidth / DEFAULT_CONFIG.gridCols) * 0.5, 4), // 1/2 grid size safely
        position: { x: truck.x, y: truck.y },
        status: 'IDLE'
      })
    });
  } catch (e) { console.error('Error registering truck', e); }
}

let isRequestingLock = new Set<number>();

async function requestDump(truckId: number, currentX: number, currentY: number, zoneId: number) {
  if (isRequestingLock.has(truckId)) return;
  isRequestingLock.add(truckId);
  const zoneName = `zone_${zoneId}`;
  try {
    const res = await fetch(`${API_BASE}/assign_dump?zone_name=${zoneName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        truck_id: truckId.toString(),
        current_position: { x: currentX, y: currentY }
      })
    });
    
    if (!res.ok) {
      // Backend rejected (zone full or error) -> Wait and retry
      useSimulationStore.setState(state => {
        const newTrucks = [...state.trucks];
        const t = newTrucks.find(t => t.id === truckId);
        if (t) {
          t.state = 'waiting';
          t.waitTimer = 60; // Wait 1 second (at 60fps) before trying again
        }
        return { trucks: newTrucks };
      });
      isRequestingLock.delete(truckId);
      return;
    }

    const data = await res.json();
    useSimulationStore.setState(state => {
      const newTrucks = [...state.trucks];
      const t = newTrucks.find(t => t.id === truckId);
      if (t) {
        t.path = data.route;
        t.pathIndex = 0;
        t.targetX = data.assigned_spot.x;
        t.targetY = data.assigned_spot.y;
        
        // Find nearest cell in grid to mark it visually
        let minDist = Infinity;
        let closestCell = state.grid[0][0];
        for (let r=0; r<state.grid.length; r++) {
          for(let c=0; c<state.grid[r].length; c++) {
            const cell = state.grid[r][c];
            const d = Math.sqrt((cell.x - data.assigned_spot.x)**2 + (cell.y - data.assigned_spot.y)**2);
            if (d < minDist) { minDist = d; closestCell = cell; }
          }
        }
        t.targetCell = { row: closestCell.row, col: closestCell.col };
        t.state = 'moving_to_dump';
      }
      return { trucks: newTrucks };
    });
  } catch (e) {
      console.error('Error requesting dump from API', e);
      useSimulationStore.setState(state => {
        const newTrucks = [...state.trucks];
        const t = newTrucks.find(t => t.id === truckId);
        if (t) { t.state = 'waiting'; t.waitTimer = 60; }
        return { trucks: newTrucks };
      });
  }
  isRequestingLock.delete(truckId);
}

async function finishDumpAndReturn(truckId: number, zoneId: number, currentX: number, currentY: number, ep: Point) {
  if (isRequestingLock.has(truckId)) return;
  isRequestingLock.add(truckId);
  try {
    await fetch(`${API_BASE}/complete_dump?truck_id=${truckId}&zone_name=zone_${zoneId}`, {
      method: 'POST'
    });
    
    const zoneName = `zone_${zoneId}`;
    const res = await fetch(`${API_BASE}/return_route?zone_name=${zoneName}&entry_x=${ep.x}&entry_y=${ep.y}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        truck_id: truckId.toString(),
        current_position: { x: currentX, y: currentY }
      })
    });
    
    if (res.ok) {
       const route = await res.json();
       useSimulationStore.setState(state => {
         const newTrucks = [...state.trucks];
         const t = newTrucks.find(trk => trk.id === truckId);
         if (t) {
            t.path = route;
            t.pathIndex = 0;
            t.state = 'returning';
         }
         return { trucks: newTrucks };
       });
    } else {
       useSimulationStore.setState(state => {
         const newTrucks = [...state.trucks];
         const t = newTrucks.find(trk => trk.id === truckId);
         if (t) { t.path = [ep]; t.pathIndex = 0; t.state = 'returning'; }
         return { trucks: newTrucks };
       });
    }
  } catch (e) {
      console.error('Error in finishDumpAndReturn', e);
      useSimulationStore.setState(state => {
         const newTrucks = [...state.trucks];
         const t = newTrucks.find(trk => trk.id === truckId);
         if (t) { t.path = [ep]; t.pathIndex = 0; t.state = 'returning'; }
         return { trucks: newTrucks };
       });
  }
  isRequestingLock.delete(truckId);
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

function createTrucks(zones: Zone[], ePoint: Point = ENTRY_POINT): Truck[] {
  const trucks: Truck[] = [];
  for (let i = 0; i < DEFAULT_CONFIG.numTrucks; i++) {
    const zoneId = i % zones.length;
    trucks.push({
      id: i,
      label: `TRK-${String(i + 1).padStart(2, '0')}`,
      x: ePoint.x,
      y: ePoint.y + (i - DEFAULT_CONFIG.numTrucks / 2) * 18,
      targetX: ePoint.x,
      targetY: ePoint.y,
      speed: DEFAULT_CONFIG.truckSpeed + (Math.random() - 0.5) * 0.5,
      state: 'idle',
      assignedZone: zoneId,
      dumpCount: 0,
      targetCell: null,
      path: null,
      pathIndex: 0,
      zoneName: `zone_${zones[zoneId]?.id ?? zoneId}`,
      waitTimer: 0,
      dumpTimer: 0,
      color: TRUCK_COLORS[i % TRUCK_COLORS.length],
    });
  }
  return trucks;
}

function isZoneComplete(zone: Zone, grid: GridCell[][]): boolean {
  return zone.cells.every(c => grid[c.row][c.col].filled || grid[c.row][c.col].height >= 5);
}

function pointInPolygon(point: Point, vs: Point[]): boolean {
  const x = point.x;
  const y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
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

function avoidCollisions(truck: Truck, trucks: Truck[]): { vx: number; vy: number } {
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
  
  isDrawing: false,
  polygonVertices: [],
  settingEntryPoint: false,
  entryPoint: null,
  yardPolygon: [],
  metrics: {
    totalDumps: 0,
    missedDumps: 0,
    avgSpacing: 1.0,
    packingDensity: 0,
    densityHistory: [],
    zoneDumps: [],
    timeSteps: 0,
  },

  init: async () => {
    isRequestingLock.clear();
    const state = get();
    let grid = createGrid();
    let zones: Zone[] = [];
    let trucks: Truck[] = [];
    
    // If we have a custom yard configured, use backend init
    if (state.yardPolygon.length > 0 && state.entryPoint) {
      try {
        const res = await fetch(`${API_BASE}/init_yard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ polygon: state.yardPolygon, entry_point: state.entryPoint })
        });
        const data = await res.json();
        
        // Parse zones from backend
        // We still need to map the backend zones to our grid cells
        zones = data.zones.map((z: any) => ({
          id: z.id,
          name: z.name,
          center: { x: 0, y: 0 },
          color: z.color,
          cells: [],
          dumpCount: 0,
          polygonPoints: z.polygon
        }));
        
        // Very basic simple mapping of center
        zones.forEach(z => {
          if ((z as any).polygonPoints && (z as any).polygonPoints.length > 0) {
            const pts = (z as any).polygonPoints;
            z.center = {
              x: pts.reduce((sum: number, p: Point) => sum + p.x, 0) / pts.length,
              y: pts.reduce((sum: number, p: Point) => sum + p.y, 0) / pts.length
            };
          }
        });
        
        // Determine which cell belongs to which zone based on center vs cell pos
        for(let r=0; r<grid.length; r++) {
            for(let c=0; c<grid[r].length; c++) {
               const cell = grid[r][c];
               if (state.yardPolygon.length >= 3 && !pointInPolygon(cell, state.yardPolygon)) {
                   cell.zoneId = -1;
                   continue;
               }

               let bestZone = -1;
               let minDist = Infinity;
               for (let z=0; z<zones.length; z++) {
                   const d = distance(cell, zones[z].center);
                   if (d < minDist) { minDist = d; bestZone = z; }
               }
               cell.zoneId = bestZone;
               if (bestZone >= 0) zones[bestZone].cells.push(cell);
            }
        }
        
        trucks = createTrucks(zones, state.entryPoint);
        for(const t of trucks) {
           await registerTruckWithBackend(t);
        }
        
      } catch (e) { console.error('Error initializing custom yard', e); }
    } else {
      // Default initialization
      zones = assignZones(grid);
      trucks = createTrucks(zones);
      try {
        for (const z of zones) { await registerZoneWithBackend(z, grid); }
        for (const t of trucks) { await registerTruckWithBackend(t); }
      } catch(e) { console.error("Could not sync with Backend!", e) }
    }

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
  reset: async () => {
    await get().init();
  },
  setSpeed: (s) => set({ speed: s }),
  setViewMode: (m) => set({ viewMode: m }),
  toggleHeatmap: () => set(s => ({ showHeatmap: !s.showHeatmap })),
  
  startDrawingMode: () => set({ 
    isDrawing: true, 
    polygonVertices: [], 
    yardPolygon: [], 
    settingEntryPoint: false, 
    entryPoint: null, 
    running: false,
    trucks: [],
    zones: [],
    grid: createGrid() // empty grid to start
  }),
  
  addPolygonVertex: (p) => set(state => ({
    polygonVertices: [...state.polygonVertices, p]
  })),
  
  finishPolygon: () => set(state => {
    if (state.polygonVertices.length >= 3) {
      return { isDrawing: false, settingEntryPoint: true, yardPolygon: [...state.polygonVertices] };
    }
    return { isDrawing: false, polygonVertices: [] };
  }),
  
  setEntryPointMode: () => set({ settingEntryPoint: true, running: false }),
  setEntryPoint: (p) => set({ settingEntryPoint: false, entryPoint: p }),
  
  resetDrawing: () => set({ isDrawing: false, settingEntryPoint: false, polygonVertices: [], entryPoint: null, yardPolygon: [] }),
  
  submitCustomYard: async () => {
     await get().init();
  },

  step: () => {
    const state = get();
    if (!state.running) return;

    const { grid, zones, trucks, metrics, speed, particles, currentZoneIndex } = state;
    const newTrucks = trucks.map(t => ({ ...t }));
    let newDumps = 0;
    let missedThisStep = 0;
    let newParticles = updateParticles([...particles]);
    let zoneIdx = currentZoneIndex;

    const activeZone = zones[zoneIdx];
    if (activeZone && isZoneComplete(activeZone, grid)) {
      zoneIdx = Math.min(zoneIdx + 1, zones.length - 1);
    }

    for (const truck of newTrucks) {
      const effectiveSpeed = truck.speed * speed;

      switch (truck.state) {
        case 'idle': {
            truck.state = 'requesting_dump';
            requestDump(truck.id, truck.x, truck.y, truck.assignedZone);
            break;
        }

        case 'requesting_dump': {
            // Waiting for backend API to respond. Do nothing.
            break;
        }

        case 'moving_to_dump': {
            const avoid = avoidCollisions(truck, newTrucks);
            if (Math.abs(avoid.vx) > 0 || Math.abs(avoid.vy) > 0) {
              truck.x += avoid.vx * 0.8;
              truck.y += avoid.vy * 0.8;
            }

            // Follow Backend A* Path
            if (truck.path && truck.pathIndex < truck.path.length) {
              const nextPt = truck.path[truck.pathIndex];
              const arrivedNode = moveToward(truck, nextPt.x, nextPt.y, effectiveSpeed);
              if (arrivedNode) {
                  truck.pathIndex++;
              }
            } else {
              // Path finished or no path
              const arrivedFinal = moveToward(truck, truck.targetX, truck.targetY, effectiveSpeed);
              if (arrivedFinal) {
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
              
              newParticles.push(...createDumpParticles(truck.x, truck.y));
              playDumpSound();
            }
            truck.state = 'requesting_return';
            const ep = state.entryPoint || ENTRY_POINT;
            truck.targetX = ep.x;
            truck.targetY = ep.y + (truck.id - DEFAULT_CONFIG.numTrucks / 2) * 18;
            finishDumpAndReturn(truck.id, truck.assignedZone, truck.x, truck.y, { x: truck.targetX, y: truck.targetY });
            truck.targetCell = null;
          }
          break;
        }

        case 'requesting_return': {
            // Waiting for backend API to respond. Do nothing.
            break;
        }

        case 'returning': {
          const avoid = avoidCollisions(truck, newTrucks);
          if (Math.abs(avoid.vx) > 0 || Math.abs(avoid.vy) > 0) {
            truck.x += avoid.vx * 0.5;
            truck.y += avoid.vy * 0.5;
          }
          const arrived = moveToward(truck, truck.targetX, truck.targetY, effectiveSpeed * 1.2);
          if (arrived) {
            truck.state = 'idle';
            truck.path = null;
            truck.pathIndex = 0;
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
