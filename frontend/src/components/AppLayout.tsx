import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, api, clearSession, type Me } from "../lib/api";

export default function AppLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    function load() {
      api.me().then(setMe).catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          nav("/login");
        }
      });
    }
    load();
    window.addEventListener("auteur:refresh", load);
    return () => window.removeEventListener("auteur:refresh", load);
  }, [nav, location.pathname]);

  return (
    <div className="app-shell">
      <aside className="side">
        <div className="brand">Aut<span>eur</span></div>
        <nav className="nav">
          <NavLink to="/app" end>Create</NavLink>
          <NavLink to="/app/library">Library</NavLink>
          <NavLink to="/app/brand">Brand kit</NavLink>
          <NavLink to="/app/billing">Credits</NavLink>
        </nav>
        <div className="side-foot">
          <div className="credits-pill">
            Credits <b>{me?.credits ?? "—"}</b>
          </div>
          <div>{me?.user.name}</div>
          <div>{me?.subscription?.plan_name || "Free"} plan</div>
          <button
            type="button"
            className="ghost-link"
            onClick={() => {
              clearSession();
              nav("/");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet context={{ me, setMe }} />
      </main>
    </div>
  );
}
