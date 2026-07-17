import React, { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { COLORS } from "../lib/theme";

/** Load a PNG as a THREE texture, blocking the render until ready */
const useImageTexture = (src: string): THREE.Texture | null => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => delayRender(`texture ${src}`));
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      src,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        setTexture(t);
        continueRender(handle);
      },
      undefined,
      () => continueRender(handle)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return texture;
};

/** Frame-driven camera rig — NO useFrame, pure useCurrentFrame data */
const CameraRig: React.FC<{ x: number; y: number; z: number; lookZ?: number }> = ({
  x,
  y,
  z,
  lookZ = -5,
}) => {
  const { camera } = useThree();
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, lookZ);
  return null;
};

/** Emerald particle cloud drifting in 3D space */
const ParticleField3D: React.FC<{ frame: number; count?: number }> = ({
  frame,
  count = 420,
}) => {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (random(`3px-${i}`) - 0.5) * 26;
      arr[i * 3 + 1] = (random(`3py-${i}`) - 0.5) * 14;
      arr[i * 3 + 2] = -2 - random(`3pz-${i}`) * 18;
    }
    return arr;
  }, [count]);

  return (
    <points rotation={[0, frame * 0.0011, frame * 0.0004]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={COLORS.emeraldBright}
        size={0.045}
        transparent
        opacity={0.65}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const PLANE_W = 6.4;
const PLANE_H = 3.6;

/** Screenshot mapped on a plane with an emerald neon edge behind it */
const ScreenPlane: React.FC<{
  texture: THREE.Texture | null;
  position: [number, number, number];
  rotation: [number, number, number];
  glow?: number;
  scale?: number;
  brightness?: number;
}> = ({ texture, position, rotation, glow = 0.5, scale = 1, brightness = 0.62 }) => {
  if (!texture) return null;
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* neon rim */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[PLANE_W + 0.12, PLANE_H + 0.12]} />
        <meshBasicMaterial
          color={COLORS.emeraldBright}
          transparent
          opacity={glow}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* dark backing so the additive rim reads as an edge */}
      <mesh position={[0, 0, -0.015]}>
        <planeGeometry args={[PLANE_W + 0.05, PLANE_H + 0.05]} />
        <meshBasicMaterial color="#020617" />
      </mesh>
      <mesh>
        <planeGeometry args={[PLANE_W, PLANE_H]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.42}
          metalness={0.18}
          emissive="#ffffff"
          emissiveMap={texture}
          emissiveIntensity={brightness}
        />
      </mesh>
    </group>
  );
};

const Lights: React.FC = () => (
  <>
    <ambientLight intensity={0.5} />
    <directionalLight position={[4, 3, 4]} intensity={1.1} color="#ffffff" />
    {/* emerald rim from behind-left */}
    <directionalLight position={[-7, 2, -3]} intensity={2.4} color={COLORS.emerald} />
    <pointLight position={[0, -3, 1]} intensity={1.4} color={COLORS.emeraldBright} />
  </>
);

/**
 * Hero: the full desk screenshot flies in from deep z, rotating into place
 * while the camera dollies and drifts. Light beam sweeps across.
 */
export const HeroFlight: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const texture = useImageTexture(staticFile(src));

  const arrive = interpolate(frame, [0, 85], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const z = interpolate(arrive, [0, 1], [-17, -4.5]) - frame * 0.0035;
  const rotY = interpolate(arrive, [0, 1], [-0.72, -0.13]);
  const rotX = interpolate(arrive, [0, 1], [0.16, 0.035]);
  const floatY = Math.sin(frame * 0.045) * 0.06;
  const glow = interpolate(arrive, [0.5, 1], [0, 0.55], {
    extrapolateLeft: "clamp",
  }) * (0.8 + 0.2 * Math.sin(frame * 0.09));

  const camX = Math.sin(frame * 0.009) * 0.4;
  const camY = 0.12 + Math.cos(frame * 0.007) * 0.18;

  return (
    <AbsoluteFill>
      <ThreeCanvas
        width={width}
        height={height}
        style={{ width: "100%", height: "100%" }}
        camera={{ fov: 42, position: [0, 0, 1] }}
      >
        <CameraRig x={camX} y={camY} z={1} lookZ={-5} />
        <fog attach="fog" args={["#020617", 6, 26]} />
        <Lights />
        <ParticleField3D frame={frame} />
        <ScreenPlane
          texture={texture}
          position={[0.25, floatY, z]}
          rotation={[rotX, rotY, 0]}
          glow={glow}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

/**
 * Finale: three desk layers start stacked, then separate in 3D —
 * wire pops left, feed pops right, full desk holds center.
 */
export const LayeredFinale: React.FC<{
  center: string;
  left: string;
  right: string;
}> = ({ center, left, right }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const texC = useImageTexture(staticFile(center));
  const texL = useImageTexture(staticFile(left));
  const texR = useImageTexture(staticFile(right));

  const sep = interpolate(frame, [18, 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  // gentle re-converge near the end
  const converge = interpolate(frame, [138, 188], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const k = sep * (1 - converge);

  const camX = Math.sin(frame * 0.012) * 0.9;
  const camY = 0.15 + Math.sin(frame * 0.008) * 0.22;
  const camZ = interpolate(frame, [0, 190], [1.6, 0.4]);

  const floatA = Math.sin(frame * 0.05) * 0.05;
  const floatB = Math.cos(frame * 0.043) * 0.05;

  return (
    <AbsoluteFill>
      <ThreeCanvas
        width={width}
        height={height}
        style={{ width: "100%", height: "100%" }}
        camera={{ fov: 44, position: [0, 0, 1.6] }}
      >
        <CameraRig x={camX} y={camY} z={camZ} lookZ={-5.4} />
        <fog attach="fog" args={["#020617", 7, 30]} />
        <Lights />
        <ParticleField3D frame={frame} count={520} />
        <ScreenPlane
          texture={texC}
          position={[0, 0, -5.6]}
          rotation={[0.02, 0, 0]}
          glow={0.32}
          brightness={1}
        />
        <ScreenPlane
          texture={texL}
          position={[-2.6 * k, 0.24 * k + floatA, -5.6 + 1.35 * k]}
          rotation={[0.02, 0.34 * k, -0.02 * k]}
          glow={0.5 + 0.15 * Math.sin(frame * 0.1)}
          scale={0.62}
          brightness={0.95}
        />
        <ScreenPlane
          texture={texR}
          position={[2.6 * k, -0.18 * k + floatB, -5.6 + 1.05 * k]}
          rotation={[0.02, -0.34 * k, 0.02 * k]}
          glow={0.5 + 0.15 * Math.cos(frame * 0.1)}
          scale={0.62}
          brightness={0.95}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
