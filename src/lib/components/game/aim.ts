// Mouse -> ground plane (y = 0). Works for orthographic and perspective cameras.
import { Vector3, type Camera } from 'three';
import type { Vec2 } from '#lib/game/vec.js';

const near = new Vector3();
const far = new Vector3();

export function groundPointFromNdc(camera: Camera, ndc: { x: number; y: number }, out: Vec2): Vec2 {
	near.set(ndc.x, ndc.y, -1).unproject(camera);
	far.set(ndc.x, ndc.y, 1).unproject(camera);
	const dy = far.y - near.y;
	if (Math.abs(dy) < 1e-6) return out;
	const t = -near.y / dy;
	out.x = near.x + (far.x - near.x) * t;
	out.z = near.z + (far.z - near.z) * t;
	return out;
}
