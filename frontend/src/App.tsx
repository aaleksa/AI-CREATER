import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Studio from "./pages/Studio";
import Brand from "./pages/Brand";
import Billing from "./pages/Billing";
import Library from "./pages/Library";
import Preview from "./pages/Preview";
import { hasSession } from "./lib/api";

function Private({ children }: { children: ReactNode }) {
  if (!hasSession()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <div className="grain" />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />
        <Route path="/preview/:token" element={<Preview />} />
        <Route
          path="/app"
          element={
            <Private>
              <AppLayout />
            </Private>
          }
        >
          <Route index element={<Home />} />
          <Route path="studio/:id" element={<Studio />} />
          <Route path="brand" element={<Brand />} />
          <Route path="billing" element={<Billing />} />
          <Route path="library" element={<Library />} />
        </Route>
      </Routes>
    </>
  );
}
