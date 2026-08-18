import { UserRole } from '@ar-menu/shared';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { AdminQaQueuePage } from './pages/AdminQaQueuePage';
import { LoginPage } from './pages/LoginPage';
import { RestaurantDetailPage } from './pages/RestaurantDetailPage';
import { RestaurantsPage } from './pages/RestaurantsPage';
import { SignupPage } from './pages/SignupPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/restaurants"
          element={
            <ProtectedRoute>
              <RestaurantsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurants/:id"
          element={
            <ProtectedRoute>
              <RestaurantDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/qa-queue"
          element={
            <ProtectedRoute role={UserRole.ADMIN}>
              <AdminQaQueuePage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/restaurants" replace />} />
        <Route path="*" element={<Navigate to="/restaurants" replace />} />
      </Routes>
    </AuthProvider>
  );
}
