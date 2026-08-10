import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AppLayout from '../layouts/AppLayout';
import HomePage from '../pages/Home/HomePage';
import LoginPage from '../pages/Auth/LoginPage';
import RegisterPage from '../pages/Auth/RegisterPage';
import DashboardPage from '../pages/Dashboard/DashboardPage';
import { ACCESS_LEVELS } from '../utils/permissions';
import AdminUsersPage from '../features/admin/AdminUsersPage';
import AdminAuditPage from '../features/admin/AdminAuditPage';
import AdminAiPlaygroundPage from '../features/admin/AdminAiPlaygroundPage';
import AdminAiLogsPage from '../features/admin/AdminAiLogsPage';
import AdventureListPage from '../features/adventures/AdventureListPage';
import AdventureDetailPage from '../features/adventures/AdventureDetailPage';
import CreateAdventurePage from '../features/adventures/CreateAdventurePage';
import NotificationsPage from '../features/notifications/NotificationsPage';
import CharactersPage from '../features/characters/CharactersPage';
import CharacterBuilderPage from '../features/characters/CharacterBuilderPage';
import CharacterDetailPage from '../features/characters/CharacterDetailPage';
import BookImportPage from '../features/admin/BookImportPage';

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
      <Route path="/admin/users" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.ADMIN]}>
          <AppLayout><AdminUsersPage /></AppLayout>
        </ProtectedRoute>
      )} />
      <Route path="/admin/audit" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.ADMIN]}>
          <AppLayout><AdminAuditPage /></AppLayout>
        </ProtectedRoute>
      )} />
      <Route path="/admin/ai" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.ADMIN]}>
          <AppLayout><AdminAiPlaygroundPage /></AppLayout>
        </ProtectedRoute>
      )} />
      <Route path="/admin/ai/logs" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.ADMIN]}>
          <AppLayout><AdminAiLogsPage /></AppLayout>
        </ProtectedRoute>
      )} />
      <Route path="/adventures" element={(
        <ProtectedRoute><AppLayout><AdventureListPage /></AppLayout></ProtectedRoute>
      )} />
      <Route path="/adventures/create" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.ADVENTURE_MAKER]}>
          <AppLayout><CreateAdventurePage /></AppLayout>
        </ProtectedRoute>
      )} />
      <Route path="/adventures/:adventureId" element={(
        <ProtectedRoute><AppLayout><AdventureDetailPage /></AppLayout></ProtectedRoute>
      )} />
      <Route path="/notifications" element={(
        <ProtectedRoute><AppLayout><NotificationsPage /></AppLayout></ProtectedRoute>
      )} />
      <Route path="/characters" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.PLAYER_ONLY]}><AppLayout><CharactersPage /></AppLayout></ProtectedRoute>
      )} />
      <Route path="/characters/create" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.PLAYER_ONLY]}><AppLayout><CharacterBuilderPage /></AppLayout></ProtectedRoute>
      )} />
      <Route path="/characters/:characterId" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.PLAYER_ONLY]}><AppLayout><CharacterDetailPage /></AppLayout></ProtectedRoute>
      )} />
      <Route path="/admin/content/books/create" element={(
        <ProtectedRoute allowedAccessLevels={[ACCESS_LEVELS.ADMIN]}><AppLayout><BookImportPage /></AppLayout></ProtectedRoute>
      )} />
      <Route path="/admin/content/import" element={<Navigate to="/admin/content/books/create" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
