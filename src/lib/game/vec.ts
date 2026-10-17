// Tiny 2D maths on the ground plane. Keep allocation-light; the sim calls these every step.

export type Vec2 = { x: number; z: number };

export const vec = (x = 0, z = 0): Vec2 => ({ x, z });

export function add(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x + b.x, z: a.z + b.z };
}
export function sub(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x - b.x, z: a.z - b.z };
}
export function scale(a: Vec2, s: number): Vec2 {
	return { x: a.x * s, z: a.z * s };
}
export function len(a: Vec2): number {
	return Math.hypot(a.x, a.z);
}
export function dist(a: Vec2, b: Vec2): number {
	return Math.hypot(a.x - b.x, a.z - b.z);
}
/** Unit vector, or zero when the input is (near) zero so NaN never reaches Convex. */
export function norm(a: Vec2): Vec2 {
	const l = len(a);
	return l < 1e-6 ? { x: 0, z: 0 } : { x: a.x / l, z: a.z / l };
}
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
	return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}
/** Angle (radians) of the direction from a to b, measured on the x/z plane. */
export function angleTo(a: Vec2, b: Vec2): number {
	return Math.atan2(b.z - a.z, b.x - a.x);
}
export function fromAngle(theta: number, length = 1): Vec2 {
	return { x: Math.cos(theta) * length, z: Math.sin(theta) * length };
}
export function lerpAngle(a: number, b: number, t: number): number {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return a + d * t;
}
export function angleDiff(a: number, b: number): number {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}
export function clampToRect(p: Vec2, halfW: number, halfD: number, margin = 0): Vec2 {
	return {
		x: Math.min(halfW - margin, Math.max(-halfW + margin, p.x)),
		z: Math.min(halfD - margin, Math.max(-halfD + margin, p.z))
	};
}
export function isFinite2(p: Vec2): boolean {
	return Number.isFinite(p.x) && Number.isFinite(p.z);
}
