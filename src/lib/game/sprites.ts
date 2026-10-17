// Pixel sprites rendered by PixelSprite.svelte. '.' is transparent.

export const zombiePalette = {
	G: '#5fb32e', // skin
	g: '#3e7a1f', // skin shadow
	D: '#141811', // outline / sockets
	R: '#d93030', // eyes
	W: '#e8e0c5', // teeth
	B: '#7d1414' // gore
};

export const zombieHead = [
	'.....DDDDDD.....',
	'...DDGGGGGGDD...',
	'..DGGGGGGGGGGD..',
	'.DGGGGGGGGGGGGD.',
	'.DGGDDDGGGDDDGD.',
	'.DGDRRRDGDRRRDD.',
	'.DGDRRRDGDRRRDD.',
	'.DGGDDDGGGDDDGD.',
	'.DGGGGGGGGGGGgD.',
	'.DGGGGGGGGGGggD.',
	'.DGGDDDDDDDDggD.',
	'.DGDWDWDWDWDggD.',
	'.DGDDDDDDDDDgBD.',
	'..DGGGGGGGGggD..',
	'...DDgggggggDD..',
	'.....DDDDDDD....'
] as const;
