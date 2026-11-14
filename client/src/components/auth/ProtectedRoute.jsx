import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Wraps routes that require authentication.
// If not logged in, redirects to '/' (AuthPage).
export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}
