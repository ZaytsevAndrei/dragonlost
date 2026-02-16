import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
          <div className="footer-content">
            <div className="footer-legal">
              <Link to="/agreement">Пользовательское соглашение</Link>
              <Link to="/privacy">Политика конфиденциальности</Link>
              <Link to="/personal-information">Обработка персональных данных</Link>
            </div>
            <div className="footer__rules">
              <p>
                Размещенная на настоящем сайте информация носит исключительно
                информационный характер и ни при каких условиях не является публичной
                офертой, определяемой положениями ч. 2 ст. 437 Гражданского кодекса
                Российской Федерации.
              </p>
            </div>
            <p className="footer-copy">&copy; 2026 DragonLost. Все права защищены.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
