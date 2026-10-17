// Title-screen fire: WebGL draws the parchment, flames and burn; a 2D canvas draws ash and embers.

type Rgb = [number, number, number];

export type Point = { x: number; y: number };

export type TitleFire = {
	/** Turns sampled letter pixels into drifting ash. */
	ashLetters: (points: Point[]) => void;
	/** Burns the page away, then calls done once the screen is clear. */
	burn: (done: () => void) => void;
	destroy: () => void;
};

type Options = {
	gl: HTMLCanvasElement;
	ash: HTMLCanvasElement;
	image: string;
	reducedMotion: boolean;
	/** Called once the parchment is drawn, so the plain fallback image can hide. */
	onready: () => void;
};

const BURN_MS = 2600;
const FIRE_FADE_MS = 700;
const SETTLE_MS = 1400;
const MAP_W = 96;
const MAP_H = 54;

// Reads a colour token from layout.css as 0–1 RGB.
function token(name: string, fallback: string): Rgb {
	const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgba([r, g, b]: Rgb, a: number) {
	return `rgb(${(r * 255) | 0} ${(g * 255) | 0} ${(b * 255) | 0} / ${a})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hash(x: number, y: number, seed: number) {
	let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number, seed: number) {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi));
	const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi));
	const top = hash(xi, yi, seed) + (hash(xi + 1, yi, seed) - hash(xi, yi, seed)) * u;
	const bottom = hash(xi, yi + 1, seed) + (hash(xi + 1, yi + 1, seed) - hash(xi, yi + 1, seed)) * u;
	return top + (bottom - top) * v;
}

function fbm(x: number, y: number, seed: number) {
	let sum = 0;
	let amp = 0.5;
	for (let i = 0; i < 4; i++) {
		sum += amp * noise(x * 2 ** i, y * 2 ** i, seed + i);
		amp *= 0.5;
	}
	return sum / 0.9375;
}

// When each patch of the page catches, from 0 (first) to 1 (last); row 0 is the top.
function igniteMap(seed: number) {
	const spots = Array.from({ length: 3 }, (_, i) => ({
		x: 0.2 + hash(i, 1, seed) * 0.6,
		y: 0.25 + hash(i, 2, seed) * 0.4,
		t: 0.25 + hash(i, 3, seed) * 0.2
	}));
	const map = new Float32Array(MAP_W * MAP_H);
	for (let j = 0; j < MAP_H; j++) {
		for (let i = 0; i < MAP_W; i++) {
			const x = i / (MAP_W - 1);
			const y = j / (MAP_H - 1);
			let t = (1 - y) * 0.7 + fbm(x * 4, y * 4, seed) * 0.4;
			for (const s of spots) t = Math.min(t, s.t + Math.hypot(x - s.x, (y - s.y) * 0.6) * 1.4);
			map[j * MAP_W + i] = t;
		}
	}
	let lo = Infinity;
	let hi = -Infinity;
	for (const t of map) {
		lo = Math.min(lo, t);
		hi = Math.max(hi, t);
	}
	for (let k = 0; k < map.length; k++) map[k] = (map[k] - lo) / (hi - lo);
	return map;
}

const vertex = `
attribute vec2 p;
varying vec2 vUv;
void main() {
	vUv = p * 0.5 + 0.5;
	gl_Position = vec4(p, 0.0, 1.0);
}`;

const fragment = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uIgnite;
uniform vec2 uRes;
uniform vec2 uImageSize;
uniform float uTime;
uniform float uProgress;
uniform float uFireHeight;
uniform float uFireFade;
uniform vec3 uChar;
uniform vec3 uEmber;
uniform vec3 uFlame;
uniform vec3 uCore;

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 5; i++) {
		s += a * noise(p);
		p = p * 2.03 + 17.1;
		a *= 0.5;
	}
	return s;
}

void main() {
	vec2 px = vUv * uRes;

	// Parchment, scaled to cover the screen
	float scale = max(uRes.x / uImageSize.x, uRes.y / uImageSize.y);
	vec2 imgUv = (px - (uRes - uImageSize * scale) * 0.5) / (uImageSize * scale);
	vec3 paper = texture2D(uImage, imgUv).rgb;

	// Burn front: chars ahead of the edge, glows on it, clears behind it
	float pageA = 1.0;
	vec3 glow = vec3(0.0);
	if (uProgress > -0.15) {
		float d = texture2D(uIgnite, vUv).r + (fbm(px / 40.0) - 0.5) * 0.08 - uProgress;
		pageA = smoothstep(-0.004, 0.002, d);
		paper = mix(paper, uChar, (1.0 - smoothstep(0.0, 0.12, d)) * 0.92);
		float edge = 1.0 - smoothstep(0.0, 0.025, d);
		float flicker = 0.7 + 0.6 * noise(px / 18.0 + uTime * 6.0);
		glow = mix(uFlame, uCore, edge) * edge * flicker * 1.6;
	}

	// Flames along the bottom, taller at the corners
	float y = vUv.y;
	float side = abs(vUv.x - 0.5) * 2.0;
	float height = uFireHeight * (0.6 + 0.8 * side * side);
	paper *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, height * 1.6, y)) * uFireFade;
	float fireA = 0.0;
	vec3 fire = vec3(0.0);
	if (y < height * 1.8) {
		vec2 q = vec2(vUv.x * uRes.x / uRes.y * 3.2, y * 2.4 - uTime * 1.1);
		float n = fbm(q + vec2(fbm(q * 1.6 + uTime * 0.4) - 0.5, 0.0) * 0.9);
		float h = height * (0.7 + 0.7 * noise(vec2(vUv.x * 6.0, uTime * 0.5)));
		float heat = clamp((n * 1.35 - y / h) * 2.4, 0.0, 1.0);
		fire = mix(uEmber, uFlame, smoothstep(0.15, 0.6, heat));
		fire = mix(fire, uCore, smoothstep(0.75, 1.0, heat)) * 1.2;
		fireA = smoothstep(0.02, 0.4, heat) * uFireFade;
	}

	vec3 page = (paper + glow) * pageA;
	gl_FragColor = vec4(page * (1.0 - fireA) + fire * fireA, pageA * (1.0 - fireA) + fireA);
}`;

type Flake = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	life: number;
	size: number;
	spin: number;
	rot: number;
	seed: number;
	/** Glowing spark rather than grey ash. */
	ember: boolean;
};

function compile(gl: WebGLRenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error(gl.getShaderInfoLog(shader));
		return null;
	}
	return shader;
}

function setupGl(canvas: HTMLCanvasElement) {
	const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
	if (!gl) return null;
	const vs = compile(gl, gl.VERTEX_SHADER, vertex);
	const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
	const program = gl.createProgram();
	if (!vs || !fs || !program) return null;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
	gl.useProgram(program);

	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	const p = gl.getAttribLocation(program, 'p');
	gl.enableVertexAttribArray(p);
	gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

	const uniform = (name: string) => gl.getUniformLocation(program, name);
	return { gl, uniform };
}

function texture(gl: WebGLRenderingContext, unit: number) {
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** Starts the title-screen fire. Returns null when WebGL is unavailable. */
export function createTitleFire({
	gl: glCanvas,
	ash,
	image,
	reducedMotion,
	onready
}: Options): TitleFire | null {
	const setup = setupGl(glCanvas);
	const ctx = ash.getContext('2d');
	if (!setup || !ctx) return null;
	const { gl, uniform } = setup;

	const colors = {
		char: token('--color-ink', '#0c0a08'),
		ember: token('--color-crimson', '#9e1b1b'),
		flame: token('--color-flame', '#f0761e'),
		core: token('--color-gold-3', '#ecd08a'),
		ash: token('--color-ash', '#7f7462'),
		soot: token('--color-surface-2', '#29211a')
	};
	gl.uniform3fv(uniform('uChar'), colors.char);
	gl.uniform3fv(uniform('uEmber'), colors.ember);
	gl.uniform3fv(uniform('uFlame'), colors.flame);
	gl.uniform3fv(uniform('uCore'), colors.core);
	gl.uniform1i(uniform('uImage'), 0);
	gl.uniform1i(uniform('uIgnite'), 1);

	const seed = (Math.random() * 1000) | 0;
	const ignite = igniteMap(seed);
	texture(gl, 1);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.LUMINANCE,
		MAP_W,
		MAP_H,
		0,
		gl.LUMINANCE,
		gl.UNSIGNED_BYTE,
		Uint8Array.from(ignite, (t) => Math.round(t * 255))
	);

	let loaded = false;
	const img = new Image();
	img.onload = () => {
		texture(gl, 0);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
		gl.uniform2f(uniform('uImageSize'), img.naturalWidth, img.naturalHeight);
		loaded = true;
	};
	img.src = image;

	// Sizes both canvases to the screen; the GL pass runs at lower density to stay smooth.
	let w = 0;
	let h = 0;
	let scale = 1;
	const resize = () => {
		w = window.innerWidth;
		h = window.innerHeight;
		const glScale = Math.min(window.devicePixelRatio, 1.5);
		glCanvas.width = Math.round(w * glScale);
		glCanvas.height = Math.round(h * glScale);
		gl.viewport(0, 0, glCanvas.width, glCanvas.height);
		gl.uniform2f(uniform('uRes'), glCanvas.width, glCanvas.height);
		scale = Math.min(window.devicePixelRatio, 2);
		ash.width = Math.round(w * scale);
		ash.height = Math.round(h * scale);
	};
	resize();
	window.addEventListener('resize', resize);

	const flakes: Flake[] = [];
	const spawn = (x: number, y: number, ember: boolean, size: number) => {
		if (flakes.length > 6000) return;
		flakes.push({
			x,
			y,
			vx: 0.015 + Math.random() * 0.06,
			vy: -(0.03 + Math.random() * 0.09),
			age: 0,
			life: 1200 + Math.random() * 1600,
			size,
			spin: (Math.random() - 0.5) * 0.012,
			rot: Math.random() * Math.PI,
			seed: Math.random() * 100,
			ember
		});
	};

	let burnStart = -1;
	let burnDone: (() => void) | null = null;
	const caught = new Uint8Array(MAP_W * MAP_H);
	let start = -1;
	let last = 0;
	let frame = 0;
	let ready = false;

	const tick = (now: number) => {
		frame = requestAnimationFrame(tick);
		if (start < 0) start = now;
		const dt = Math.min(now - last || 16, 50);
		last = now;
		const time = reducedMotion ? 0 : (now - start) / 1000;

		// Burn progress and the flame surge that goes with it
		let progress = -0.2;
		let fireHeight = 0.2;
		let fireFade = 1;
		if (burnStart >= 0) {
			const k = Math.min((now - burnStart) / BURN_MS, 1);
			progress = -0.05 + k * k * 1.2;
			fireHeight = 0.2 + Math.sin(Math.min(k * 1.3, 1) * Math.PI * 0.5) * 0.7;
			fireFade = 1 - Math.min(Math.max((now - burnStart - BURN_MS) / FIRE_FADE_MS, 0), 1);

			// Ash breaks off each patch of page as the edge passes it
			for (let cell = 0; cell < caught.length; cell++) {
				if (caught[cell] || ignite[cell] > progress) continue;
				caught[cell] = 1;
				const cx = ((cell % MAP_W) + Math.random()) / MAP_W;
				const cy = (Math.floor(cell / MAP_W) + Math.random()) / MAP_H;
				spawn(cx * w, cy * h, Math.random() < 0.3, 2 + Math.random() * 4);
				if (Math.random() < 0.5) spawn(cx * w, cy * h, false, 1.5 + Math.random() * 3);
			}

			if (burnDone && now - burnStart > BURN_MS + FIRE_FADE_MS + SETTLE_MS) {
				const done = burnDone;
				burnDone = null;
				done();
			}
		}

		if (loaded) {
			gl.uniform1f(uniform('uTime'), time);
			gl.uniform1f(uniform('uProgress'), progress);
			gl.uniform1f(uniform('uFireHeight'), fireHeight);
			gl.uniform1f(uniform('uFireFade'), fireFade);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			if (!ready) {
				ready = true;
				onready();
			}
		}

		// Sparks rising off the base fire
		if (!reducedMotion && fireFade > 0 && Math.random() < 0.45 * fireFade) {
			spawn(Math.random() * w, h + 4, true, 1 + Math.random() * 2);
		}

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, ash.width, ash.height);
		for (let i = flakes.length - 1; i >= 0; i--) {
			const f = flakes[i];
			f.age += dt;
			if (f.age >= f.life || f.y < -20) {
				flakes[i] = flakes[flakes.length - 1];
				flakes.pop();
				continue;
			}
			const t = f.age / f.life;
			f.vy -= 0.00004 * dt;
			f.x += (f.vx + Math.sin(f.seed + f.age * 0.004) * 0.04) * dt;
			f.y += f.vy * dt;
			f.rot += f.spin * dt;

			// Embers cool from gold to flame to ash; flakes go from soot to ash
			const color = f.ember
				? t < 0.3
					? mix(colors.core, colors.flame, t / 0.3)
					: mix(colors.flame, colors.ash, Math.min((t - 0.3) / 0.4, 1))
				: mix(colors.soot, colors.ash, Math.min(t * 1.5, 1));
			ctx.globalCompositeOperation = f.ember && t < 0.6 ? 'lighter' : 'source-over';
			ctx.fillStyle = rgba(color, (1 - t) ** 1.5);
			// Flakes tumble by squashing as they turn
			const flutter = Math.abs(Math.cos(f.rot));
			const cos = Math.cos(f.rot) * scale;
			const sin = Math.sin(f.rot) * scale;
			ctx.setTransform(cos, sin, -sin, cos, f.x * scale, f.y * scale);
			ctx.fillRect(-f.size / 2, (-f.size * flutter) / 2, f.size, Math.max(f.size * flutter, 0.6));
		}
		ctx.globalCompositeOperation = 'source-over';
	};
	frame = requestAnimationFrame(tick);

	return {
		ashLetters(points) {
			for (const p of points) spawn(p.x, p.y, Math.random() < 0.35, 1 + Math.random() * 2);
		},
		burn(done) {
			burnStart = performance.now();
			burnDone = done;
		},
		destroy() {
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', resize);
			gl.getExtension('WEBGL_lose_context')?.loseContext();
		}
	};
}

/** Finds the pixels each letter covers on screen, so the ash leaves in the letter's shape. */
export function sampleLetters(letters: HTMLElement[], step = 2): Point[] {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return [];
	const points: Point[] = [];
	for (const el of letters) {
		const style = getComputedStyle(el);
		const text =
			style.textTransform === 'uppercase'
				? (el.textContent ?? '').toUpperCase()
				: (el.textContent ?? '');
		if (!text.trim()) continue;
		const rect = el.getBoundingClientRect();
		const pad = Math.ceil(parseFloat(style.fontSize) * 0.3);
		canvas.width = Math.ceil(rect.width) + pad * 2;
		canvas.height = Math.ceil(rect.height) + pad * 2;
		ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		ctx.textBaseline = 'alphabetic';
		ctx.fillText(text, pad, pad + ctx.measureText(text).fontBoundingBoxAscent);
		const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
		for (let y = 0; y < canvas.height; y += step) {
			for (let x = 0; x < canvas.width; x += step) {
				if (data[(y * canvas.width + x) * 4 + 3] > 128) {
					points.push({ x: rect.left - pad + x, y: rect.top - pad + y });
				}
			}
		}
	}
	return points;
}
