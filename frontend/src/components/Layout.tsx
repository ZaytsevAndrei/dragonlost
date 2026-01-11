import { ReactNode } from 'react';
import Header from './Header';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <Header />
      <main className="main-content">
        <div className="container">{children}</div>
      </main>
      <footer className="footer">
        <div className="container">
          <p>&copy; 2026 DragonLost. Все права защищены.</p>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
