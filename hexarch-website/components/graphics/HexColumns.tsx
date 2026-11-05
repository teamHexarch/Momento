"use client";

/**
 * Original Hexarch hero graphic: a cluster of chrome hexagonal columns (like basalt),
 * turning slowly while a light sweeps across the faces. Drawn on a canvas, so there are
 * no image files. Pauses when off screen and draws one still frame for reduced motion.
 */

import { useEffect, useRef } from "react";

type Vec = [number, number, number];

const COLUMNS = [
  { x: 0, z: 0, h: 2.3, r: 0.62 },
  { x: -1.08, z: 0.42, h: 1.45, r: 0.5 },
  { x: 1.1, z: 0.3, h: 1.75, r: 0.52 },
  { x: 0.05, z: -1.05, h: 1.15, r: 0.48 },
  { x: -0.98, z: -0.72, h: 0.85, r: 0.42 },
  { x: 1.02, z: -0.82, h: 1.0, r: 0.44 },
];

function buildFaces() {
  const faces: { pts: Vec[]; normal: Vec; top: boolean }[] = [];
  for (const c of COLUMNS) {
    const ring = (y: number): Vec[] =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return [c.x + Math.cos(a) * c.r, y, c.z + Math.sin(a) * c.r];
      });
    const base = ring(0);
    const top = ring(c.h);
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const mid = (Math.PI / 3) * i + Math.PI / 6 + Math.PI / 6;
      faces.push({
        pts: [base[i], base[j], top[j], top[i]],
        normal: [Math.cos(mid), 0, Math.sin(mid)],
        top: false,
      });
    }
    faces.push({ pts: top, normal: [0, 1, 0], top: true });
  }
  return faces;
}

const FACES = buildFaces();
const CENTER_Y = 1.05;

function rotate(p: Vec, yaw: number, pitch: number): Vec {
  const [x, y0, z] = p;
  const y = y0 - CENTER_Y;
  const cx = Math.cos(yaw), sx = Math.sin(yaw);
  const x1 = x * cx - z * sx;
  const z1 = x * sx + z * cx;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  return [x1, y2, z2];
}

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function HexColumns({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let width = 0;
    let height = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const yaw = t * 0.16 + 0.4;
      const pitch = -0.38 + Math.sin(t * 0.35) * 0.03;
      const bob = Math.sin(t * 0.6) * 6;
      const scale = Math.min(width, height * 1.35) * 0.215;
      const cx = width / 2;
      const cy = height * 0.5 + bob;
      const camera = 7;

      const light = norm([Math.cos(t * 0.45) * 0.9, 0.75, -0.6 + Math.sin(t * 0.3) * 0.3]);
      const view: Vec = [0, 0, -1];

      // Soft floor glow under the cluster
      const glow = ctx.createRadialGradient(cx, cy + scale * 1.35, 0, cx, cy + scale * 1.35, scale * 2.4);
      glow.addColorStop(0, "rgba(255,255,255,0.10)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(cx, cy + scale * 1.35, scale * 2.4, scale * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      const projected = FACES.map((f) => {
        const pts = f.pts.map((p) => rotate(p, yaw, pitch));
        const n = rotate([f.normal[0], f.normal[1] + CENTER_Y, f.normal[2]], yaw, pitch);
        const normal = norm([n[0], n[1], n[2]]);
        const depth = pts.reduce((s, p) => s + p[2], 0) / pts.length;
        const screen = pts.map(([x, y, z]) => {
          const k = camera / (camera + z);
          return [cx + x * scale * k, cy - y * scale * k] as [number, number];
        });
        return { ...f, normal, depth, screen };
      });

      projected
        .filter((f) => dot(f.normal, view) > -0.02)
        .sort((a, b) => b.depth - a.depth)
        .forEach((f) => {
          const diffuse = Math.max(0, dot(f.normal, light));
          const h: Vec = norm([light[0] + view[0], light[1] + view[1], light[2] + view[2]]);
          const spec = Math.pow(Math.max(0, dot(f.normal, h)), 18);
          const base = f.top ? 58 : 16;
          const lit = Math.min(240, base + diffuse * (f.top ? 130 : 92) + spec * 190);
          const dark = Math.max(6, lit * 0.28);

          const [a, b, c, d] = f.screen;
          const gx0 = f.top ? f.screen[0][0] : (a[0] + b[0]) / 2;
          const gy0 = f.top ? f.screen[0][1] : (a[1] + b[1]) / 2;
          const gx1 = f.top ? f.screen[3][0] : (c[0] + (d ?? c)[0]) / 2;
          const gy1 = f.top ? f.screen[3][1] : (c[1] + (d ?? c)[1]) / 2;
          const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
          const sweep = 0.5 + Math.sin(t * 0.8 + f.depth * 2) * 0.35;
          grad.addColorStop(0, `rgb(${dark},${dark},${dark + 2})`);
          grad.addColorStop(Math.max(0.05, Math.min(0.95, sweep)), `rgb(${lit},${lit},${lit + 4})`);
          grad.addColorStop(1, `rgb(${dark * 1.4},${dark * 1.4},${dark * 1.4 + 3})`);

          ctx.beginPath();
          f.screen.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.06 + spec * 0.45})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
    };

    const loop = (now: number) => {
      if (visible) draw((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(2);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);

    if (reduce) draw(2);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
