import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type AdminTable, type Me } from "../lib/api";

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
