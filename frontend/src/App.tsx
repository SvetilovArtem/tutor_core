import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import Layout from './components/Layout';
import SchedulePage from './pages/SchedulePage';
import LessonsPage from './pages/LessonsPage';
import PackagesPage from './pages/PackagesPage';
import StudentsPage from './pages/StudentsPage';
import CancellationsPage from './pages/CancellationsPage';
import FinancePage from './pages/FinancePage';
import ProfilePage from './pages/ProfilePage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/lessons" element={<LessonsPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/cancellations" element={<CancellationsPage />} />
          <Route path="/finance" element={<FinancePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}