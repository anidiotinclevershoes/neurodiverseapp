import type { Pool, PoolClient } from "pg";
import type { BudgetStore, PersistedMonth } from "../application/budget-app.ts";

function asMinor(value: string | number): number {
  return Number.parseInt(String(value), 10);
}

function mapMonth(row: {
  month_id: string;
  household_id: string;
  year: number;
  month: number;
  revision: number;
  currency: string;
  income_minor: string | number;
  category_id: string;
  category_name: string;
  category_protect: boolean;
  amount_minor: string | number;
}): PersistedMonth {
  return {
    householdId: row.household_id,
    monthId: row.month_id,
    year: row.year,
    month: row.month,
    revision: row.revision,
    currency: row.currency,
    incomeMinor: asMinor(row.income_minor),
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryProtect: row.category_protect,
    allocationMinor: asMinor(row.amount_minor),
  };
}

const MONTH_SQL = `
  SELECT
    m.id AS month_id,
    m.household_id,
    m.year,
    m.month,
    m.revision,
    h.currency,
    m.income_minor,
    c.id AS category_id,
    c.name AS category_name,
    c.protect AS category_protect,
    a.amount_minor
  FROM budget_months m
  JOIN households h ON h.id = m.household_id
  JOIN month_allocations a ON a.month_id = m.id
  JOIN categories c ON c.id = a.category_id
`;

/**
 * Production persistence path. Every query runs in a transaction as
 * role `authenticated` with the signed-in user's JWT claims so `auth.uid()`
 * and RLS apply. The table-owner pool connection is only used to begin that
 * transaction; it must not run household SQL as the login role.
 */
export function createPostgresStore(pool: Pool, userId: string): BudgetStore {
  if (!userId) {
    throw new Error("createPostgresStore requires the authenticated user id");
  }

  async function asUser<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      await client.query("SELECT set_config('app.command_adapter', '1', true)");
      await client.query("SET LOCAL ROLE authenticated");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Connection may already be aborted.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async insertHousehold(row) {
      await asUser((client) =>
        client.query("INSERT INTO households (id, currency) VALUES ($1, $2)", [row.id, row.currency]),
      );
    },
    async insertMember(householdId, memberId) {
      await asUser((client) =>
        client.query(
          "INSERT INTO household_members (household_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [householdId, memberId],
        ),
      );
    },
    async findUserIdByEmail(email) {
      return asUser(async (client) => {
        const result = await client.query<{ id: string | null }>(
          "SELECT private.user_id_for_email($1) AS id",
          [email],
        );
        return result.rows[0]?.id ?? null;
      });
    },
    async isMember(householdId, memberId) {
      return asUser(async (client) => {
        const result = await client.query(
          "SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2",
          [householdId, memberId],
        );
        return (result.rowCount ?? 0) > 0;
      });
    },
    async householdIdForUser(memberId) {
      return asUser(async (client) => {
        const result = await client.query<{ household_id: string }>(
          "SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1",
          [memberId],
        );
        return result.rows[0]?.household_id ?? null;
      });
    },
    async loadMonth(householdId, year, month) {
      return asUser(async (client) => {
        const result = await client.query(MONTH_SQL + " WHERE m.household_id = $1 AND m.year = $2 AND m.month = $3", [
          householdId,
          year,
          month,
        ]);
        const row = result.rows[0];
        return row ? mapMonth(row) : null;
      });
    },
    async insertMonth(row) {
      await asUser(async (client) => {
        await client.query(
          `INSERT INTO budget_months (id, household_id, year, month, income_minor, revision)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.monthId, row.householdId, row.year, row.month, row.incomeMinor, row.revision],
        );
        await client.query(
          `INSERT INTO categories (id, household_id, name, protect) VALUES ($1, $2, $3, $4)`,
          [row.categoryId, row.householdId, row.categoryName, row.categoryProtect],
        );
        await client.query(
          `INSERT INTO month_allocations (month_id, category_id, amount_minor) VALUES ($1, $2, $3)`,
          [row.monthId, row.categoryId, row.allocationMinor],
        );
      });
    },
    async updateMonth(monthId, expectedRevision, patch) {
      return asUser(async (client) => {
        const updated = await client.query<{ id: string }>(
          `UPDATE budget_months
           SET income_minor = $1, revision = revision + 1
           WHERE id = $2 AND revision = $3
           RETURNING id`,
          [patch.incomeMinor, monthId, expectedRevision],
        );
        if ((updated.rowCount ?? 0) === 0) {
          return null;
        }
        await client.query(`UPDATE month_allocations SET amount_minor = $1 WHERE month_id = $2`, [
          patch.allocationMinor,
          monthId,
        ]);
        await client.query(
          `UPDATE categories SET name = $1
           WHERE id = (SELECT category_id FROM month_allocations WHERE month_id = $2)`,
          [patch.categoryName, monthId],
        );
        const loaded = await client.query(MONTH_SQL + " WHERE m.id = $1", [monthId]);
        const row = loaded.rows[0];
        return row ? mapMonth(row) : null;
      });
    },
  };
}

export async function insertAuthUser(
  client: Pool | PoolClient,
  row: { id: string; email: string },
): Promise<void> {
  await client.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [row.id, row.email]);
}
