import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSimulationStore } from '@/simulation/store';
import { DEFAULT_CONFIG } from '@/simulation/config';
import * as THREE from 'three';

const TerrainMesh: React.FC = () => {
  const grid = useSimulationStore(s => s.grid);
  const { gridRows, gridCols } = DEFAULT_CONFIG;

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(gridCols, gridRows, gridCols - 1, gridRows - 1);
    const positions = geo.attributes.position;
    const colors: number[] = [];

    for (let i = 0; i < positions.count; i++) {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);

      if (grid[row] && grid[row][col]) {
        const h = grid[row][col].height * 0.3;
        positions.setZ(i, h);

        const t = grid[row][col].height / 5;
        colors.push(
          0.98 - t * 0.4,
          0.9 - t * 0.45,
          0.59 - t * 0.4
        );
      } else {
        colors.push(0.95, 0.95, 0.95);
      }
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [grid]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
};

const TruckModel: React.FC<{ truck: any }> = ({ truck }) => {
  const meshRef = useRef<THREE.Group>(null);
  const { gridCols, gridRows } = DEFAULT_CONFIG;

  const nx = (truck.x / DEFAULT_CONFIG.yardWidth) * gridCols - gridCols / 2;
  const nz = (truck.y / DEFAULT_CONFIG.yardHeight) * gridRows - gridRows / 2;
  const isActive = truck.state === 'dumping';
  const isMoving = truck.state === 'moving_to_dump' || truck.state === 'returning';
  const isWaiting = truck.state === 'waiting';

  // Compute rotation toward target
  const angle = isMoving
    ? Math.atan2(
        (truck.targetY / DEFAULT_CONFIG.yardHeight) * gridRows - gridRows / 2 - nz,
        (truck.targetX / DEFAULT_CONFIG.yardWidth) * gridCols - gridCols / 2 - nx
      )
    : 0;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    // Smooth position interpolation
    meshRef.current.position.x += (nx - meshRef.current.position.x) * 0.15;
    meshRef.current.position.z += (nz - meshRef.current.position.z) * 0.15;
    // Bobbing for moving trucks
    if (isMoving) {
      meshRef.current.position.y = 0.3 + Math.sin(Date.now() * 0.008) * 0.05;
    }
    // Smooth rotation
    if (isMoving) {
      meshRef.current.rotation.y += ((-angle + Math.PI / 2) - meshRef.current.rotation.y) * 0.1;
    }
  });

  const bodyColor = isActive ? '#10B981' : isWaiting ? '#EF4444' : '#FACC15';
  
  return (
    <group ref={meshRef} position={[nx, 0.3, nz]}>
      {/* Truck body */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.5, 0.3, 0.7]} />
        <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 0.35, -0.15]}>
        <boxGeometry args={[0.4, 0.2, 0.3]} />
        <meshStandardMaterial color="#1F2937" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Bed */}
      <mesh position={[0, 0.2, 0.15]}>
        <boxGeometry args={[0.48, 0.15, 0.35]} />
        <meshStandardMaterial color={isActive ? '#059669' : '#D97706'} metalness={0.2} roughness={0.7} />
      </mesh>
      {/* Wheels */}
      {[[-0.25, 0, -0.2], [0.25, 0, -0.2], [-0.25, 0, 0.25], [0.25, 0, 0.25]].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 8]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}
      {/* Dumping glow */}
      {isActive && (
        <pointLight position={[0, 0.5, 0]} color="#10B981" intensity={2} distance={3} />
      )}
      {/* Waiting indicator */}
      {isWaiting && (
        <mesh position={[0, 0.7, 0]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="#EF4444" emissive="#EF4444" emissiveIntensity={1.5} />
        </mesh>
      )}
    </group>
  );
};

const TruckMarkers: React.FC = () => {
  const trucks = useSimulationStore(s => s.trucks);

  return (
    <>
      {trucks.map(truck => (
        <TruckModel key={truck.id} truck={truck} />
      ))}
    </>
  );
};

const Terrain3D: React.FC = () => {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [15, 15, 15], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow />
        <directionalLight position={[-5, 10, -5]} intensity={0.3} color="#B8CEFF" />
        <hemisphereLight args={['#87CEEB', '#362907', 0.3]} />
        <TerrainMesh />
        <TruckMarkers />
        <OrbitControls enableDamping dampingFactor={0.1} />
        <gridHelper args={[30, 30, '#E5E7EB', '#E5E7EB']} position={[0, -0.01, 0]} />
        <fog attach="fog" args={['#F9FAFB', 25, 50]} />
      </Canvas>
    </div>
  );
};

export default Terrain3D;
