/** 极简补间动画器：进度回调式，由渲染器每帧驱动 update(dtMs)。 */
export type Ease = (t: number) => number;

export const easeOut: Ease = (t) => 1 - (1 - t) * (1 - t);
export const easeInOut: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

interface Tween {
  elapsed: number;
  dur: number;
  ease: Ease;
  apply: (progress: number) => void;
  done?: () => void;
}

export class Tweens {
  private list: Tween[] = [];

  add(dur: number, apply: (progress: number) => void, opts: { ease?: Ease; done?: () => void } = {}): void {
    this.list.push({ elapsed: 0, dur, ease: opts.ease ?? easeOut, apply, done: opts.done });
  }

  update(dtMs: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.elapsed += dtMs;
      const p = Math.min(1, tw.elapsed / tw.dur);
      tw.apply(tw.ease(p));
      if (p >= 1) {
        this.list.splice(i, 1);
        tw.done?.();
      }
    }
  }

  clear(): void {
    this.list = [];
  }
}
