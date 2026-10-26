/** 轻量粒子系统：法术汇聚 / 命中爆散 / 治疗 / 中毒 气泡。 */
import { Container, Graphics } from 'pixi.js';

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  grav: number;
  /** 收敛模式：朝目标点飞 */
  target?: { x: number; y: number };
  homing?: number;
}

export class Particles {
  readonly container = new Container();
  private list: Particle[] = [];

  /** 命中爆散 */
  burst(x: number, y: number, color: number, count = 12, speed = 0.16): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.add(x, y, color, Math.cos(a) * v, Math.sin(a) * v - 0.02, 0.00025, 480 + Math.random() * 260);
    }
  }

  /** 上升气泡（治疗/中毒） */
  rise(x: number, y: number, color: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const dx = (Math.random() - 0.5) * 46;
      this.add(x + dx, y + Math.random() * 10, color, (Math.random() - 0.5) * 0.02, -0.05 - Math.random() * 0.04, 0, 620 + Math.random() * 320);
    }
  }

  /** 法术汇聚：粒子从四周飞向施法者头顶 */
  gather(x: number, y: number, color: number, count = 14): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 44 + Math.random() * 30;
      const p = this.add(x + Math.cos(a) * d, y + Math.sin(a) * d, color, 0, 0, 0, 620 + Math.random() * 200);
      p.target = { x, y };
      p.homing = 0.09;
    }
  }

  private add(x: number, y: number, color: number, vx: number, vy: number, grav: number, life: number): Particle {
    const g = new Graphics();
    const r = 1.6 + Math.random() * 1.8;
    g.circle(0, 0, r).fill(color);
    g.x = x;
    g.y = y;
    this.container.addChild(g);
    const p: Particle = { g, vx, vy, life, maxLife: life, grav };
    this.list.push(p);
    return p;
  }

  update(dtMs: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dtMs;
      if (p.life <= 0) {
        p.g.destroy();
        this.list.splice(i, 1);
        continue;
      }
      if (p.target && p.homing) {
        p.vx += (p.target.x - p.g.x) * p.homing * (dtMs / 16);
        p.vy += (p.target.y - p.g.y) * p.homing * (dtMs / 16);
      }
      p.vy += p.grav * (dtMs / 16);
      p.g.x += p.vx * dtMs;
      p.g.y += p.vy * dtMs;
      p.g.alpha = Math.max(0, p.life / p.maxLife);
    }
  }

  clear(): void {
    for (const p of this.list) p.g.destroy();
    this.list = [];
  }
}
