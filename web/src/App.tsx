import { type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { usePresenceHeartbeat } from './hooks/usePresence';
import InvitationBanner from './components/InvitationBanner';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import ProfilePage from './pages/ProfilePage';
import OnlineGamePage from './pages/OnlineGamePage';
import AdminPage from './pages/AdminPage';

// Renders nothing; just keeps the current user's presence doc alive
function PresenceHeartbeat() {
  const { user } = useAuth();
  usePresenceHeartbeat(user?.uid ?? null);
  return null;
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app"><span className="loading">Loading…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <PresenceHeartbeat />
      <InvitationBanner />
      {children}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"  element={<LoginPage />} />
      <Route path="/"       element={<RequireAuth><LobbyPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/game/:gameId" element={<RequireAuth><OnlineGamePage /></RequireAuth>} />
      <Route path="/admin"  element={<RequireAuth><AdminPage /></RequireAuth>} />
      <Route path="*"       element={<Navigate to="/" replace />} />
    </Routes>
  );
}
