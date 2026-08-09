import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Statistics from './pages/Statistics';
import Rewards from './pages/Rewards';
import Inventory from './pages/Inventory';
import TelegramLink from './pages/TelegramLink';
import Agreement from './pages/Agreement';
import Privacy from './pages/Privacy';
import PersonalInformation from './pages/PersonalInformation';
import MapVoteAdmin from './pages/MapVoteAdmin';
import VouchersAdmin from './pages/VouchersAdmin';
import AdminLayout from './pages/AdminLayout';
import AdminHome from './pages/AdminHome';
import Voting from './pages/Voting';
import ConveyorFiltersLayout from './pages/conveyorfilters/ConveyorFiltersLayout';
import FiltersPage from './pages/conveyorfilters/FiltersPage';
import MyFiltersPage from './pages/conveyorfilters/MyFiltersPage';
import FilterEditorPage from './pages/conveyorfilters/FilterEditorPage';
import AboutPage from './pages/conveyorfilters/AboutPage';
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
    if (location.pathname !== '/rewards' && location.pathname !== '/inventory') {
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
            <Route path="/vote" element={<Voting />} />
            <Route path="/conveyorfilters" element={<ConveyorFiltersLayout />}>
              <Route index element={<FiltersPage />} />
              <Route path="my" element={<MyFiltersPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="new" element={<FilterEditorPage />} />
              <Route path=":id" element={<FilterEditorPage />} />
            </Route>
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/telegram" element={<TelegramLink />} />
            <Route path="/shop" element={<Navigate to="/#shop" replace />} />
            <Route path="/items" element={<Navigate to="/#shop" replace />} />
            <Route path="/agreement" element={<Agreement />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/personal-information" element={<PersonalInformation />} />
            <Route path="/admin/*" element={<AdminLayout />}>
              <Route index element={<AdminHome />} />
              <Route path="map-vote" element={<MapVoteAdmin />} />
              <Route path="vouchers" element={<VouchersAdmin />} />
            </Route>
            <Route path="/map-vote" element={<Navigate to="/admin/map-vote" replace />} />
          </Routes>
        </Layout>
      </PageTracker>
    </Router>
  );
}

export default App;
