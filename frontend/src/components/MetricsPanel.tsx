import React from 'react';
import { useSimulationStore } from '@/simulation/store';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Filler);

const KpiCard: React.FC<{ label: string; value: string | number; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="panel-card p-3">
    <div className="kpi-label">{label}</div>
    <div className={`kpi-value mt-1 ${accent ? 'text-accent' : 'text-foreground'}`}>{value}</div>
  </div>
);

const MetricsPanel: React.FC = () => {
  const { metrics, trucks, zones } = useSimulationStore();

  const activeTrucks = trucks.filter(t => t.state !== 'idle').length;

  const densityChartData = {
    labels: metrics.densityHistory.map((_, i) => i.toString()),
    datasets: [
      {
        label: 'Density %',
        data: metrics.densityHistory,
        borderColor: '#FACC15',
        backgroundColor: 'hsla(48, 96%, 53%, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  const zoneChartData = {
    labels: zones.map((_, i) => `Z${i + 1}`),
    datasets: [
      {
        label: 'Dumps',
        data: metrics.zoneDumps,
        backgroundColor: [
          'hsla(48, 96%, 53%, 0.7)',
          'hsla(160, 84%, 39%, 0.7)',
          'hsla(199, 89%, 48%, 0.7)',
          'hsla(280, 67%, 55%, 0.7)',
        ],
        borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { tooltip: { enabled: true }, title: { display: false } },
    scales: {
      x: {
        display: false,
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#F3F4F6' },
        ticks: { font: { size: 9, family: 'JetBrains Mono' }, color: '#9CA3AF' },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { tooltip: { enabled: true }, title: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10, family: 'JetBrains Mono' }, color: '#9CA3AF' },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#F3F4F6' },
        ticks: { font: { size: 9, family: 'JetBrains Mono' }, color: '#9CA3AF' },
      },
    },
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-border">
        <h2 className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Live Metrics</h2>
      </div>

      <div className="p-3 grid grid-cols-2 gap-2">
        <KpiCard label="Total Dumps" value={metrics.totalDumps} accent />
        <KpiCard label="Missed" value={metrics.missedDumps} />
        <KpiCard label="Density" value={`${metrics.packingDensity}%`} accent />
        <KpiCard label="Active" value={`${activeTrucks}/${trucks.length}`} />
      </div>

      <div className="px-3 pb-2">
        <div className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-2">Density Trend</div>
        <div className="panel-card p-2" style={{ height: 120 }}>
          <Line data={densityChartData} options={chartOptions as any} />
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-2">Zone Usage</div>
        <div className="panel-card p-2" style={{ height: 120 }}>
          <Bar data={zoneChartData} options={barOptions as any} />
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="text-xs font-semibold text-muted-foreground tracking-widest uppercase mb-2">Fleet Status</div>
        <div className="space-y-1">
          {trucks.map(truck => (
            <div key={truck.id} className="flex items-center justify-between panel-card px-2 py-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{
                    backgroundColor:
                      truck.state === 'dumping' ? '#10B981' :
                      truck.state === 'waiting' ? '#EF4444' :
                      truck.state === 'idle' ? '#9CA3AF' :
                      '#FACC15',
                  }}
                />
                <span className="font-mono-data text-[10px] font-semibold">{truck.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono-data text-[10px] text-muted-foreground uppercase">
                  {truck.state.replace('_', ' ')}
                </span>
                <span className="font-mono-data text-[10px] font-bold">{truck.dumpCount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MetricsPanel;
