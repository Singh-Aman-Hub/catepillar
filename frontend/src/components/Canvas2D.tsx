import React, { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '@/simulation/store';
import { ZONE_COLORS, ZONE_BORDER_COLORS, YARD_POLYGON, DEFAULT_CONFIG } from '@/simulation/config';
import { drawParticles } from '@/simulation/particles';

const Canvas2D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { grid, zones, trucks, showHeatmap, tick, particles } = useSimulationStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#F9FAFB';
    ctx.fillRect(0, 0, W, H);

    // Yard polygon
    ctx.beginPath();
    ctx.moveTo(YARD_POLYGON[0].x, YARD_POLYGON[0].y);
    for (let i = 1; i < YARD_POLYGON.length; i++) {
      ctx.lineTo(YARD_POLYGON[i].x, YARD_POLYGON[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#D1D5DB';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (grid.length === 0) return;

    const cellW = (DEFAULT_CONFIG.yardWidth - DEFAULT_CONFIG.yardPadding * 2) / DEFAULT_CONFIG.gridCols;
    const cellH = (DEFAULT_CONFIG.yardHeight - DEFAULT_CONFIG.yardPadding * 2) / DEFAULT_CONFIG.gridRows;

    // Draw zone backgrounds
    for (let zoneId = 0; zoneId < zones.length; zoneId++) {
      const zoneCells = grid.flat().filter(c => c.zoneId === zoneId);
      if (zoneCells.length === 0) continue;

      const minR = Math.min(...zoneCells.map(c => c.row));
      const maxR = Math.max(...zoneCells.map(c => c.row));
      const minC = Math.min(...zoneCells.map(c => c.col));
      const maxC = Math.max(...zoneCells.map(c => c.col));

      const x = DEFAULT_CONFIG.yardPadding + minC * cellW;
      const y = DEFAULT_CONFIG.yardPadding + minR * cellH;
      const w = (maxC - minC + 1) * cellW;
      const h = (maxR - minR + 1) * cellH;

      ctx.fillStyle = ZONE_COLORS[zoneId % ZONE_COLORS.length];
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = ZONE_BORDER_COLORS[zoneId % ZONE_BORDER_COLORS.length];
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Zone label
      ctx.fillStyle = '#6B7280';
      ctx.font = '600 10px Inter';
      ctx.fillText(`Zone ${zoneId + 1}`, x + 4, y + 12);
    }

    // Draw grid cells
    for (const row of grid) {
      for (const cell of row) {
        const cx = DEFAULT_CONFIG.yardPadding + cell.col * cellW;
        const cy = DEFAULT_CONFIG.yardPadding + cell.row * cellH;

        if (showHeatmap || cell.height > 0) {
          const t = cell.height / 5;
          const r = Math.round(250 - t * 100);
          const g = Math.round(230 - t * 120);
          const b = Math.round(150 - t * 100);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + t * 0.7})`;
          ctx.fillRect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1);
        }

        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx, cy, cellW, cellH);
      }
    }

    // Draw truck paths
    for (const truck of trucks) {
      if (truck.path.length >= 2 && (truck.state === 'moving_to_dump' || truck.state === 'returning')) {
        ctx.beginPath();
        ctx.moveTo(truck.path[0].x, truck.path[0].y);
        for (let i = 1; i < truck.path.length; i++) {
          ctx.lineTo(truck.path[i].x, truck.path[i].y);
        }
        ctx.strokeStyle = truck.state === 'moving_to_dump' ? 'hsla(48, 96%, 53%, 0.4)' : 'hsla(215, 16%, 47%, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Highlight target cells
    for (const truck of trucks) {
      if (truck.targetCell && truck.state === 'moving_to_dump') {
        const tc = grid[truck.targetCell.row]?.[truck.targetCell.col];
        if (tc) {
          const cx = DEFAULT_CONFIG.yardPadding + tc.col * cellW;
          const cy = DEFAULT_CONFIG.yardPadding + tc.row * cellH;
          ctx.fillStyle = 'hsla(48, 96%, 53%, 0.3)';
          ctx.fillRect(cx, cy, cellW, cellH);
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 2;
          ctx.strokeRect(cx, cy, cellW, cellH);
        }
      }
    }

    // Draw trucks with enhanced visuals
    for (const truck of trucks) {
      const tx = truck.x;
      const ty = truck.y;
      const size = 12;

      ctx.save();

      // Outer glow for active trucks
      if (truck.state === 'moving_to_dump' || truck.state === 'dumping') {
        ctx.shadowColor = truck.state === 'dumping' ? '#10B981' : '#FACC15';
        ctx.shadowBlur = 8;
      }

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.roundRect(tx - size / 2 + 1.5, ty - size / 2 + 1.5, size, size, 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Truck body with gradient
      const bodyGrad = ctx.createLinearGradient(tx - size / 2, ty - size / 2, tx + size / 2, ty + size / 2);
      if (truck.state === 'waiting') {
        bodyGrad.addColorStop(0, '#EF4444');
        bodyGrad.addColorStop(1, '#DC2626');
      } else if (truck.state === 'dumping') {
        bodyGrad.addColorStop(0, '#10B981');
        bodyGrad.addColorStop(1, '#059669');
      } else {
        bodyGrad.addColorStop(0, truck.color);
        bodyGrad.addColorStop(1, '#D97706');
      }
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(tx - size / 2, ty - size / 2, size, size, 2);
      ctx.fill();

      // Truck cabin detail (small rectangle on top)
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(tx - size / 2 + 1, ty - size / 2 + 1, size * 0.4, size * 0.4);

      // Border
      ctx.strokeStyle = '#1F2937';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(tx - size / 2, ty - size / 2, size, size, 2);
      ctx.stroke();

      ctx.restore();

      // Dumping animation - expanding rings
      if (truck.state === 'dumping') {
        for (let ring = 0; ring < 3; ring++) {
          const phase = (tick * 0.15 + ring * 2) % 6;
          const ringSize = size + phase * 4;
          const ringAlpha = Math.max(0, 0.5 - phase * 0.08);
          ctx.strokeStyle = `hsla(160, 84%, 39%, ${ringAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(tx, ty, ringSize / 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        // Dump progress bar
        const progress = 1 - truck.dumpTimer / DEFAULT_CONFIG.dumpDuration;
        const barW = 20;
        const barH = 3;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(tx - barW / 2, ty + size / 2 + 3, barW, barH);
        ctx.fillStyle = '#10B981';
        ctx.fillRect(tx - barW / 2, ty + size / 2 + 3, barW * progress, barH);
      }

      // Waiting animation - pulsing red dot + exclamation
      if (truck.state === 'waiting') {
        const pulse = 0.5 + Math.sin(tick * 0.4) * 0.5;
        ctx.fillStyle = `rgba(239, 68, 68, ${pulse})`;
        ctx.beginPath();
        ctx.arc(tx, ty - size / 2 - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 5px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('!', tx, ty - size / 2 - 4);
      }

      // Direction indicator (small triangle showing heading)
      if (truck.state === 'moving_to_dump' || truck.state === 'returning') {
        const dx = truck.targetX - truck.x;
        const dy = truck.targetY - truck.y;
        const angle = Math.atan2(dy, dx);
        const arrowDist = size / 2 + 4;
        const ax = tx + Math.cos(angle) * arrowDist;
        const ay = ty + Math.sin(angle) * arrowDist;
        ctx.fillStyle = truck.state === 'moving_to_dump' ? '#FACC15' : '#9CA3AF';
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(angle) * 3, ay + Math.sin(angle) * 3);
        ctx.lineTo(ax + Math.cos(angle + 2.3) * 3, ay + Math.sin(angle + 2.3) * 3);
        ctx.lineTo(ax + Math.cos(angle - 2.3) * 3, ay + Math.sin(angle - 2.3) * 3);
        ctx.closePath();
        ctx.fill();
      }

      // Label
      ctx.fillStyle = '#1F2937';
      ctx.font = '600 7px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(truck.label, tx, ty + size / 2 + 12);

      // State label
      const stateLabels: Record<string, string> = {
        moving_to_dump: 'TRANSIT',
        dumping: 'DUMPING',
        returning: 'RETURN',
        waiting: 'WAIT',
        idle: 'IDLE',
      };
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '500 5px JetBrains Mono';
      ctx.fillText(stateLabels[truck.state] || '', tx, ty + size / 2 + 18);
      ctx.textAlign = 'left';
    }

    // Draw particles
    drawParticles(ctx, particles);

    // Entry point indicator
    ctx.beginPath();
    ctx.arc(20, 240, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(48, 96%, 53%, 0.3)';
    ctx.fill();
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#1F2937';
    ctx.font = '600 7px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText('ENTRY', 20, 256);
    ctx.textAlign = 'left';

  }, [grid, zones, trucks, showHeatmap, tick, particles]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={DEFAULT_CONFIG.yardWidth}
      height={DEFAULT_CONFIG.yardHeight}
      className="w-full h-full"
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
};

export default Canvas2D;
