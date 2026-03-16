export interface Point {
  x: number;
  y: number;
}

export interface GridCell {
  row: number;
  col: number;
  x: number;
  y: number;
  height: number;
  filled: boolean;
  zoneId: number;
}

export interface Zone {
  id: number;
  center: Point;
  color: string;
  cells: GridCell[];
  dumpCount: number;
}

export type TruckState = 'idle' | 'moving_to_dump' | 'dumping' | 'returning' | 'waiting';

export interface Truck {
  id: number;
  label: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  state: TruckState;
  assignedZone: number;
  dumpCount: number;
  targetCell: { row: number; col: number } | null;
  path: Point[];
  waitTimer: number;
  dumpTimer: number;
  color: string;
}

export interface SimMetrics {
  totalDumps: number;
  missedDumps: number;
  avgSpacing: number;
  packingDensity: number;
  densityHistory: number[];
  zoneDumps: number[];
  timeSteps: number;
}

export interface SimConfig {
  gridRows: number;
  gridCols: number;
  cellSize: number;
  numTrucks: number;
  numZones: number;
  truckSpeed: number;
  dumpDuration: number;
  yardWidth: number;
  yardHeight: number;
  yardPadding: number;
}
