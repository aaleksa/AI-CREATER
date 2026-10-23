import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError, type AdminTable, type Me } from "../lib/api";

const PAGE = 50;

/** Owner-only, read-only view of the live database. Not translated on purpose (internal tool). */
export default function Admin() {
  const { me } = useOutletContext<{ me: Me | null }>();
  const [tables, setTables] = useState<{ name: string; rows: number }[]>([]);
  const [name, setName] = useState("users");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<AdminTable | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([api.adminTables(), api.adminTable(name, offset, PAGE)])
      .then(([t, d]) => {
        setTables(t.tables);
        setData(d);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load."))
      .finally(() => setLoading(false));
  }, [name, offset]);

  useEffect(load, [load]);

  if (me && !me.isAdmin) {
    return (
      <div>
        <h1 className="page-title">Not found</h1>
      </div>
    );
  }

  const total = data?.total ?? 0;
  return (
    <div className="admin-page">
      <h1 className="page-title">Database</h1>
      <p className="lede">Live, read-only. Newest rows first. Passwords and share tokens are never shown.</p>

      <ImportAccount onDone={load} />

      <div className="admin-bar">
        <select
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setOffset(0);
          }}
        >
          {(tables.length ? tables : [{ name, rows: 0 }]).map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
              {tables.length ? ` (${t.rows})` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="btn ghost" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <span className="hint">
          {total ? `${offset + 1}–${Math.min(offset + PAGE, total)} of ${total}` : "No rows"}
        </span>
        <button type="button" className="btn ghost" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          ← Newer
        </button>
        <button type="button" className="btn ghost" disabled={offset + PAGE >= total || loading} onClick={() => setOffset(offset + PAGE)}>
          Older →
        </button>
      </div>

      {error && <p className="err">{error}</p>}

      {data && (
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                {data.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  {data.columns.map((c) => (
                    <td key={c}>{r[c] === null || r[c] === undefined ? <i>null</i> : String(r[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const PART = 20 * 1024 * 1024;

/** Adds one account exported with backend/scripts/export-account.ts to this server. */
function ImportAccount({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (!file) return;
    setBusy(true);
    setError("");
    const uploadId = crypto.randomUUID();
    const parts = Math.ceil(file.size / PART);
    let step = "";
    try {
      for (let i = 0; i < parts; i++) {
        step = `Uploading ${i + 1} of ${parts}`;
        setProgress(`${step}…`);
        await api.adminImportPart(uploadId, i, file.slice(i * PART, (i + 1) * PART));
      }
      step = "Adding to the database";
      setProgress(`${step}…`);
      const r = await api.adminImportFinish(uploadId);
      setProgress(
        `Done: ${r.email} — ${r.projects} projects, ${r.versions} versions, ${r.files} files` +
          (r.accountExisted ? " (added to the existing account)." : " (new account, same password).")
      );
      setFile(null);
      onDone();
    } catch (err) {
      setProgress("");
      const status = err instanceof ApiError ? ` (${err.status})` : "";
      setError(`${step}: ${err instanceof Error ? err.message : "Could not import."}${status}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="admin-import">
      <summary>Import an account</summary>
      <p className="hint">
        The .tar.gz from <code>npx tsx scripts/export-account.ts you@example.com</code>. Projects and the brand kit are added to the
        account with the same email here (or a new one); nothing else on this server changes.
      </p>
      <div className="admin-bar">
        <input type="file" accept=".gz,.tgz,application/gzip" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button type="button" className="btn" disabled={!file || busy} onClick={start}>
          {busy ? "Importing…" : "Import"}
        </button>
        {file && !busy && <span className="hint">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
      </div>
      {progress && <p className="hint">{progress}</p>}
      {error && <p className="err">{error}</p>}
    </details>
  );
}
