// Lobby rules shared by the Convex mutations and the lobby screen.
export const LOBBY_NAME_MAX = 32;

export function lobbyNameError(raw: string): string | null {
	const name = raw.trim();
	if (!name) return 'Give the lobby a name';
	if (name.length > LOBBY_NAME_MAX) return `Name must be at most ${LOBBY_NAME_MAX} characters`;
	return null;
}
