// Keyboard/pointer capture for the game canvas. DOM only, no runes, no Three.
// The aim point is written by the render layer (it needs the camera) before each tick.
import type { HotbarSlot } from './data/items.js';
import { norm, type Vec2 } from './vec.js';
import type { InputFrame } from './sim.js';

const SLOT_KEYS: Record<string, HotbarSlot> = {
	Digit1: 'main',
	Digit2: 'melee',
	Digit3: 'ability'
};

export class InputController {
	/** normalised device coords of the pointer, -1..1 */
	ndc = { x: 0, y: 0 };
	/** ground point under the pointer, set by the aim task */
	aim: Vec2 = { x: 0, z: 0 };

	private held = new Set<string>();
	private fireHeld = false;
	private meleeEdge = false;
	private reloadEdge = false;
	private abilityEdge = false;
	private slotEdge: HotbarSlot | null = null;
	private el: HTMLElement | null = null;
	private cleanup: (() => void)[] = [];

	attach(el: HTMLElement) {
		this.detach();
		this.el = el;
		const on = <K extends keyof WindowEventMap>(
			target: Window | HTMLElement,
			type: K,
			fn: (e: WindowEventMap[K]) => void
		) => {
			target.addEventListener(type, fn as EventListener);
			this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
		};
		on(window, 'keydown', (e) => {
			if (e.repeat) return;
			if (isTyping(e)) return;
			this.held.add(e.code);
			if (e.code === 'KeyR') this.reloadEdge = true;
			if (e.code === 'Space') {
				this.abilityEdge = true;
				e.preventDefault();
			}
			if (e.code === 'KeyF') this.meleeEdge = true;
			const slot = SLOT_KEYS[e.code];
			if (slot) this.slotEdge = slot;
		});
		on(window, 'keyup', (e) => this.held.delete(e.code));
		on(window, 'blur', () => this.clear());
		on(window, 'pointerup', (e) => {
			if (e.button === 0) this.fireHeld = false;
		});
		on(el, 'pointermove', (e) => this.updateNdc(e));
		on(el, 'pointerdown', (e) => {
			this.updateNdc(e);
			if (e.button === 0) this.fireHeld = true;
			if (e.button === 2) this.meleeEdge = true;
		});
		on(el, 'contextmenu', (e) => e.preventDefault());
		const vis = () => {
			if (document.visibilityState !== 'visible') this.clear();
		};
		document.addEventListener('visibilitychange', vis);
		this.cleanup.push(() => document.removeEventListener('visibilitychange', vis));
	}

	detach() {
		for (const fn of this.cleanup) fn();
		this.cleanup = [];
		this.el = null;
		this.clear();
	}

	private clear() {
		this.held.clear();
		this.fireHeld = false;
		this.meleeEdge = false;
		this.reloadEdge = false;
		this.abilityEdge = false;
		this.slotEdge = null;
	}

	private updateNdc(e: PointerEvent) {
		const r = this.el?.getBoundingClientRect();
		if (!r || r.width === 0 || r.height === 0) return;
		this.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
		this.ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
	}

	/** Snapshot for one frame. Edge-triggered flags are consumed. */
	frame(): InputFrame {
		const h = this.held;
		// Screen-up (W) is -z on the ground plane; screen-right (D) is +x.
		const move = norm({
			x:
				(h.has('KeyD') || h.has('ArrowRight') ? 1 : 0) -
				(h.has('KeyA') || h.has('ArrowLeft') ? 1 : 0),
			z: (h.has('KeyS') || h.has('ArrowDown') ? 1 : 0) - (h.has('KeyW') || h.has('ArrowUp') ? 1 : 0)
		});
		const f: InputFrame = {
			move,
			aim: { x: this.aim.x, z: this.aim.z },
			fire: this.fireHeld,
			melee: this.meleeEdge,
			reload: this.reloadEdge,
			slot: this.slotEdge,
			ability: this.abilityEdge
		};
		this.meleeEdge = false;
		this.reloadEdge = false;
		this.abilityEdge = false;
		this.slotEdge = null;
		return f;
	}
}

function isTyping(e: KeyboardEvent) {
	const t = e.target as HTMLElement | null;
	return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
