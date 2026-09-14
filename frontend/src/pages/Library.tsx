import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Project } from "../lib/api";

export default function Library() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.projects().then((d) => setProjects(d.projects)).catch(() => setProjects([]));
  }, []);

  if (!projects.length) {
    return (
      <div>
        <h1 className="page-title" style={{ fontSize: 48 }}>Library</h1>
        <p className="empty">Nothing yet. Start with a Reel.</p>
        <Link className="btn" to="/app">Create</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 48 }}>Library</h1>
      <div className="list" style={{ marginTop: 24 }}>
        {projects.map((p) => (
          <Link key={p.id} to={`/app/studio/${p.id}`}>
            <span>
              <b>{p.prompt}</b>
              <div className="hint">{p.type} · {p.status} · {p.creditsUsed} credits</div>
            </span>
            <span className="hint">{new Date(p.createdAt).toLocaleString()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
