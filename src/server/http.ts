import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { Pool } from "pg";
import { AppError, createBudgetApp, type MonthView } from "../application/budget-app.ts";
import { MoneyError, parseMajorToMinor } from "../domain/money.ts";
import { createPostgresStore } from "../persistence/postgres.ts";
import type { AccessTokenVerifier } from "./supabase-auth.ts";

type Env = {
  Variables: {
    userId: string;
  };
};

function httpStatus(code: AppError["code"]): 400 | 401 | 403 | 404 | 409 | 503 {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "UNAVAILABLE":
      return 503;
    case "VALIDATION":
      return 400;
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
  }
}

function errorBody(error: AppError): { error: string; message: string; current?: MonthView } {
  const body: { error: string; message: string; current?: MonthView } = {
    error: error.code,
    message: error.message,
  };
  if (error.current) {
    body.current = error.current;
  }
  return body;
}

export function createHttpApp(pool: Pool, verifyAccessToken: AccessTokenVerifier) {
  const appFor = (userId: string) => createBudgetApp(createPostgresStore(pool, userId));
  const http = new Hono<Env>();

  http.use(
    "/*",
    cors({
      origin: process.env.CORS_ORIGIN ?? "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  http.get("/health", (c) => c.json({ ok: true }));

  http.use("/month/*", requireAuth(verifyAccessToken));
  http.use("/month", requireAuth(verifyAccessToken));
  http.use("/households", requireAuth(verifyAccessToken));
  http.use("/households/*", requireAuth(verifyAccessToken));

  http.post("/households", async (c) => {
    const userId = c.get("userId");
    const app = appFor(userId);
    const body = await c.req.json<{ currency?: string; year?: number; month?: number }>();
    try {
      const view = await app.createHousehold(
        { userId },
        {
          currency: body.currency ?? "EUR",
          year: body.year ?? utcYear(),
          month: body.month ?? utcMonth(),
        },
      );
      return c.json(view);
    } catch (error) {
      return respondError(c, error);
    }
  });

  http.post("/households/:id/members", async (c) => {
    const userId = c.get("userId");
    const app = appFor(userId);
    const body = await c.req.json<{ email?: string }>();
    try {
      await app.addMember({ userId }, c.req.param("id"), body.email ?? "");
      return c.json({ ok: true });
    } catch (error) {
      return respondError(c, error);
    }
  });

  http.get("/month", async (c) => {
    const userId = c.get("userId");
    const app = appFor(userId);
    const year = Number(c.req.query("year") ?? utcYear());
    const month = Number(c.req.query("month") ?? utcMonth());
    try {
      return c.json(await app.getMonth({ userId }, year, month));
    } catch (error) {
      return respondError(c, error);
    }
  });

  http.post("/month/income", async (c) => {
    const userId = c.get("userId");
    const app = appFor(userId);
    const body = await readMoneyBody(c);
    if (body instanceof Response) {
      return body;
    }
    try {
      return c.json(
        await app.setIncome(
          { userId },
          {
            year: body.year,
            month: body.month,
            expectedRevision: body.expectedRevision,
            amountMinor: body.amountMinor,
          },
        ),
      );
    } catch (error) {
      return respondError(c, error);
    }
  });

  http.post("/month/save", async (c) => {
    const userId = c.get("userId");
    const app = appFor(userId);
    const raw = (await c.req.json()) as Record<string, unknown>;
    try {
      return c.json(
        await app.saveMonth(
          { userId },
          {
            year: Number(raw.year),
            month: Number(raw.month),
            expectedRevision: Number(raw.expectedRevision),
            incomeMinor: parseMajorToMinor(String(raw.income ?? "")),
            allocationMinor: parseMajorToMinor(String(raw.allocation ?? "")),
            ...(typeof raw.categoryName === "string" ? { categoryName: raw.categoryName } : {}),
          },
        ),
      );
    } catch (error) {
      return respondError(c, error);
    }
  });

  http.post("/month/allocation", async (c) => {
    const userId = c.get("userId");
    const app = appFor(userId);
    const body = await readMoneyBody(c);
    if (body instanceof Response) {
      return body;
    }
    try {
      return c.json(
        await app.setAllocation(
          { userId },
          body.categoryName === undefined
            ? {
                year: body.year,
                month: body.month,
                expectedRevision: body.expectedRevision,
                amountMinor: body.amountMinor,
              }
            : {
                year: body.year,
                month: body.month,
                expectedRevision: body.expectedRevision,
                amountMinor: body.amountMinor,
                categoryName: body.categoryName,
              },
        ),
      );
    } catch (error) {
      return respondError(c, error);
    }
  });

  return http;
}

function requireAuth(verifyAccessToken: AccessTokenVerifier) {
  return createMiddleware<Env>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      return c.json({ error: "UNAUTHENTICATED", message: "Sign in required" }, 401);
    }
    try {
      c.set("userId", await verifyAccessToken(token));
      await next();
    } catch {
      return c.json({ error: "UNAUTHENTICATED", message: "Sign in required" }, 401);
    }
  });
}

async function readMoneyBody(c: Context) {
  const body = (await c.req.json()) as Record<string, unknown>;
  try {
    const amountMinor = parseMajorToMinor(String(body.amount ?? ""));
    return {
      year: Number(body.year),
      month: Number(body.month),
      expectedRevision: Number(body.expectedRevision),
      amountMinor,
      categoryName: typeof body.categoryName === "string" ? body.categoryName : undefined,
    };
  } catch (error) {
    const message = error instanceof MoneyError ? error.message : "Enter a valid amount";
    return c.json({ error: "VALIDATION", message }, 400);
  }
}

function respondError(c: Context, error: unknown): Response {
  if (error instanceof AppError) {
    return c.json(errorBody(error), httpStatus(error.code));
  }
  if (error instanceof MoneyError) {
    return c.json({ error: "VALIDATION", message: error.message }, 400);
  }
  return c.json({ error: "UNAVAILABLE", message: "Could not save. Try again." }, 503);
}

function utcYear(): number {
  return new Date().getUTCFullYear();
}

function utcMonth(): number {
  return new Date().getUTCMonth() + 1;
}
