import type { Img } from './recognizer';

/** Fractions (0..1) of the shared video frame, so a region survives the stream being resized. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BOARD_PX = 256; // the board is rescaled to 256x256 (32px per square) before recognition

export class Capture {
  readonly video = document.createElement('video');
  private stream: MediaStream | null = null;
  private work = document.createElement('canvas');
  private frame = document.createElement('canvas');

  constructor() {
    this.video.muted = true;
    this.video.playsInline = true;
    this.work.width = BOARD_PX;
    this.work.height = BOARD_PX;
  }

  get active() {
    return this.stream !== null && this.video.videoWidth > 0;
  }

  async start(onEnded: () => void) {
    // `cursor` is missing from TypeScript's DOM types; browsers that ignore it still record the cursor,
    // which the recognizer and tracker are built to tolerate.
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10, cursor: 'never' } as MediaTrackConstraints,
      audio: false,
    });
    this.stream.getVideoTracks()[0].addEventListener('ended', () => {
      this.stop();
      onEnded();
    });
    this.video.srcObject = this.stream;
    // Do not wait for the first frame: play() only resolves once one arrives, and a static window can take
    // a while. `active` turns true by itself as soon as the video has a size.
    void this.video.play().catch(() => {});
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  /** The whole shared frame, scaled down to at most `maxWidth` pixels wide (for finding the board). */
  grabFrame(maxWidth = 800): Img | null {
    if (!this.active) return null;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const scale = Math.min(1, maxWidth / vw);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    if (this.frame.width !== w || this.frame.height !== h) {
      this.frame.width = w;
      this.frame.height = h;
    }
    const ctx = this.frame.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.video, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  /** Crops the region out of the current frame and returns it at 256x256. */
  grabBoard(region: Region): Img | null {
    if (!this.active) return null;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const ctx = this.work.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(
      this.video,
      region.x * vw,
      region.y * vh,
      region.w * vw,
      region.h * vh,
      0,
      0,
      BOARD_PX,
      BOARD_PX,
    );
    return ctx.getImageData(0, 0, BOARD_PX, BOARD_PX);
  }
}
