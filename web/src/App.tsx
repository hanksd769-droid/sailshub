import { Route, Routes, Navigate } from 'react-router-dom';
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DetailImagePage from './pages/DetailImagePage';
import VideoCopyPage from './pages/VideoCopyPage';

const App = () => {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/modules/detail-image" element={<DetailImagePage />} />
        <Route path="/modules/video-copy" element={<VideoCopyPage />} />
      </Route>
    </Routes>
  );
};

export default App;
