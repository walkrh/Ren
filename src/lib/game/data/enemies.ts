// Enemy roster. The host simulates these; the server reads hp/points from here.

export type EnemyType = 'mobile_tank' | 'gun_drone' | 'scout' | 'id_stealer' | 'overlord';

export type EnemyDef = {
	name: string;
	hp: number;
	/** units per second */
	speed: number;
	/** collision radius in units */
	radius: number;
	damage: number;
	/** melee reach, or firing range for ranged types */
	attackRange: number;
	attackCooldownMs: number;
	/** scored on kill */
	points: number;
	/** off the ground: melee cannot reach it */
	hovering: boolean;
	/** ranged types fire projectiles and try to stay inside this band */
	ranged?: { projectileSpeed: number; keepMin: number; keepMax: number };
	/** starts disguised as its target; revealed on its first attack */
	disguises: boolean;
};

export const enemies: Record<EnemyType, EnemyDef> = {
	mobile_tank: {
		name: 'Mobile Tank',
		hp: 220,
		speed: 2.5,
		radius: 0.9,
		damage: 25,
		attackRange: 1.5,
		attackCooldownMs: 1500,
		points: 20,
		hovering: false,
		disguises: false
	},
	gun_drone: {
		name: 'Gun Drone',
		hp: 60,
		speed: 4,
		radius: 0.5,
		damage: 8,
		attackRange: 10,
		attackCooldownMs: 1000,
		points: 15,
		hovering: false,
		ranged: { projectileSpeed: 12, keepMin: 7, keepMax: 10 },
		disguises: false
	},
	scout: {
		name: 'Scout',
		hp: 40,
		speed: 7,
		radius: 0.45,
		damage: 6,
		attackRange: 1.5,
		attackCooldownMs: 2000,
		points: 15,
		hovering: true,
		disguises: false
	},
	id_stealer: {
		name: 'ID Stealer',
		hp: 90,
		speed: 6,
		radius: 0.5,
		damage: 20,
		attackRange: 2,
		attackCooldownMs: 1200,
		points: 30,
		hovering: false,
		disguises: true
	},
	overlord: {
		name: 'Overlord',
		hp: 1500,
		speed: 2,
		radius: 1.8,
		damage: 10,
		attackRange: 14,
		attackCooldownMs: 3000,
		points: 500,
		hovering: false,
		ranged: { projectileSpeed: 10, keepMin: 6, keepMax: 12 },
		disguises: false
	}
};

export const enemyTypes = Object.keys(enemies) as [EnemyType, ...EnemyType[]];

export function isEnemyType(t: string): t is EnemyType {
	return t in enemies;
}

/** Overlord phases by remaining hp fraction. */
export const OVERLORD = {
	phase2Below: 0.66,
	phase3Below: 0.33,
	volleyCount: 3,
	volleySpreadRadians: 0.35,
	phase2DroneEveryMs: 20_000,
	phase2DroneCount: 2,
	phase3Speed: 3.5,
	phase3DamageMultiplier: 1.5
};

export function overlordPhase(hp: number, maxHp: number): 1 | 2 | 3 {
	const f = hp / maxHp;
	if (f < OVERLORD.phase3Below) return 3;
	if (f < OVERLORD.phase2Below) return 2;
	return 1;
}
