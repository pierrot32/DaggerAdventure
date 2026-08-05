import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AppLayout from '../layouts/AppLayout';
import HomePage from '../pages/Home/HomePage';
import LoginPage from '../pages/Auth/LoginPage';
import RegisterPage from '../pages/Auth/RegisterPage';
import DashboardPage from '../pages/Dashboard/DashboardPage';

// Single source of truth for the route tree - add future Daggerheart feature
// pages here, nested under AppLayout like DashboardPage
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/dashboard"
        element={(
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
