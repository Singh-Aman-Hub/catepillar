export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'dust' | 'debris' | 'spark';
}

export interface ParticleSystem {
  particles: Particle[];
}

const DUST_COLORS = ['#D4A373', '#C9956B', '#B8860B', '#DAA520', '#E8C872'];
const DEBRIS_COLORS = ['#8B7355', '#6B5B3E', '#5C4A2A', '#7A6544'];

export function createDumpParticles(x: number, y: number): Particle[] {
  const particles: Particle[] = [];
  
  // Dust cloud (many small particles going up and outward)
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 1.5,
      life: 25 + Math.random() * 20,
      maxLife: 25 + Math.random() * 20,
      size: 2 + Math.random() * 4,
      color: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)],
      type: 'dust',
    });
  }

  // Debris chunks (fewer, larger, with gravity)
  for (let i = 0; i < 8; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const speed = 1.5 + Math.random() * 2.5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 20 + Math.random() * 15,
      maxLife: 20 + Math.random() * 15,
      size: 2 + Math.random() * 3,
      color: DEBRIS_COLORS[Math.floor(Math.random() * DEBRIS_COLORS.length)],
      type: 'debris',
    });
  }

  // Sparks
  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 3;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 10 + Math.random() * 8,
      maxLife: 10 + Math.random() * 8,
      size: 1 + Math.random(),
      color: '#FACC15',
      type: 'spark',
    });
  }

  return particles;
}

export function updateParticles(particles: Particle[]): Particle[] {
  return particles
    .map(p => {
      const gravity = p.type === 'debris' ? 0.12 : p.type === 'dust' ? 0.01 : 0.05;
      return {
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        vy: p.vy + gravity,
        vx: p.vx * (p.type === 'dust' ? 0.96 : 0.98),
        life: p.life - 1,
        size: p.type === 'dust' ? p.size * 1.02 : p.size * 0.97,
      };
    })
    .filter(p => p.life > 0);
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const alpha = Math.min(1, p.life / p.maxLife);
    ctx.globalAlpha = alpha;

    if (p.type === 'dust') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'debris') {
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.maxLife - p.life) * 0.3);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    } else {
      // Spark - bright small dot with glow
      ctx.fillStyle = '#FFF';
      ctx.shadowColor = '#FACC15';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;
}
