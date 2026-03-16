import { SimConfig } from './types';

export const DEFAULT_CONFIG: SimConfig = {
  gridRows: 20,
  gridCols: 30,
  cellSize: 24,
  numTrucks: 8,
  numZones: 4,
  truckSpeed: 2.5,
  dumpDuration: 30,
  yardWidth: 720,
  yardHeight: 480,
  yardPadding: 40,
};

export const ZONE_COLORS = [
  'hsla(48, 96%, 53%, 0.15)',
  'hsla(160, 84%, 39%, 0.15)',
  'hsla(199, 89%, 48%, 0.15)',
  'hsla(280, 67%, 55%, 0.15)',
  'hsla(20, 90%, 50%, 0.15)',
  'hsla(340, 80%, 50%, 0.15)',
];

export const ZONE_BORDER_COLORS = [
  'hsla(48, 96%, 53%, 0.6)',
  'hsla(160, 84%, 39%, 0.6)',
  'hsla(199, 89%, 48%, 0.6)',
  'hsla(280, 67%, 55%, 0.6)',
  'hsla(20, 90%, 50%, 0.6)',
  'hsla(340, 80%, 50%, 0.6)',
];

export const TRUCK_COLORS = [
  '#FACC15', '#F59E0B', '#EAB308', '#D97706',
  '#FCD34D', '#FDE68A', '#F59E0B', '#CA8A04',
];

export const ENTRY_POINT = { x: 20, y: 240 };

// Polygon boundary for the dump yard (relative to canvas)
export const YARD_POLYGON: { x: number; y: number }[] = [
  { x: 60, y: 30 },
  { x: 700, y: 30 },
  { x: 710, y: 60 },
  { x: 710, y: 420 },
  { x: 700, y: 450 },
  { x: 60, y: 450 },
  { x: 50, y: 420 },
  { x: 50, y: 60 },
];
