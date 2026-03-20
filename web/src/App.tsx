import { Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DetailImagePage from './pages/DetailImagePage';
import VideoCopyPage from './pages/VideoCopyPage';
import RunsPage from './pages/RunsPage';
import { apiFetch, clearToken, getToken, setUnauthorizedHandler } from './lib/api';

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AppRoutes = () => {
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      navigate('/login');
    });

    const token = getToken();
    if (!token) {
      return;
    }

    apiFetch('/api/auth/me').catch(() => {
      clearToken();
      navigate('/login');
    });
  }, [navigate]);

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/modules/detail-image" element={<DetailImagePage />} />
        <Route path="/modules/video-copy" element={<VideoCopyPage />} />
      </Route>
    </Routes>
  );
};

const App = () => <AppRoutes />;

export default App;
