// Pixel sprites rendered by PixelSprite.svelte. '.' is transparent.

export const overlordPalette = {
	D: '#141811', // outline
	M: '#5a5f68', // plate
	m: '#3a3e46', // plate shadow
	L: '#9aa0a8', // highlight
	R: '#ff2a1f', // eye
	r: '#7d1414', // eye rim
	W: '#ffd0c8' // eye glint
};

/** One of the Overlords' machines: a plated head with a single red eye. */
export const overlordHead = [
	'.....DDDDDD.....',
	'...DDMMMMMMDD...',
	'..DMLLMMMMMMmD..',
	'.DMLMMMMMMMMmmD.',
	'.DMLMMDDDDMMMmD.',
	'.DMMMDrrrrDMMmD.',
	'.DMMDrRRRRrDMmD.',
	'.DMMDrRWRRrDMmD.',
	'.DMMDrRRRRrDMmD.',
	'.DMMMDrrrrDMMmD.',
	'.DmMMMDDDDMMmmD.',
	'.DmmMMMMMMMMmmD.',
	'..DmDmDmDmDmmD..',
	'..DDmDmDmDmDDD..',
	'...DDDDDDDDDD...',
	'................'
] as const;
