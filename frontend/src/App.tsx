import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Shop from './pages/Shop';
import Statistics from './pages/Statistics';
import Servers from './pages/Servers';
import Inventory from './pages/Inventory';
import Rewards from './pages/Rewards';
import Agreement from './pages/Agreement';
import Privacy from './pages/Privacy';
import PersonalInformation from './pages/PersonalInformation';
import { useAuthStore } from './store/authStore';
import { getLastPage, clearLastPage } from './utils/safeLocalStorage';

let isInitialAppLoad = true;

function HomeWithRedirect() {
  const { user, loading } = useAuthStore();

  if (isInitialAppLoad && !loading && user) {
    const savedPage = getLastPage();
    if (savedPage) {
      isInitialAppLoad = false;
      clearLastPage();
      return <Navigate to={savedPage} replace />;
    }
  }

  if (!loading) {
    isInitialAppLoad = false;
  }

  return <Home />;
}

function PageTracker({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/') return;
    if (location.pathname !== '/inventory' && location.pathname !== '/rewards') {
      clearLastPage();
    }
  }, [location.pathname]);

  return <>{children}</>;
}

function App() {
  const fetchUser = useAuthStore((state) => state.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <Router>
      <PageTracker>
        <Layout>
          <Routes>
            <Route path="/" element={<HomeWithRedirect />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/stats" element={<Statistics />} />
            <Route path="/servers" element={<Servers />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/agreement" element={<Agreement />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/personal-information" element={<PersonalInformation />} />
          </Routes>
        </Layout>
      </PageTracker>
    </Router>
  );
}

export default App;
