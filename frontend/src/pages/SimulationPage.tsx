import React, { useEffect, useRef, Suspense } from 'react';
import { useSimulationStore } from '@/simulation/store';
import ControlBar from '@/components/ControlBar';
import Canvas2D from '@/components/Canvas2D';
import MetricsPanel from '@/components/MetricsPanel';

const Terrain3D = React.lazy(() => import('@/components/Terrain3D'));

const SimulationPage: React.FC = () => {
  const { init, step, running, speed, viewMode } = useSimulationStore();
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!running) return;

    const interval = Math.max(16, 60 / speed);
    let animId: number;

    const loop = (time: number) => {
      if (time - lastTimeRef.current >= interval) {
        step();
        lastTimeRef.current = time;
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [running, speed, step]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <ControlBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="sim-canvas-wrapper w-full h-full max-w-[900px] max-h-[600px] bg-card">
            {viewMode === '2d' ? (
              <Canvas2D />
            ) : (
              <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading 3D...</div>}>
                <Terrain3D />
              </Suspense>
            )}
          </div>
        </div>
        <MetricsPanel />
      </div>
    </div>
  );
};

export default SimulationPage;
