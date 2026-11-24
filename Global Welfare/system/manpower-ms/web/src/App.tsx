import { Link, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import {
  ApplicationsPage,
  ApplicationDetailPage,
  ApprovalsPage,
  AuditPage,
  CandidatesPage,
  CandidateDetailPage,
  FinancePage,
  UsersPage,
} from './pages/ops';
import { CataloguePage } from './pages/catalogue';
import IntakePage from './pages/IntakePage';

function NotFound() {
  return (
    <div>
      <h1 className="heading-5">Page not found</h1>
      <p className="body-3 mt-2 text-muted">This page does not exist or has not been built yet.</p>
      <Link to="/" className="body-5 mt-4 inline-block underline">
        Back to home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="candidates" element={<CandidatesPage />} />
          <Route path="candidates/:id" element={<CandidateDetailPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="applications/:id" element={<ApplicationDetailPage />} />
          <Route path="intake" element={<IntakePage />} />
          <Route path="catalogue" element={<CataloguePage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
