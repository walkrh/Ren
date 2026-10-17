// In-memory Convex database for handler tests. Only specs import it.
import type { MutationCtx } from '../../convex/_generated/server';

export type Row = { _id: string; [key: string]: unknown };

/** Real Convex handlers run against this; `as()` switches the signed-in user. */
export function memoryDb(userId = 'u1') {
	const rows = new Map<string, Row>();
	const tables = new Map<string, Row[]>();
	let serial = 0;
	let subject: string | null = userId;
	const insert = (table: string, fields: Record<string, unknown>, id = `${table}${serial++}`) => {
		const row: Row = { ...fields, _id: id };
		rows.set(id, row);
		tables.set(table, [...(tables.get(table) ?? []), row]);
		return row;
	};
	const ctx = {
		auth: { getUserIdentity: async () => (subject ? { subject } : null) },
		db: {
			get: async (id: string) => rows.get(id) ?? null,
			patch: async (id: string, patch: Record<string, unknown>) => {
				const row = rows.get(id)!;
				for (const [k, v] of Object.entries(patch))
					if (v === undefined) delete row[k];
					else row[k] = v;
			},
			insert: async (table: string, fields: Record<string, unknown>) => insert(table, fields)._id,
			delete: async (id: string) => {
				rows.delete(id);
				for (const [name, list] of tables)
					tables.set(
						name,
						list.filter((r) => r._id !== id)
					);
			},
			query: (table: string) => {
				let found = tables.get(table) ?? [];
				const chain = {
					withIndex: (
						_name: string,
						select: (q: { eq: (key: string, value: unknown) => unknown }) => unknown
					) => {
						const q = {
							eq: (key: string, value: unknown) => {
								found = found.filter((r) => r[key] === value);
								return q;
							}
						};
						select(q);
						return chain;
					},
					order: (dir: 'asc' | 'desc') => {
						if (dir === 'desc') found = [...found].reverse();
						return chain;
					},
					take: async (n: number) => found.slice(0, n),
					unique: async () => found[0] ?? null,
					first: async () => found[0] ?? null,
					collect: async () => found
				};
				return chain;
			}
		}
	} as unknown as MutationCtx;
	const as = (id: string | null) => {
		subject = id;
		return ctx;
	};
	return { rows, tables, insert, ctx, as };
}

// Convex exposes _handler at runtime for direct handler tests, outside its public client API.
export function run(fn: unknown, ctx: MutationCtx, args: Record<string, unknown>) {
	return (
		fn as { _handler: (ctx: MutationCtx, args: Record<string, unknown>) => Promise<unknown> }
	)._handler(ctx, args);
}
