import { useEffect, useState } from "react";
import { formatMinorAsMajor } from "../domain/money.ts";
import { getSupabase } from "./supabase-browser.ts";

type MonthView = {
  householdId: string;
  monthId: string;
  year: number;
  month: number;
  revision: number;
  currency: string;
  incomeMinor: number;
  categoryId: string;
  categoryName: string;
  allocationMinor: number;
  unallocatedMinor: number;
  remainingMinor: number;
  headlineSafeToSpendMinor: number;
};

type ScreenStatus = "idle" | "loading" | "saving" | "saved" | "unsaved" | "save-failed" | "conflict" | "error";

const YEAR = 2026;
const MONTH = 8;
const API = import.meta.env.VITE_API_URL ?? "";

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, init);
}

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<MonthView | null>(null);
  const [income, setIncome] = useState("");
  const [allocation, setAllocation] = useState("");
  const [categoryName, setCategoryName] = useState("Envelope");
  const [memberEmail, setMemberEmail] = useState("");
  const [status, setStatus] = useState<ScreenStatus>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        const next = data.session?.access_token ?? null;
        setToken(next);
        if (next) {
          void refresh(next);
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Sign-in is not configured.");
      });
  }, []);

  async function refresh(currentToken: string) {
    setStatus("loading");
    const response = await api(`/month?year=${YEAR}&month=${MONTH}`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (response.status === 404) {
      setView(null);
      setStatus("idle");
      setMessage("");
      return;
    }
    if (!response.ok) {
      setStatus("error");
      setMessage("Could not load the household. Sign in again if this continues.");
      return;
    }
    const next = (await response.json()) as MonthView;
    applyView(next);
    setStatus("saved");
    setMessage("");
  }

  function applyView(next: MonthView) {
    setView(next);
    setIncome(formatMinorAsMajor(next.incomeMinor));
    setAllocation(formatMinorAsMajor(next.allocationMinor));
    setCategoryName(next.categoryName);
  }

  async function sign(kind: "in" | "up") {
    setStatus("loading");
    setMessage("");
    try {
      const auth = getSupabase().auth;
      const result =
        kind === "in"
          ? await auth.signInWithPassword({ email, password })
          : await auth.signUp({ email, password });
      if (result.error) {
        setStatus("error");
        setMessage("That sign-in did not work");
        return;
      }
      const access = result.data.session?.access_token;
      if (!access) {
        setStatus("error");
        setMessage("Check your email to finish creating the account, then sign in.");
        return;
      }
      setToken(access);
      await refresh(access);
    } catch {
      setStatus("error");
      setMessage("That sign-in did not work");
    }
  }

  async function createHousehold() {
    if (!token) {
      return;
    }
    setStatus("saving");
    const response = await api("/households", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currency: "EUR", year: YEAR, month: MONTH }),
    });
    const body = (await response.json()) as MonthView & { message?: string };
    if (!response.ok) {
      setStatus("error");
      setMessage(body.message ?? "Could not create household");
      return;
    }
    applyView(body);
    setStatus("saved");
    setMessage("");
  }

  async function save() {
    if (!token || !view) {
      return;
    }
    setStatus("saving");
    setMessage("");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const incomeResponse = await api("/month/save", {
      method: "POST",
      headers,
      body: JSON.stringify({
        year: YEAR,
        month: MONTH,
        expectedRevision: view.revision,
        income,
        allocation,
        categoryName,
      }),
    });
    const incomeBody = (await incomeResponse.json()) as MonthView & { message?: string; current?: MonthView };
    if (!incomeResponse.ok) {
      failSave(incomeResponse.status, incomeBody);
      return;
    }
    applyView(incomeBody);
    setStatus("saved");
  }

  function failSave(statusCode: number, body: { message?: string; current?: MonthView }) {
    if (statusCode === 409) {
      setStatus("conflict");
      setMessage("This budget changed on another device. Refresh to get the latest version.");
      return;
    }
    setStatus("save-failed");
    setMessage(body.message ?? "Could not save. Try again.");
  }

  async function addMember() {
    if (!token || !view) {
      return;
    }
    const response = await api(`/households/${view.householdId}/members`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: memberEmail }),
    });
    const body = (await response.json()) as { message?: string };
    if (!response.ok) {
      setStatus("error");
      setMessage(body.message ?? "Could not add that email");
      return;
    }
    setMemberEmail("");
    setMessage("If that person has an account, they can now refresh this household.");
  }

  function signOut() {
    void getSupabase().auth.signOut();
    setToken(null);
    setView(null);
    setStatus("idle");
    setMessage("");
  }

  if (!token) {
    return (
      <main className="page">
        <h1>NDApp</h1>
        <p>Sign in to the shared household budget. This is the spine, not the finished Budget Button.</p>
        <p className={`status ${status === "error" ? "error" : ""}`}>{message}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sign("in");
          }}
        >
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={status === "loading"}>
            Sign in
          </button>
          <button type="button" className="secondary" onClick={() => void sign("up")} disabled={status === "loading"}>
            Create account
          </button>
        </form>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="page">
        <h1>Your household</h1>
        <p className={`status ${status === "error" ? "error" : ""}`}>{message}</p>
        <p>No household month yet. Create one to share income and one allocation.</p>
        <button type="button" onClick={() => void createHousehold()} disabled={status === "saving"}>
          Create household
        </button>
        <button type="button" className="secondary" onClick={signOut}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>August 2026</h1>
      <p className={`status ${status === "save-failed" || status === "conflict" || status === "error" ? "error" : status}`}>
        {message
          ? message
          : status === "saving"
            ? "Saving…"
            : status === "saved"
              ? "Saved"
              : status === "unsaved"
                ? "Unsaved"
                : status === "loading"
                  ? "Loading…"
                  : ""}
      </p>
      <label>
        Monthly income ({view.currency})
        <input
          inputMode="decimal"
          value={income}
          onChange={(event) => {
            setIncome(event.target.value);
            setStatus("unsaved");
            setMessage("");
          }}
        />
      </label>
      <label>
        Allocation name
        <input
          value={categoryName}
          onChange={(event) => {
            setCategoryName(event.target.value);
            setStatus("unsaved");
            setMessage("");
          }}
        />
      </label>
      <label>
        Planned allocation ({view.currency})
        <input
          inputMode="decimal"
          value={allocation}
          onChange={(event) => {
            setAllocation(event.target.value);
            setStatus("unsaved");
            setMessage("");
          }}
        />
      </label>
      <dl className="figures">
        <dt>Unallocated</dt>
        <dd>{formatMinorAsMajor(view.unallocatedMinor)}</dd>
        <dt>Remaining in {view.categoryName}</dt>
        <dd>{formatMinorAsMajor(view.remainingMinor)}</dd>
        <dt>Headline safe to spend</dt>
        <dd>{formatMinorAsMajor(view.headlineSafeToSpendMinor)}</dd>
      </dl>
      <button type="button" onClick={() => void save()} disabled={status === "saving"}>
        Save
      </button>
      <button type="button" className="secondary" onClick={() => token && void refresh(token)}>
        Refresh household
      </button>
      <label>
        Add member by email
        <input value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} />
      </label>
      <button type="button" className="secondary" onClick={() => void addMember()}>
        Add member
      </button>
      <button type="button" className="secondary" onClick={signOut}>
        Sign out
      </button>
    </main>
  );
}
