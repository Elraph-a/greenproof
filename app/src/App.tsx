import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { startQueueWatcher } from "./lib/registrations";
import { Shell } from "./components/Shell";
import { PendingBanner } from "./components/PendingBanner";
import { DemoBanner } from "./components/DemoBanner";
import { Spinner } from "./components/ui";
import { Landing } from "./screens/Landing";
import { SignIn } from "./screens/SignIn";
import { ProfileSetup } from "./screens/ProfileSetup";
import { MyGrove } from "./screens/MyGrove";
import { Register } from "./screens/Register";
import { CheckIn } from "./screens/CheckIn";
import { TreeDetail } from "./screens/TreeDetail";
import { Profile } from "./screens/Profile";

/*
  LAZY-LOADED — everything off the T0 critical path.

  On Monday the only screens that matter are sign-in, My Grove and Register.
  Leaflet alone is ~170 KB and the map is a tab a field user never opens, so
  eagerly bundling it taxes every first load on Ghanaian mobile data for a
  feature used at a desk. Splitting these four drops the initial bundle by
  roughly a third.
*/
const MapScreen = lazy(() =>
  import("./screens/MapScreen").then((m) => ({ default: m.MapScreen })),
);
const Wallet = lazy(() =>
  import("./screens/Wallet").then((m) => ({ default: m.Wallet })),
);
const Leaderboard = lazy(() =>
  import("./screens/Leaderboard").then((m) => ({ default: m.Leaderboard })),
);
const ReviewQueue = lazy(() =>
  import("./screens/ReviewQueue").then((m) => ({ default: m.ReviewQueue })),
);
const SponsorHome = lazy(() =>
  import("./screens/SponsorHome").then((m) => ({ default: m.SponsorHome })),
);
const FundGrove = lazy(() =>
  import("./screens/FundGrove").then((m) => ({ default: m.FundGrove })),
);
/** The wide desktop view is kept for a funder at a laptop — see /sponsor/full. */
const SponsorDashboard = lazy(() =>
  import("./screens/SponsorDashboard").then((m) => ({
    default: m.SponsorDashboard,
  })),
);

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50dvh] items-center justify-center text-primary">
          <Spinner className="size-8" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!session) {
    return (
      <Navigate to="/signin" replace state={{ from: location.pathname }} />
    );
  }
  return <>{children}</>;
}

/** Sponsors land on their impact screen; everyone else on their grove. */
function Home() {
  const { profile } = useAuth();
  return (
    <Navigate to={profile?.role === "sponsor" ? "/sponsor" : "/grove"} replace />
  );
}

export function App() {
  const { session, loading } = useAuth();

  // Retry queued registrations on regained signal, and every 30s.
  useEffect(() => startQueueWatcher(), []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <>
      {/*
        Deliberately ABOVE the router, not inside the tab shell.

        During T0 the user spends the entire session inside /register, which is
        a full-screen flow outside the tabs. If this banner only rendered on My
        Grove, a run of failing uploads would stay invisible for the whole hour
        — and the one moment it is cheap to fix a lost tree is while you are
        still standing next to it.
      */}
      {/* Renders nothing unless VITE_DEMO=1. See components/DemoBanner.tsx. */}
      <DemoBanner />

      <PendingBanner />

      <Routes>
        <Route
          path="/"
          element={session ? <Home /> : <Landing />}
        />
        <Route
          path="/signin"
          element={session ? <Home /> : <SignIn />}
        />

        {/* Full-screen flows — no bottom tab bar competing for thumb space. */}
        <Route
          path="/register"
          element={
            <RequireAuth>
              <Register />
            </RequireAuth>
          }
        />
        <Route
          path="/checkin"
          element={
            <RequireAuth>
              <CheckIn />
            </RequireAuth>
          }
        />
        <Route
          path="/profile/setup"
          element={
            <RequireAuth>
              <ProfileSetup />
            </RequireAuth>
          }
        />
        {/* The wide desktop dashboard, kept for a funder at a laptop. The
            in-app sponsor experience lives inside the tab shell below. */}
        <Route
          path="/sponsor/full"
          element={
            <RequireAuth>
              <Lazy>
                <SponsorDashboard />
              </Lazy>
            </RequireAuth>
          }
        />

        {/* Tabbed screens. */}
        <Route
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        >
          <Route path="/grove" element={<MyGrove />} />
          <Route path="/sponsor" element={<Lazy><SponsorHome /></Lazy>} />
          <Route path="/sponsor/fund" element={<Lazy><FundGrove /></Lazy>} />
          <Route path="/tree/:id" element={<TreeDetail />} />
          <Route path="/map" element={<Lazy><MapScreen /></Lazy>} />
          <Route path="/wallet" element={<Lazy><Wallet /></Lazy>} />
          <Route path="/leaderboard" element={<Lazy><Leaderboard /></Lazy>} />
          <Route path="/review" element={<Lazy><ReviewQueue /></Lazy>} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
