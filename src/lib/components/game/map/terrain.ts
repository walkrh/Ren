// Procedural pixel textures and prop layout for the arena. Seeded, so every client draws
// the same map. Purely visual: nothing here collides; the sim only knows the ARENA rect.
//
// The arena is an old crossroads, years into the blackout. The Agarthans etched the sacred
// timeline into the intersection; Overlord extraction veins creep in from the north.
import {
	CanvasTexture,
	LinearMipmapLinearFilter,
	NearestFilter,
	RepeatWrapping,
	SRGBColorSpace
} from 'three';
import { createRng, type Rng } from '#lib/game/rng.js';

export const MAP_SEED = 2069;
/** Texels per arena unit. Low on purpose: the floor reads as chunky pixel art. */
const PX = 8;

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [
	parseInt(h.slice(1, 3), 16),
	parseInt(h.slice(3, 5), 16),
	parseInt(h.slice(5, 7), 16)
];

class Pixels {
	readonly data: Uint8ClampedArray<ArrayBuffer>;
	constructor(
		readonly w: number,
		readonly h: number
	) {
		this.data = new Uint8ClampedArray(w * h * 4);
	}
	set(x: number, y: number, c: Rgb) {
		x = Math.round(x);
		y = Math.round(y);
		if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
		const i = (y * this.w + x) * 4;
		this.data[i] = c[0];
		this.data[i + 1] = c[1];
		this.data[i + 2] = c[2];
		this.data[i + 3] = 255;
	}
	fill(c: Rgb) {
		for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c);
	}
	disc(cx: number, cy: number, r: number, pick: (d: number) => Rgb | null) {
		for (let y = Math.floor(cy - r); y <= cy + r; y++)
			for (let x = Math.floor(cx - r); x <= cx + r; x++) {
				const d = Math.hypot(x - cx, y - cy) / r;
				if (d > 1) continue;
				const c = pick(d);
				if (c) this.set(x, y, c);
			}
	}
	ring(cx: number, cy: number, r: number, c: Rgb) {
		const steps = Math.ceil(r * 8);
		for (let i = 0; i < steps; i++) {
			const a = (i / steps) * Math.PI * 2;
			this.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
		}
	}
	line(x0: number, y0: number, x1: number, y1: number, c: Rgb) {
		const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
		for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
	}
	texture(repeat = false) {
		const canvas = document.createElement('canvas');
		canvas.width = this.w;
		canvas.height = this.h;
		canvas.getContext('2d')!.putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
		const t = new CanvasTexture(canvas);
		t.colorSpace = SRGBColorSpace;
		t.magFilter = NearestFilter;
		t.minFilter = LinearMipmapLinearFilter;
		if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
		return t;
	}
}

const EARTH = ['#4a4136', '#453d33', '#4f463a', '#40392f'].map(hex);
const ASPHALT = ['#3a3836', '#3e3c39', '#363432'].map(hex);
const CURB = hex('#5c5a55');
const PAINT = hex('#8f7838');
const CRACK = hex('#24221f');
const SCORCH = hex('#25211c');
const CHIP = hex('#5e584f');
const TRENCH = hex('#3e1a14');
const VEIN = hex('#b8281a');
const ETCH = hex('#5c4b22');
const SIGIL = hex('#8a6a1e');

const shade = (rng: Rng, palette: Rgb[]) =>
	rng.chance(0.7) ? palette[0] : palette[rng.int(1, palette.length - 1)];

/** Arena floor: a colour map and a matching emissive map for the glowing lines. */
export function arenaFloor(halfWidth: number, halfDepth: number) {
	const rng = createRng(MAP_SEED);
	const w = halfWidth * 2 * PX;
	const h = halfDepth * 2 * PX;
	const color = new Pixels(w, h);
	const glow = new Pixels(w, h);
	glow.fill([0, 0, 0]);
	const cx = w / 2;
	const cy = h / 2;

	// Dirt over everything, then the crossroads on top.
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) color.set(x, y, shade(rng, EARTH));
	const road = 3 * PX;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const inH = Math.abs(y - cy) < road;
			const inV = Math.abs(x - cx) < road;
			if (!inH && !inV) continue;
			// Ragged edges where the asphalt has broken up.
			const edge = Math.min(
				inH ? road - Math.abs(y - cy) : Infinity,
				inV ? road - Math.abs(x - cx) : Infinity
			);
			if (edge < 2 && rng.chance(0.45)) continue;
			color.set(x, y, edge < 1.5 && rng.chance(0.6) ? CURB : shade(rng, ASPHALT));
		}
	// Faded centre lines, with gaps where the paint is gone.
	for (let i = 0; i < w; i += 4 * PX) {
		if (Math.abs(i - cx) < road * 1.5 || rng.chance(0.3)) continue;
		for (let j = 0; j < 2 * PX; j++) {
			if (rng.chance(0.25)) continue;
			color.set(i + j, cy, PAINT);
			color.set(cx, i + j, PAINT);
		}
	}

	// Cracks: short random walks.
	for (let n = 0; n < 70; n++) {
		let x = rng.range(0, w);
		let y = rng.range(0, h);
		let a = rng.range(0, Math.PI * 2);
		for (let s = rng.int(6, 24); s > 0; s--) {
			color.set(x, y, CRACK);
			a += rng.range(-0.7, 0.7);
			x += Math.cos(a);
			y += Math.sin(a);
		}
	}

	// Blast scars from the collapse, kept off the centre.
	for (let n = 0; n < 9; n++) {
		const x = rng.range(4, 44) * PX;
		const y = rng.range(4, 44) * PX;
		if (Math.hypot(x - cx, y - cy) < 8 * PX) continue;
		color.disc(x, y, rng.range(1.2, 2.4) * PX, (d) =>
			d < 0.55 || rng.chance(1 - d) ? SCORCH : null
		);
	}
	for (let n = 0; n < 500; n++) color.set(rng.range(0, w), rng.range(0, h), CHIP);

	// Overlord extraction veins: burnt trenches from the north wall with a red-hot core.
	for (let n = 0; n < 5; n++) {
		const branches = [{ x: rng.range(0.1, 0.9) * w, y: 0, a: Math.PI / 2, life: rng.int(50, 100) }];
		while (branches.length) {
			const b = branches.pop()!;
			for (; b.life > 0; b.life--) {
				color.disc(b.x, b.y, 1.5, () => TRENCH);
				glow.set(b.x, b.y, VEIN);
				b.a += rng.range(-0.35, 0.35);
				b.a = Math.min(Math.PI * 0.85, Math.max(Math.PI * 0.15, b.a));
				b.x += Math.cos(b.a);
				b.y += Math.sin(b.a);
				if (rng.chance(0.015))
					branches.push({ x: b.x, y: b.y, a: b.a + rng.range(-1, 1), life: b.life * 0.5 });
			}
		}
	}

	// The sacred timeline: a clock-ring of twelve marks with one unbroken line through it.
	for (const r of [4 * PX, 3.4 * PX, 1 * PX]) {
		color.ring(cx, cy, r, ETCH);
		glow.ring(cx, cy, r, SIGIL);
	}
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		const c = Math.cos(a);
		const s = Math.sin(a);
		const x0 = cx + c * 3.5 * PX;
		const y0 = cy + s * 3.5 * PX;
		const x1 = cx + c * 3.9 * PX;
		const y1 = cy + s * 3.9 * PX;
		color.line(x0, y0, x1, y1, ETCH);
		glow.line(x0, y0, x1, y1, SIGIL);
	}
	color.line(cx - 6 * PX, cy, cx + 6 * PX, cy, ETCH);
	glow.line(cx - 6 * PX, cy, cx + 6 * PX, cy, SIGIL);

	return { map: color.texture(), emissiveMap: glow.texture() };
}

/** Tiling wasteland for everything outside the walls. */
export function wasteland(repeat: number) {
	const rng = createRng(MAP_SEED + 1);
	const size = 64;
	const p = new Pixels(size, size);
	const dirt = ['#2e2a24', '#2b2722', '#312c26', '#28241f'].map(hex);
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) p.set(x, y, shade(rng, dirt));
	for (let n = 0; n < 40; n++) p.set(rng.int(0, size - 1), rng.int(0, size - 1), hex('#38332c'));
	const t = p.texture(true);
	t.repeat.set(repeat, repeat);
	return t;
}

export type Block = {
	x: number;
	z: number;
	/** along the wall */
	len: number;
	h: number;
	/** wall thickness */
	t: number;
	rotY: number;
	color: string;
};

const RUBBLE = ['#5f5e58', '#6b6a63', '#55534d', '#6e4a32', '#5a3c2a', '#3f3f3b'];

/**
 * The barricade ring: concrete slabs and scrap sheets, inner face flush with the arena edge.
 * The south side stays low so it never hides players from the camera.
 */
export function barricade(halfWidth: number, halfDepth: number): Block[] {
	const rng = createRng(MAP_SEED + 2);
	const out: Block[] = [];
	const side = (
		length: number,
		place: (along: number, t: number) => { x: number; z: number },
		alongX: boolean,
		maxH: number
	) => {
		for (let s = -length - 1; s < length + 1;) {
			const len = rng.range(1.4, 3);
			const t = rng.range(0.5, 0.9);
			const scrap = rng.chance(0.25);
			const at = place(s + len / 2, t);
			out.push({
				x: at.x,
				z: at.z,
				len: alongX ? len : t,
				t: alongX ? t : len,
				h: scrap ? rng.range(0.9, maxH) : rng.range(0.8, maxH * 0.8),
				rotY: rng.range(-0.06, 0.06),
				color: scrap ? RUBBLE[rng.int(3, 4)] : RUBBLE[rng.int(0, 2)]
			});
			s += len - 0.1;
		}
	};
	side(halfWidth, (a, t) => ({ x: a, z: -halfDepth - t / 2 }), true, 1.9);
	side(halfWidth, (a, t) => ({ x: a, z: halfDepth + t / 2 }), true, 1.1);
	side(halfDepth, (a, t) => ({ x: -halfWidth - t / 2, z: a }), false, 1.7);
	side(halfDepth, (a, t) => ({ x: halfWidth + t / 2, z: a }), false, 1.7);
	return out;
}

/** Loose debris just outside the walls so the edge of the world is not a hard line. */
export function debris(halfWidth: number, halfDepth: number, count: number) {
	const rng = createRng(MAP_SEED + 3);
	const out: { x: number; z: number; s: number; rotY: number; color: string }[] = [];
	while (out.length < count) {
		const x = rng.range(-halfWidth - 14, halfWidth + 14);
		const z = rng.range(-halfDepth - 12, halfDepth + 12);
		if (Math.abs(x) < halfWidth + 1.5 && Math.abs(z) < halfDepth + 1.5) continue;
		out.push({
			x,
			z,
			s: rng.range(0.2, 0.6),
			rotY: rng.range(0, Math.PI),
			color: rng.pick(RUBBLE)
		});
	}
	return out;
}
