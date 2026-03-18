import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Statistics from './pages/Statistics';
import Rewards from './pages/Rewards';
import Items from './pages/Items';
import Agreement from './pages/Agreement';
import Privacy from './pages/Privacy';
import PersonalInformation from './pages/PersonalInformation';
import MapVoteAdmin from './pages/MapVoteAdmin';
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
    if (location.pathname !== '/rewards') {
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
            <Route path="/stats" element={<Statistics />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/items" element={<Items />} />
            <Route path="/agreement" element={<Agreement />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/personal-information" element={<PersonalInformation />} />
            <Route path="/map-vote" element={<MapVoteAdmin />} />
          </Routes>
        </Layout>
      </PageTracker>
    </Router>
  );
}

export default App;
