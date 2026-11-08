/**
 * 浏览器音频层：纯 Web Audio 合成，零素材文件。
 * - BGM：三档场景（选人 / 世界 / 战斗）按 BGM_INTERVAL 循环五声音阶；
 * - 音效：由 core/audio-map.ts 的事件映射驱动；
 * - 自动播放策略：首次用户手势才创建/恢复 AudioContext；
 * - 静音偏好持久化到 localStorage['shanhai-audio-muted']。
 */
import { BGM_INTERVAL, sfxForEvent, type SfxName } from '../core/audio-map';
import type { BattleEvent } from '../core/types';

export type AudioScene = 'setup' | 'world' | 'battle';

const MUTE_KEY = 'shanhai-audio-muted';
const MASTER_VOLUME = 0.18;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private scene: AudioScene = 'setup';
  private bgmTimer: number | null = null;
  private step = 0;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 隐私模式 */ }
  }

  isMuted(): boolean { return this.muted; }

  /** 首次用户手势调用；已创建但被挂起时恢复 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
      if (!this.muted) this.startBgm();
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  setMuted(v: boolean): void {
    this.muted = v;
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(v ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.02);
    }
    if (v) this.stopBgm();
    else this.startBgm();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setScene(scene: AudioScene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.step = 0;
    if (!this.muted && this.ctx) this.startBgm();
  }

  /** 供 UI 按钮/面板点击使用 */
  play(name: SfxName): void {
    switch (name) {
      case 'click': this.tone(660, 0.06, 'sine', 0.22); break;
      case 'attack': this.noise(0.09, 0.22); this.tone(180, 0.09, 'square', 0.18, 90); break;
      case 'cast': this.tone(330, 0.32, 'sine', 0.28, 880); break;
      case 'hit': this.noise(0.12, 0.28); this.tone(120, 0.12, 'sawtooth', 0.16, 60); break;
      case 'heal': this.arp([523, 659, 784], 0.07, 0.16, 'sine', 0.22); break;
      case 'status': this.tone(440, 0.22, 'triangle', 0.18, 220); break;
      case 'death': this.tone(220, 0.45, 'sawtooth', 0.20, 70); break;
      case 'catch': this.arp([523, 659, 784, 1046], 0.09, 0.18, 'sine', 0.24); break;
      case 'item': this.tone(700, 0.12, 'sine', 0.20, 900); break;
      case 'victory': this.arp([392, 523, 659, 784], 0.11, 0.24, 'triangle', 0.26); break;
      case 'defeat': this.arp([392, 330, 262, 196], 0.14, 0.28, 'sawtooth', 0.20); break;
    }
  }

  /** 事件流驱动：映射为空的事件不发声 */
  playEvent(ev: BattleEvent): void {
    const sfx = sfxForEvent(ev);
    if (sfx) this.play(sfx);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  private arp(freqs: number[], gap: number, dur: number, type: OscillatorType, vol: number): void {
    freqs.forEach((f, i) => window.setTimeout(() => this.tone(f, dur, type, vol), i * gap * 1000));
  }

  private startBgm(): void {
    this.stopBgm();
    if (!this.ctx || this.muted) return;
    this.bgmTimer = window.setInterval(() => this.bgmStep(), BGM_INTERVAL[this.scene]);
  }

  private stopBgm(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private bgmStep(): void {
    if (!this.ctx || this.muted) return;
    const scale = this.scene === 'battle'
      ? [196.00, 233.08, 261.63, 293.66, 349.23, 392.00]
      : [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const i = this.step++ % scale.length;
    const f = scale[i];
    const battle = this.scene === 'battle';
    this.tone(f, battle ? 0.20 : 0.34, battle ? 'square' : 'triangle', battle ? 0.08 : 0.07);
    if (battle && i % 2 === 0) this.tone(f / 2, 0.18, 'sine', 0.09);
  }
}

export const audio = new AudioEngine();
