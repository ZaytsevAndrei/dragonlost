import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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

function App() {
  const fetchUser = useAuthStore((state) => state.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
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
    </Router>
  );
}

export default App;
