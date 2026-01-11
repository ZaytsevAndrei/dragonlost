import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Statistics from './pages/Statistics';
import Servers from './pages/Servers';
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
          <Route path="/stats" element={<Statistics />} />
          <Route path="/servers" element={<Servers />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
