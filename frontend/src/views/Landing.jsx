import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap, Film, BarChart3, PenTool, Globe, Users, Play, Sparkles, TrendingUp, Menu, X, Code, Smartphone, Megaphone, Mouse, Sword, Bomb } from 'lucide-react';
import { EncryptedText } from "@/components/ui/encrypted-text";
import japaneseImg from '../assets/japenese-image.webp';
import logoImg from '../assets/logo.png';

/* ==========================================================================
   FRUIT-NINJA SLASH CANVAS
   — Shapes launch from the bottom in waves, arc through the air with gravity.
   — Moving the mouse fast leaves a thick glowing blade trail.
   — Blade slices shapes in half; halves tumble away with particle bursts.
   ========================================================================== */
const SlashCanvas = ({ score, onScore }) => {
  const canvasRef = useRef(null);
  const scoreRef = useRef(score);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  const animRef = useRef(null);
  const mouse = useRef({ x: -999, y: -999, px: -999, py: -999 });
  const fruits = useRef([]);       // active shapes in the air
  const halves = useRef([]);       // sliced halves tumbling away
  const particles = useRef([]);    // juice splatter + sparks
  const flashes = useRef([]);      // cut-point flash circles
  const slashLines = useRef([]);   // full-screen anime katana cut lines
  const screenFlash = useRef(0);   // screen-wide white flash timer
  const screenFlashColor = useRef('rgba(255, 255, 255, 0.15)');
  const trail = useRef([]);        // blade trail points
  const spawnTimer = useRef(0);

  useEffect(() => {
    const cvs = canvasRef.current;
    const ctx = cvs.getContext('2d');
    let W, H, dpr;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const parent = cvs.parentElement;
      W = parent.offsetWidth;
      H = parent.offsetHeight;
      cvs.width = W * dpr;
      cvs.height = H * dpr;
      cvs.style.width = W + 'px';
      cvs.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    /* ---------- Shape types ---------- */
    const TYPES = ['circle', 'square', 'hexagon', 'diamond'];

    const spawnWave = () => {
      if (scoreRef.current === 0) {
        if (fruits.current.some(f => f.alive)) return;
        fruits.current.push({
          x: W / 2,
          y: H + 35,
          size: 70,
          type: "circle",
          vx: 0,
          vy: -13,
          rot: 0,
          rotV: 0.02,
          alive: true,
          filled: true,
          tutorial: true
        });
      } else {
        const count = 2 + Math.floor(Math.random() * 3); // 2-4 per wave
        for (let i = 0; i < count; i++) {
          // 18% chance to spawn a bomb (only if score > 2)
          const isBomb = scoreRef.current > 2 && Math.random() < 0.18;
          
          if (isBomb) {
            const size = 38;
            const x = 80 + Math.random() * (W - 160);
            fruits.current.push({
              x,
              y: H + size,
              size,
              type: 'bomb',
              vx: (Math.random() - 0.5) * 2.5,
              vy: -(10 + Math.random() * 4),
              rot: Math.random() * Math.PI * 2,
              rotV: (Math.random() - 0.5) * 0.04,
              alive: true,
              filled: true
            });
          } else {
            const type = TYPES[Math.floor(Math.random() * TYPES.length)];
            const size = 32 + Math.random() * 38;
            const x = 80 + Math.random() * (W - 160);
            fruits.current.push({
              x,
              y: H + size,
              size,
              type,
              vx: (Math.random() - 0.5) * 3,
              vy: -(11 + Math.random() * 5),   // strong upward launch
              rot: Math.random() * Math.PI * 2,
              rotV: (Math.random() - 0.5) * 0.06,
              alive: true,
              filled: Math.random() > 0.35,     // 65% filled, 35% outline-only
            });
          }
        }
      }
    };
    // Initial wave
    spawnWave();

    /* ---------- Mouse tracking ---------- */
    const onMove = (e) => {
      const r = cvs.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      if (cx < -20 || cy < -20 || cx > W + 20 || cy > H + 20) return;

      mouse.current.px = mouse.current.x;
      mouse.current.py = mouse.current.y;
      mouse.current.x = cx;
      mouse.current.y = cy;

      trail.current.push({ x: cx, y: cy, age: 0 });
      if (trail.current.length > 80) trail.current.shift();

      // --- Slice detection ---
      const dx = cx - mouse.current.px;
      const dy = cy - mouse.current.py;
      const speed = Math.sqrt(dx * dx + dy * dy);
      if (speed < 7) return;

      // Slash direction angle
      const slashAngle = Math.atan2(dy, dx);
      // Perpendicular for splitting halves
      const perpX = Math.cos(slashAngle + Math.PI / 2);
      const perpY = Math.sin(slashAngle + Math.PI / 2);

      fruits.current.forEach((f) => {
        if (!f.alive) return;
        const dist = Math.hypot(f.x - cx, f.y - cy);
        if (dist > f.size * 0.8 + 12) return;

        // --- KATANA CUT! ---
        f.alive = false;

        if (f.type === 'bomb') {
          if (onScore) onScore(0);
          screenFlash.current = 15;
          screenFlashColor.current = 'rgba(239, 68, 68, 0.45)'; // Red flash
          
          // Spawn explosion particles
          const n = 35 + Math.floor(Math.random() * 15);
          for (let j = 0; j < n; j++) {
            const ang = Math.random() * Math.PI * 2;
            const vel = 3 + Math.random() * 9;
            particles.current.push({
              x: f.x, y: f.y,
              vx: Math.cos(ang) * vel,
              vy: Math.sin(ang) * vel - 2,
              sz: 2 + Math.random() * 5,
              age: 0,
              life: 30 + Math.random() * 20,
              purple: false,
              spark: true,
              customColor: Math.random() > 0.4 ? '#f97316' : '#ef4444'
            });
          }
          return;
        }

        if (onScore) onScore();
        screenFlashColor.current = 'rgba(255, 255, 255, 0.15)'; // Reset to white

        // Spawn two halves — fly apart fast
        const halfSize = f.size * 0.55;
        for (let side = -1; side <= 1; side += 2) {
          halves.current.push({
            x: f.x + perpX * side * 8,
            y: f.y + perpY * side * 8,
            vx: perpX * side * (5 + Math.random() * 3) + dx * 0.2,
            vy: perpY * side * (5 + Math.random() * 3) + dy * 0.2 - 3,
            size: halfSize,
            rot: f.rot,
            rotV: side * (0.12 + Math.random() * 0.08),
            type: f.type,
            clipAngle: slashAngle,
            clipSide: side,
            filled: f.filled,
            age: 0,
          });
        }

        // Juice splatter particles — more dramatic Sumi ink drops
        const n = 22 + Math.floor(Math.random() * 10);
        for (let j = 0; j < n; j++) {
          const ang = Math.random() * Math.PI * 2;
          const vel = 2 + Math.random() * 8;
          particles.current.push({
            x: f.x, y: f.y,
            vx: Math.cos(ang) * vel + dx * 0.25,
            vy: Math.sin(ang) * vel + dy * 0.25 - 1.5,
            sz: 2 + Math.random() * 6,
            age: 0,
            life: 35 + Math.random() * 25,
            purple: Math.random() > 0.45,
            spark: false,
          });
        }
        // White sparks — fast, bright, short-lived
        for (let j = 0; j < 8; j++) {
          const ang = slashAngle + (Math.random() - 0.5) * 1.2;
          particles.current.push({
            x: f.x, y: f.y,
            vx: Math.cos(ang) * (8 + Math.random() * 6),
            vy: Math.sin(ang) * (8 + Math.random() * 6),
            sz: 1.5 + Math.random() * 2,
            age: 0,
            life: 12 + Math.random() * 10,
            purple: false,
            spark: true,
          });
        }

        // Flash at cut point — bigger
        flashes.current.push({ x: f.x, y: f.y, age: 0, maxR: f.size * 1.8 });

        // Full-screen anime slash line
        slashLines.current.push({
          x: f.x, y: f.y,
          angle: slashAngle,
          age: 0,
          len: Math.max(W, H) * 1.5,
        });

        // Screen flash
        screenFlash.current = 8;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });

    /* ---------- Draw shape path helper ---------- */
    const shapePath = (ctx2, type, r) => {
      ctx2.beginPath();
      if (type === 'circle') {
        ctx2.arc(0, 0, r, 0, Math.PI * 2);
      } else if (type === 'square') {
        const s = r * 0.88;
        ctx2.rect(-s, -s, s * 2, s * 2);
      } else if (type === 'hexagon') {
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6 - Math.PI / 6;
          const method = i === 0 ? 'moveTo' : 'lineTo';
          ctx2[method](Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx2.closePath();
      } else { // diamond
        ctx2.moveTo(0, -r); ctx2.lineTo(r * 0.8, 0);
        ctx2.lineTo(0, r);  ctx2.lineTo(-r * 0.8, 0);
        ctx2.closePath();
      }
    };

    /* ---------- Animation Loop ---------- */
    const GRAVITY = 0.18;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // --- Spawn timer ---
      spawnTimer.current++;
      if (spawnTimer.current > 90 + Math.random() * 40) { // ~every 1.5-2.2s at 60fps
        spawnWave();
        spawnTimer.current = 0;
      }

      // ===== FRUITS (airborne shapes) =====
      fruits.current.forEach((f) => {
        if (!f.alive) return;
        f.vy += GRAVITY;
        f.x += f.vx;
        f.y += f.vy;
        f.rot += f.rotV;

        // Off-screen bottom = dead
        if (f.y > H + f.size * 2) { f.alive = false; return; }

        const r = f.size / 2;

        // Draw very soft ink shadow behind fruit/bomb to mimic paper smudge
        ctx.save();
        const shadowGrad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 0.7);
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.12)');
        shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.04)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (f.type === 'bomb') {
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          
          // Draw bomb body (black circle)
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = '#1e1b4b'; // very dark indigo/black
          ctx.fill();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          // Draw fuse cap
          ctx.fillStyle = '#4b5563';
          ctx.fillRect(-r * 0.25, -r - 4, r * 0.5, 6);
          ctx.strokeRect(-r * 0.25, -r - 4, r * 0.5, 6);
          
          ctx.restore();
          
          // Draw fuse cord (curved line, outside rotation so it stays up)
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.beginPath();
          ctx.moveTo(0, -r - 4);
          ctx.quadraticCurveTo(r * 0.4, -r - 12, r * 0.2, -r - 20);
          ctx.strokeStyle = '#b45309'; // brown fuse
          ctx.lineWidth = 2.5;
          ctx.stroke();
          
          // Draw spark at the end of the fuse
          const sparkX = r * 0.2;
          const sparkY = -r - 20;
          ctx.beginPath();
          ctx.arc(sparkX, sparkY, 4 + Math.sin(Date.now() * 0.05) * 2, 0, Math.PI * 2);
          ctx.fillStyle = '#f97316'; // orange glow
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(sparkX, sparkY, 2 + Math.cos(Date.now() * 0.08) * 1, 0, Math.PI * 2);
          ctx.fillStyle = '#facc15'; // yellow core
          ctx.fill();
          
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);

          if (f.filled) {
            shapePath(ctx, f.type, r);
            ctx.fillStyle = '#000000';
            ctx.fill();
            // Inner highlight
            shapePath(ctx, f.type, r * 0.55);
            ctx.fillStyle = '#27272a';
            ctx.fill();
          } else {
            shapePath(ctx, f.type, r);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          ctx.restore();

          // Draw pulse around tutorial fruit
          if (f.tutorial) {
            ctx.save();
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            const pulse = 10 + Math.sin(Date.now() * 0.008) * 8;
            ctx.arc(f.x, f.y, (f.size / 2) + pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      });
      fruits.current = fruits.current.filter((f) => f.alive || f.y <= H + f.size * 2);

      // ===== HALVES (sliced pieces tumbling) =====
      halves.current.forEach((h) => {
        h.vy += GRAVITY;
        h.x += h.vx;
        h.y += h.vy;
        h.rot += h.rotV;
        h.age++;

        const life = 70;
        const alpha = Math.max(0, 1 - h.age / life);
        if (alpha <= 0) return;

        const r = h.size / 2;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.rot);

        // Clip to one half using the slash angle
        ctx.beginPath();
        const clipR = r * 3;
        const ca = h.clipAngle - h.rot; // relative clip angle
        if (h.clipSide === 1) {
          ctx.moveTo(Math.cos(ca) * clipR, Math.sin(ca) * clipR);
          ctx.lineTo(Math.cos(ca + Math.PI) * clipR, Math.sin(ca + Math.PI) * clipR);
          ctx.lineTo(Math.cos(ca + Math.PI) * clipR - Math.sin(ca) * clipR * 2,
                     Math.sin(ca + Math.PI) * clipR + Math.cos(ca) * clipR * 2);
          ctx.lineTo(Math.cos(ca) * clipR - Math.sin(ca) * clipR * 2,
                     Math.sin(ca) * clipR + Math.cos(ca) * clipR * 2);
        } else {
          ctx.moveTo(Math.cos(ca) * clipR, Math.sin(ca) * clipR);
          ctx.lineTo(Math.cos(ca + Math.PI) * clipR, Math.sin(ca + Math.PI) * clipR);
          ctx.lineTo(Math.cos(ca + Math.PI) * clipR + Math.sin(ca) * clipR * 2,
                     Math.sin(ca + Math.PI) * clipR - Math.cos(ca) * clipR * 2);
          ctx.lineTo(Math.cos(ca) * clipR + Math.sin(ca) * clipR * 2,
                     Math.sin(ca) * clipR - Math.cos(ca) * clipR * 2);
        }
        ctx.closePath();
        ctx.clip();

        ctx.globalAlpha = alpha;
        if (h.filled) {
          shapePath(ctx, h.type, r);
          ctx.fillStyle = '#000000';
          ctx.fill();
          shapePath(ctx, h.type, r * 0.55);
          ctx.fillStyle = '#27272a';
          ctx.fill();
        } else {
          shapePath(ctx, h.type, r);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.restore();
      });
      halves.current = halves.current.filter((h) => h.age < 70);

      // ===== KATANA BLADE TRAIL (5-layer dramatic swoosh) =====
      const T = trail.current;
      if (T.length > 2) {
        for (let i = 0; i < T.length; i++) T[i].age++;

        for (let i = 1; i < T.length; i++) {
          const p = T[i], pp = T[i - 1];
          const a = Math.max(0, 1 - p.age / 24);  // longer lasting
          if (a <= 0) continue;

          const t = i / T.length; // 0 = tail, 1 = tip
          const tt = t * t; // ease-in for sharper taper

          // Layer 1: Ultra-wide purple aura
          ctx.beginPath();
          ctx.moveTo(pp.x, pp.y); ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(168, 85, 247, ${a * 0.18 * tt})`;
          ctx.lineWidth = a * tt * 50;
          ctx.lineCap = 'round'; ctx.stroke();

          // Layer 2: Mid purple glow
          ctx.beginPath();
          ctx.moveTo(pp.x, pp.y); ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(168, 85, 247, ${a * 0.4 * tt})`;
          ctx.lineWidth = a * tt * 28;
          ctx.lineCap = 'round'; ctx.stroke();

          // Layer 3: Bright white shimmer
          ctx.beginPath();
          ctx.moveTo(pp.x, pp.y); ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.85 * tt})`;
          ctx.lineWidth = a * tt * 14;
          ctx.lineCap = 'round'; ctx.stroke();

          // Layer 4: Hot white core
          ctx.beginPath();
          ctx.moveTo(pp.x, pp.y); ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(255, 255, 255, ${a * tt})`;
          ctx.lineWidth = a * tt * 6;
          ctx.lineCap = 'round'; ctx.stroke();

          // Layer 5: Razor-sharp dark edge (the steel)
          ctx.beginPath();
          ctx.moveTo(pp.x, pp.y); ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = `rgba(0, 0, 0, ${a * 0.95 * t})`;
          ctx.lineWidth = a * t * 2;
          ctx.lineCap = 'round'; ctx.stroke();
        }
        trail.current = T.filter((p) => p.age < 24);
      }

      // ===== PARTICLES (juice splatter + sparks) =====
      particles.current.forEach((p) => {
        p.vy += p.spark ? 0.05 : 0.14;
        p.vx *= p.spark ? 0.96 : 0.98;
        p.x += p.vx;
        p.y += p.vy;
        p.age++;
        const a = Math.max(0, 1 - p.age / p.life);
        if (a <= 0) return;
        ctx.globalAlpha = a;
        if (p.spark) {
          // Bright white spark or custom color spark with motion trail
          ctx.fillStyle = p.customColor || '#ffffff';
          const sz = p.sz * a;
          ctx.beginPath();
          ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
          ctx.fill();
          // Spark glow
          ctx.fillStyle = p.customColor ? `rgba(239, 68, 68, ${a * 0.5})` : `rgba(168, 85, 247, ${a * 0.5})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, sz * 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Traditional Sumi-e charcoal and black ink wash droplets
          ctx.fillStyle = p.purple ? 'rgba(9, 9, 11, 0.9)' : 'rgba(39, 39, 42, 0.8)';
          const sz = p.sz * (0.6 + a * 0.4);
          ctx.beginPath();
          ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
      particles.current = particles.current.filter((p) => p.age < p.life);

      // ===== ANIME SLASH LINES (full-screen katana cut) =====
      slashLines.current.forEach((sl) => {
        sl.age++;
        const dur = 18;
        const prog = sl.age / dur;
        const a = Math.max(0, 1 - prog);
        if (a <= 0) return;

        const cos = Math.cos(sl.angle);
        const sin = Math.sin(sl.angle);
        const halfLen = sl.len / 2;

        // Draw the slash line extending from the cut point to edges
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sl.x - cos * halfLen, sl.y - sin * halfLen);
        ctx.lineTo(sl.x + cos * halfLen, sl.y + sin * halfLen);

        // Outer glow
        ctx.strokeStyle = `rgba(168, 85, 247, ${a * 0.3})`;
        ctx.lineWidth = (1 - prog) * 20;
        ctx.lineCap = 'round';
        ctx.stroke();

        // White core
        ctx.beginPath();
        ctx.moveTo(sl.x - cos * halfLen, sl.y - sin * halfLen);
        ctx.lineTo(sl.x + cos * halfLen, sl.y + sin * halfLen);
        ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.8})`;
        ctx.lineWidth = (1 - prog) * 6;
        ctx.stroke();

        // Sharp edge
        ctx.beginPath();
        ctx.moveTo(sl.x - cos * halfLen, sl.y - sin * halfLen);
        ctx.lineTo(sl.x + cos * halfLen, sl.y + sin * halfLen);
        ctx.strokeStyle = `rgba(0, 0, 0, ${a * 0.6})`;
        ctx.lineWidth = (1 - prog) * 1.5;
        ctx.stroke();
        ctx.restore();
      });
      slashLines.current = slashLines.current.filter((sl) => sl.age < 18);

      // ===== FLASH CIRCLES (impact ring) =====
      flashes.current.forEach((fl) => {
        fl.age++;
        const dur = 16;
        const prog = fl.age / dur;
        const a = Math.max(0, 1 - prog);
        const r = fl.maxR * prog;

        // Outer purple ring
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(168, 85, 247, ${a * 0.7})`;
        ctx.lineWidth = (1 - prog) * 6;
        ctx.stroke();

        // Second expanding ring
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, r * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.5})`;
        ctx.lineWidth = (1 - prog) * 3;
        ctx.stroke();

        // Bright center flash
        if (prog < 0.35) {
          const fa = 1 - prog / 0.35;
          ctx.beginPath();
          ctx.arc(fl.x, fl.y, fl.maxR * 0.4 * fa, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${fa * 0.7})`;
          ctx.fill();
        }
      });
      flashes.current = flashes.current.filter((fl) => fl.age < 16);

      // ===== SCREEN FLASH (brief white/red overlay on cut) =====
      if (screenFlash.current > 0) {
        const fa = screenFlash.current / 15;
        ctx.save();
        ctx.globalAlpha = fa;
        ctx.fillStyle = screenFlashColor.current;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        screenFlash.current--;
      }

      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
    />
  );
};

/* ==========================================================================
   SCROLL REVEAL HOOK
   ========================================================================== */
const useScrollReveal = (threshold = 0.15) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('visible'); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
};

/* ==========================================================================
   DATA
   ========================================================================== */
const CAPABILITIES = [
  { icon: PenTool, title: 'Content Strategy', desc: 'We build monthly content calendars with scripts, hooks, and posting schedules engineered for maximum reach.', dark: false },
  { icon: Film, title: 'Video Production', desc: 'End-to-end short-form and long-form video creation — from script to shoot to final edit, delivered on time.', dark: true },
  { icon: Globe, title: 'Social Media Ops', desc: 'Multi-platform management across Instagram, YouTube, TikTok, and LinkedIn with daily engagement tracking.', dark: false },
  { icon: Code, title: 'Web Development', desc: 'Custom, high-performance websites and web applications built with modern technologies to drive conversions.', dark: true },
  { icon: Smartphone, title: 'App Development', desc: 'Native and cross-platform mobile applications designed for seamless user experiences and engagement.', dark: false },
  { icon: BarChart3, title: 'Performance Analytics', desc: 'Data-driven growth reports with real CTR, impressions, and audience metrics — no vanity numbers.', dark: true },
  { icon: Zap, title: 'Campaign Management', desc: 'Organic and paid campaign execution with A/B testing, audience targeting, and conversion-optimized funnels.', dark: false },
  { icon: Users, title: 'Brand Development', desc: 'Visual identity systems, positioning strategy, and tone-of-voice guides that make your brand unmistakable.', dark: true },
  { icon: Megaphone, title: 'News Media Coverage & PR', desc: 'Strategic public relations and news media placements to amplify your brand presence and establish industry authority.', dark: false },
];

const PORTFOLIO = [
  {
    tag: 'YouTube · Instagram · TikTok',
    title: 'Scaled a D2C Beverage Brand from 0 → 250K Followers in 5 Months',
    desc: 'Developed a 90-day content blitz with viral short-form hooks, influencer seeding, and community-first engagement strategy.',
    metrics: [{ val: '12.4M', label: 'Views' }, { val: '247K', label: 'Followers' }, { val: '8.2%', label: 'Eng Rate' }],
    pattern: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.03) 20px, rgba(255,255,255,0.03) 40px)',
  },
  {
    tag: 'LinkedIn · Twitter · YouTube',
    title: 'Repositioned a SaaS Startup as the #1 Thought Leader in Its Niche',
    desc: 'Built a founder-led content engine with weekly long-form videos, podcast clips, and LinkedIn carousels. Drove 3X inbound leads.',
    metrics: [{ val: '3.1M', label: 'Impressions' }, { val: '3X', label: 'Lead Growth' }, { val: '62%', label: 'CTR Lift' }],
    pattern: 'repeating-linear-gradient(-45deg, transparent, transparent 20px, rgba(255,255,255,0.03) 20px, rgba(255,255,255,0.03) 40px)',
  },
  {
    tag: 'Instagram · TikTok',
    title: 'Launched a Fitness Brand into the Top 10 Trending Creators',
    desc: 'Shot, scripted, and posted 120 reels in 60 days. Created viral workout series that hit 50M+ combined views.',
    metrics: [{ val: '52M', label: 'Views' }, { val: '189K', label: 'Followers' }, { val: '#7', label: 'Trending' }],
    pattern: 'repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(255,255,255,0.03) 20px, rgba(255,255,255,0.03) 40px)',
  },
  {
    tag: 'Full-Stack Brand Ops',
    title: 'Built the Entire Marketing Engine for a Restaurant Chain',
    desc: 'Managed 4 locations across social, Google My Business, email, and local influencer partnerships. Drove 40% foot traffic increase.',
    metrics: [{ val: '40%', label: 'Traffic ↑' }, { val: '4', label: 'Locations' }, { val: '1.8M', label: 'Reach/Mo' }],
    pattern: 'repeating-linear-gradient(135deg, transparent, transparent 20px, rgba(255,255,255,0.03) 20px, rgba(255,255,255,0.03) 40px)',
  },
];

const STATS = [
  { number: '1.2B+', label: 'Organic Views Generated' },
  { number: '20+', label: 'Active Client Partners' },
  { number: '98%', label: 'Client Retention Rate' },
  { number: '3X', label: 'Avg Growth Multiplier' },
];

const HEALTHCARE_CLIENTS = [
  'VoltHealth', 'Aegis Med', 'Sano Care', 'Pulse Therapeutics', 'BioMedica', 'CareCore', 'WellPath Clinic'
];

const FNB_CLIENTS = [
  'NovaBrew', 'Candor Coffee', 'Zenith Eats', 'Sage & Co', 'Basecamp Nutrition', 'Brio Bites', 'Gusto Bistro', 'Sip & Co'
];

/* ==========================================================================
   CAPABILITY CARD
   ========================================================================== */
const CapCard = ({ icon: Icon, title, desc, dark, delay }) => {
  const ref = useScrollReveal(0.12);
  return (
    <div ref={ref} className={`cap-card${dark ? ' cap-dark' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="cap-card-icon"><Icon size={22} /></div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
};

/* ==========================================================================
   PORTFOLIO CARD
   ========================================================================== */
const PortfolioCard = ({ tag, title, desc, metrics, pattern, delay }) => {
  const ref = useScrollReveal(0.1);
  return (
    <div ref={ref} className="portfolio-card" style={{ transitionDelay: `${delay}ms` }}>
      <div className="portfolio-card-visual">
        <div className="visual-pattern" style={{ background: pattern }} />
        <Play size={40} style={{ color: '#fff', opacity: 0.25, zIndex: 1 }} />
      </div>
      <div className="portfolio-card-body">
        <span className="portfolio-tag">{tag}</span>
        <h3>{title}</h3>
        <p>{desc}</p>
        <div className="portfolio-metrics">
          {metrics.map((m, i) => (
            <div className="portfolio-metric" key={i}>
              <span className="portfolio-metric-val">{m.val}</span>
              <span className="portfolio-metric-label">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   CUSTOM BRAND ICONS (Vite/Lucide v1.0+ doesn't bundle brand icons)
   ========================================================================== */
const InstagramIcon = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const LinkedinIcon = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const COMPANY_SECRETS = [
  "We generated over 1.2B+ organic views for our client partners!",
  "We scaled a D2C beverage brand from 0 to 250K followers in 5 months.",
  "Our creative campaigns maintain a 98% client retention rate.",
  "We drive a 3X average growth multiplier for client social channels.",
  "We shoot, script, and edit 120+ custom high-retention reels every 60 days.",
  "We've repositioned a SaaS startup to drive 3X inbound lead growth.",
  "We manage multi-platform operations across IG, YouTube, TikTok, and LinkedIn.",
  "We build custom dashboards & client portals for real-time task tracking.",
  "We execute PR campaigns with placements in top-tier news media publications.",
  "We secure an average 8.2% engagement rate on scaling brand accounts.",
  "We've hit over 52M combined views for trending fitness creators.",
  "We grow local restaurant chain foot traffic by 40% using regional content blitzes."
];

/* ==========================================================================
   LANDING PAGE — Main Component
   ========================================================================== */
function Landing() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const [score, setScore] = useState(0);
  const [gameMode, setGameMode] = useState(false);
  const [revealSecretChecked, setRevealSecretChecked] = useState(false);
  const [unlockedSecret, setUnlockedSecret] = useState("");

  const handlePointerDown = () => {
    setGameMode(true);
  };

  const exitGame = (e) => {
    e.stopPropagation();
    setGameMode(false);
    setScore(0);
    setRevealSecretChecked(false);
    setUnlockedSecret("");
    document.getElementById('our-story')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!gameMode) {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [gameMode]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', company: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  // Remove body padding and #root constraints on mount
  useEffect(() => {
    const body = document.body;
    const root = document.getElementById('root');
    const origBodyPad = body.style.padding;
    const origRootMax = root.style.maxWidth;
    body.style.padding = '0';
    root.style.maxWidth = 'none';
    return () => {
      body.style.padding = origBodyPad;
      root.style.maxWidth = origRootMax;
    };
  }, []);

  return (
    <div className="landing-root">
      {/* ===== Fixed Navigation ===== */}
      <nav className="landing-nav">
        <span
          className="landing-nav-logo"
          onClick={(e) => {
            e.preventDefault();
            heroRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          style={{ display: 'flex', alignItems: 'center', height: '40px', cursor: 'pointer' }}
        >
          <img src={logoImg} alt="Hyphening Media" style={{ height: '80px', width: 'auto' }} />
        </span>
        
        {/* Middle Links (Visible on desktop) */}
        <div className="landing-nav-links">
          <a href="#our-story" onClick={(e) => { e.preventDefault(); document.getElementById('our-story')?.scrollIntoView({ behavior: 'smooth' }); }}>Our story</a>
          <a href="#capabilities" onClick={(e) => { e.preventDefault(); document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' }); }}>Services</a>
          <a href="#portfolio" onClick={(e) => { e.preventDefault(); document.getElementById('portfolio')?.scrollIntoView({ behavior: 'smooth' }); }}>Portfolio</a>
          <a href="#faq" onClick={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }}>FAQ</a>
          <a href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }}>Contact</a>
        </div>

        {/* Hamburger button on the right */}
        <button 
          className="landing-nav-hamburger" 
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <Menu size={20} strokeWidth={3} />
        </button>
      </nav>

      {/* ===== Mobile/Drawer Dropdown Menu ===== */}
      <div className={`landing-drawer ${menuOpen ? 'open' : ''}`}>
        <div className="landing-drawer-overlay" onClick={() => setMenuOpen(false)} />
        <div className="landing-drawer-content">
          <div className="landing-drawer-header">
            <span
              className="landing-nav-logo"
              onClick={(e) => {
                e.preventDefault();
                setMenuOpen(false);
                heroRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{ display: 'flex', alignItems: 'center', height: '40px', cursor: 'pointer' }}
            >
              <img src={logoImg} alt="Hyphening Media" style={{ height: '70px', width: 'auto' }} />
            </span>
            <button className="landing-nav-hamburger close-btn" onClick={() => setMenuOpen(false)}>
              <X size={20} strokeWidth={3} />
            </button>
          </div>
          <div className="landing-drawer-links">
            <a href="#our-story" onClick={(e) => { e.preventDefault(); setMenuOpen(false); document.getElementById('our-story')?.scrollIntoView({ behavior: 'smooth' }); }}>Our story</a>
            <a href="#capabilities" onClick={(e) => { e.preventDefault(); setMenuOpen(false); document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' }); }}>Services</a>
            <a href="#portfolio" onClick={(e) => { e.preventDefault(); setMenuOpen(false); document.getElementById('portfolio')?.scrollIntoView({ behavior: 'smooth' }); }}>Portfolio</a>
            <a href="#faq" onClick={(e) => { e.preventDefault(); setMenuOpen(false); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }}>FAQ</a>
            <a href="#contact" onClick={(e) => { e.preventDefault(); setMenuOpen(false); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }}>Contact</a>
            
            <div className="landing-drawer-divider" />
            
            <button className="btn btn-primary" onClick={() => { setMenuOpen(false); navigate('/login'); }} style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
              Sign In <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Hero Section ===== */}
      <section className={`landing-hero ${gameMode ? "game-active" : ""}`} ref={heroRef}>
        <div className="hero-bento">
          {/* Main Game Area */}
          <div className="hero-main" onPointerDown={handlePointerDown}>
            <SlashCanvas
              score={score}
              onScore={(val) => {
                if (val === 0) {
                  setScore(0);
                  setRevealSecretChecked(false);
                  setUnlockedSecret("");
                } else {
                  setScore(s => s + 1);
                }
              }}
            />

            {gameMode && (
              <div className="game-score-overlay">
                Score: {score}
              </div>
            )}

            {gameMode && (
              <button
                className="exit-game"
                onClick={exitGame}
                aria-label="Exit Game"
              >
                ✕ Exit
              </button>
            )}

            <div className="hero-overlay">
              <h1 className="hero-headline hero-title">
                <span style={{
                  position: 'absolute',
                  width: '1px',
                  height: '1px',
                  padding: '0',
                  margin: '-1px',
                  overflow: 'hidden',
                  clip: 'rect(0, 0, 0, 0)',
                  whiteSpace: 'nowrap',
                  border: '0'
                }}>
                  Welcome to HYPHENING MEDIA, Seeker! Creative Operations & Marketing Performance Agency.
                </span>
                <span aria-hidden="true">
                  <EncryptedText
                    text="Welcome to HYPHENING MEDIA, Seeker!"
                    className="hero-welcome-title"
                    encryptedClassName="text-neutral-500"
                    revealedClassName="text-black"
                    revealDelayMs={50}
                    loop={true}
                    loopDelayMs={6000}
                  />
                </span>
              </h1>

              <p className="hero-desc">
                Every slice reveals a secret about us.
              </p>

              <button className="play-btn" onClick={(e) => { e.stopPropagation(); setGameMode(true); }} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
                <span>ENTER GAME MODE</span>
              </button>
            </div>
          </div>

          {/* Tutorial Card */}
          <div className="hero-card tutorial">
            <div className="card-label">
              HOW TO PLAY
            </div>

            <div className="steps">
              <div className="step">
                <div className="step-icon">
                  <Mouse size={20} strokeWidth={2.5} />
                </div>
                <p>Move mouse</p>
              </div>

              <div className="step">
                <div className="step-icon">
                  <Sword size={20} strokeWidth={2.5} style={{ transform: 'rotate(-45deg)' }} />
                </div>
                <p>Slice it</p>
              </div>

              <div className="step">
                <div className="step-icon">
                  <Bomb size={20} strokeWidth={2.5} />
                </div>
                <p>Avoid bombs</p>
              </div>
            </div>
          </div>

          {/* Score Card */}
          <div className="hero-card score-card">
            <span className="score-label">
              DISCOVERED
            </span>

            <div key={score} className={`score-number ${score > 0 ? "score-pop" : ""}`}>
              {score}
            </div>

            <p>Secrets Found</p>

            {/* Radio-style button to reveal a secret once score >= 3 */}
            <div className="reveal-secret-container" onClick={(e) => e.stopPropagation()}>
              <label className={`radio-label ${score >= 3 ? "active" : "disabled"}`}>
                <input
                  type="radio"
                  name="reveal-secret"
                  checked={revealSecretChecked}
                  disabled={score < 3}
                  onChange={() => {
                    if (score >= 3 && !revealSecretChecked) {
                      setRevealSecretChecked(true);
                      const secretIdx = Math.floor(Math.random() * COMPANY_SECRETS.length);
                      setUnlockedSecret(COMPANY_SECRETS[secretIdx]);
                    }
                  }}
                />
                <span className="radio-design"></span>
                <span className="radio-text">Reveal Secret</span>
              </label>
            </div>

            {/* Display the secret if unlocked and checked */}
            {revealSecretChecked && unlockedSecret && (
              <div className="unlocked-secret-box">
                <span className="unlocked-label">Hyphening Secret:</span>
                <p className="unlocked-text">{unlockedSecret}</p>
              </div>
            )}

            <span
              onClick={(e) => {
                e.stopPropagation();
                setScore(0);
                setRevealSecretChecked(false);
                setUnlockedSecret("");
              }}
              style={{
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#a855f7',
                marginTop: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              className="reset-score-trigger"
            >
              Reset Here
            </span>
          </div>
        </div>
      </section>

      {/* ===== Stats Bar ===== */}
      <div className="stats-bar">
        {STATS.map((s, i) => (
          <div className="stat-item" key={i}>
            <div className="stat-item-number">{s.number}</div>
            <div className="stat-item-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ===== Japanese Image ===== */}
      <div 
        id="our-story" 
        className="japanese-image-wrapper" 
        style={{ 
          width: '100%', 
          maxWidth: '1200px', 
          margin: '60px auto', 
          padding: '0 20px', 
          display: 'flex', 
          justifyContent: 'center',
          scrollMarginTop: '120px'
        }}
      >
        <img src={japaneseImg} alt="Japanese Art" style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
      </div>

      {/* ===== Capabilities ===== */}
      <section className="landing-section" id="capabilities">
        <div className="section-label"><Zap size={12} /> What We Do</div>
        <h2 className="section-heading">End-to-End Creative Operations</h2>
        <div className="cap-grid">
          {CAPABILITIES.map((cap, i) => (
            <CapCard key={i} {...cap} delay={i * 80} />
          ))}
        </div>
      </section>

      {/* ===== Portfolio ===== */}
      <section className="landing-section" id="portfolio">
        <div className="section-label"><TrendingUp size={12} /> Portfolio</div>
        <h2 className="section-heading">Results That Speak for Themselves</h2>
        <div className="portfolio-grid">
          {PORTFOLIO.map((p, i) => (
            <PortfolioCard key={i} {...p} delay={i * 100} />
          ))}
        </div>
      </section>

      {/* ===== Client Ticker ===== */}
      <div className="client-ticker-section">
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '32px' }}>
          <div className="section-label" style={{ margin: 0 }}>
            Trusted By Brands Like
          </div>
        </div>
        
        {/* Healthcare Row */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '16px' }}>
            <div className="section-label" style={{ fontSize: '0.65rem', opacity: 0.8, margin: 0 }}>
              Healthcare & Life Sciences
            </div>
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div className="ticker-track">
              {/* Duplicate for seamless loop */}
              {[...HEALTHCARE_CLIENTS, ...HEALTHCARE_CLIENTS].map((name, i) => (
                <span className="ticker-item" key={i}>
                  <span className="ticker-dot" style={{ background: '#3b82f6' }} />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* FnB Row */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '16px' }}>
            <div className="section-label" style={{ fontSize: '0.65rem', opacity: 0.8, margin: 0 }}>
              Food & Beverage (FnB)
            </div>
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div className="ticker-track" style={{ animationDirection: 'reverse' }}>
              {/* Duplicate for seamless loop */}
              {[...FNB_CLIENTS, ...FNB_CLIENTS].map((name, i) => (
                <span className="ticker-item" key={i}>
                  <span className="ticker-dot" style={{ background: '#eab308' }} />
                  {name}
                </span>
              ))}
        </div>
      </div>
    </div>
  </div>

      {/* ===== FAQ Section (SEO & AEO Optimized) ===== */}
      <section className="landing-section" id="faq" style={{ background: '#ffffff', borderTop: '3px solid #000000', borderBottom: '3px solid #000000', padding: '80px 24px', scrollMarginTop: '120px' }}>
        <div className="section-label"><Users size={12} style={{ marginRight: '6px' }} /> FAQ</div>
        <h2 className="section-heading">Frequently Asked Questions</h2>
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          maxWidth: '800px',
          margin: '40px auto 0 auto',
          textAlign: 'left'
        }}>
          {[
            {
              q: "What is Hyphening Media?",
              a: "Hyphening Media is a premium creative operations and marketing agency that scales D2C, F&B, and healthcare brands through data-driven content strategy, video production, social media operations, and full-stack web and app development."
            },
            {
              q: "What services does Hyphening Media offer?",
              a: "Hyphening Media offers comprehensive services including content strategy, short and long form video production, multi-platform social media operations, custom high-performance web development, mobile app development, performance analytics, conversion-optimized campaign management, visual brand identity development, and news media PR."
            },
            {
              q: "How does Hyphening Media scale D2C and F&B brands?",
              a: "Hyphening Media scales brands using a data-driven content engine, creator and influencer collaborations, and operational automation dashboards. We focus on real performance metrics like CTR, conversions, and organic views rather than vanity metrics."
            },
            {
              q: "Does Hyphening Media provide custom analytics and client portals?",
              a: "Yes, Hyphening Media provides all client partners with an automated secure Client Portal where they can review marketing scripts, track active video and design tasks in real-time, view platform-specific performance analytics, and manage creative campaigns."
            }
          ].map((item, idx) => (
            <div key={idx} className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ fontSize: '1.15rem', margin: 0, textTransform: 'none', letterSpacing: 'normal', fontFamily: 'var(--font-heading)', fontWeight: '800' }}>
                {item.q}
              </h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', fontWeight: 500 }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* JSON-LD Structured Data Schema for SEO & AEO */}
      <script 
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "FAQPage",
                "@id": "https://hyphening.com/#faq",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "What is Hyphening Media?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Hyphening Media is a premium creative operations and marketing agency that scales D2C, F&B, and healthcare brands through data-driven content strategy, video production, social media operations, and full-stack web and app development."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "What services does Hyphening Media offer?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Hyphening Media offers comprehensive services including content strategy, short and long form video production, multi-platform social media operations, custom high-performance web development, mobile app development, performance analytics, conversion-optimized campaign management, visual brand identity development, and news media PR."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "How does Hyphening Media scale D2C and F&B brands?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Hyphening Media scales brands using a data-driven content engine, creator and influencer collaborations, and operational automation dashboards. We focus on real performance metrics like CTR, conversions, and organic views rather than vanity metrics."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "Does Hyphening Media provide custom analytics and client portals?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Yes, Hyphening Media provides all client partners with an automated secure Client Portal where they can review marketing scripts, track active video and design tasks in real-time, view platform-specific performance analytics, and manage creative campaigns."
                    }
                  }
                ]
              },
              {
                "@type": "ProfessionalService",
                "@id": "https://hyphening.com/#organization",
                "name": "Hyphening Media",
                "url": "https://hyphening.com",
                "image": "https://hyphening.com/favicon.png",
                "address": {
                  "@type": "PostalAddress",
                  "addressLocality": "Mumbai",
                  "addressRegion": "Maharashtra",
                  "addressCountry": "IN"
                },
                "sameAs": [
                  "https://instagram.com/hyphening",
                  "https://linkedin.com/company/hyphening"
                ]
              }
            ]
          })
        }}
      />

      {/* ===== Footer CTA ===== */}
      <div className="landing-footer-cta" id="contact">
        <h2>Ready to Scale Your Brand?</h2>
        <p>
          Let's build a content engine that works while you sleep. Tell us about your brand 
          and we'll draft a custom 90-day growth plan.
        </p>

        {submitted ? (
          <div style={{
            background: '#ffffff',
            border: '3px solid #000000',
            padding: '40px 24px',
            borderRadius: '16px',
            boxShadow: '6px 6px 0px #000000',
            textAlign: 'center',
            marginTop: '32px'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase' }}>Thank You, {formData.name}!</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem', lineHeight: '1.5' }}>
              We have received your details. One of our creative operations leads will reach out to you within 24 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} style={{
            textAlign: 'left',
            marginTop: '32px',
            background: '#ffffff',
            border: '3px solid #000000',
            padding: '32px',
            borderRadius: '16px',
            boxShadow: '6px 6px 0px #000000',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000000' }}>Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="Enter your name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
                style={{ border: '3px solid #000000', padding: '12px 16px', borderRadius: '8px', width: '100%' }}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000000' }}>Email Address *</label>
              <input
                type="email"
                className="form-control"
                placeholder="name@company.com"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                required
                style={{ border: '3px solid #000000', padding: '12px 16px', borderRadius: '8px', width: '100%' }}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000000' }}>Company Name / Website</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Acme Agency"
                value={formData.company}
                onChange={e => setFormData({ ...formData, company: e.target.value })}
                style={{ border: '3px solid #000000', padding: '12px 16px', borderRadius: '8px', width: '100%' }}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000000' }}>What are your goals?</label>
              <textarea
                className="form-control"
                placeholder="What channels are you focused on? Tell us about your creative goals..."
                value={formData.message}
                onChange={e => setFormData({ ...formData, message: e.target.value })}
                rows="4"
                style={{ border: '3px solid #000000', padding: '12px 16px', borderRadius: '8px', width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', justifyContent: 'center', marginTop: '8px', fontSize: '1rem', fontWeight: 800 }}>
              Submit Details <ArrowRight size={16} />
            </button>
          </form>
        )}
      </div>

      <footer className="landing-footer-detailed">
        <div className="footer-grid">
          <div className="footer-col brand-col">
            <span className="footer-logo">
              <img src={logoImg} alt="Hyphening Media" style={{ height: '120px', width: 'auto', marginTop: '-15px', marginBottom: '-15px', filter: 'invert(1)' }} />
            </span>
            <p className="footer-desc">
              We design and scale creative operations for forward-thinking brands. 
              From content strategy to high-performance web development.
            </p>
          </div>
          
          <div className="footer-col links-col">
            <h4>Services</h4>
            <a href="#capabilities" onClick={(e) => { e.preventDefault(); document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' }); }}>What We Do</a>
            <a href="#portfolio" onClick={(e) => { e.preventDefault(); document.getElementById('portfolio')?.scrollIntoView({ behavior: 'smooth' }); }}>Portfolio</a>
            <a href="mailto:hello@hyphening.com">Contact Us</a>
          </div>
          
          <div className="footer-col social-col">
            <h4>Follow Us</h4>
            <div className="social-links">
              <a href="https://instagram.com/hyphening" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <InstagramIcon size={18} /> Instagram
              </a>
              <a href="https://linkedin.com/company/hyphening" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <LinkedinIcon size={18} /> LinkedIn
              </a>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} HYPHENING MEDIA. All rights reserved.</span>
          <span>Creative Operations Agency</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
