// Smooths remote entities from a ~5-12 Hz network rate up to the render rate.
// Samples are stamped with local receive time, so no clock sync is needed.

export type Snapshot = { t: number; x: number; z: number; facing: number };

const MAX_EXTRAPOLATE_MS = 100;

export class SnapshotBuffer {
	private buf: Snapshot[] = [];
	constructor(
		private readonly delayMs: number,
		private readonly capacity = 6
	) {}

	push(s: Snapshot) {
		// Seed two identical samples so a fresh entity does not slide in from the origin.
		if (this.buf.length === 0) this.buf.push({ ...s, t: s.t - this.delayMs });
		this.buf.push(s);
		if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity);
	}

	get latest(): Snapshot | null {
		return this.buf[this.buf.length - 1] ?? null;
	}

	sample(nowMs: number): Snapshot {
		const buf = this.buf;
		const renderT = nowMs - this.delayMs;
		if (buf.length === 0) return { t: renderT, x: 0, z: 0, facing: 0 };
		const last = buf[buf.length - 1];
		if (renderT >= last.t) {
			// Past the newest sample: extrapolate briefly along the last velocity, then hold.
			if (buf.length < 2) return last;
			const prev = buf[buf.length - 2];
			const dt = last.t - prev.t;
			if (dt <= 0) return last;
			const ahead = Math.min(renderT - last.t, MAX_EXTRAPOLATE_MS) / dt;
			return {
				t: renderT,
				x: last.x + (last.x - prev.x) * ahead,
				z: last.z + (last.z - prev.z) * ahead,
				facing: last.facing
			};
		}
		for (let i = buf.length - 1; i > 0; i--) {
			const a = buf[i - 1];
			const b = buf[i];
			if (renderT >= a.t) {
				const span = b.t - a.t;
				const u = span <= 0 ? 1 : (renderT - a.t) / span;
				return {
					t: renderT,
					x: a.x + (b.x - a.x) * u,
					z: a.z + (b.z - a.z) * u,
					facing: lerpAngle(a.facing, b.facing, u)
				};
			}
		}
		return buf[0];
	}
}

function lerpAngle(a: number, b: number, t: number) {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return a + d * t;
}
