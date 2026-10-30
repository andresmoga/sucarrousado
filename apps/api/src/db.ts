import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://tcu:tcu@localhost:5432/tucarrousado",
  max: 10,
});

export type Queryable = Pick<pg.Pool, "query">;
