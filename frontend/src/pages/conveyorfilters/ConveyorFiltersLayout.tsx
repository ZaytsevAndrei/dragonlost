import { NavLink, Outlet, useLocation } from 'react-router-dom';
import ConveyorFiltersHero from './ConveyorFiltersHero';
import './ConveyorFilters.css';

function ConveyorFiltersLayout() {
  const { pathname } = useLocation();
  const isEditorRoute = /\/conveyorfilters\/(new|\d+)/.test(pathname);

  return (
    <div className="cf-page">
      {!isEditorRoute && <ConveyorFiltersHero />}

      <nav className="cf-subnav" aria-label="Фильтры конвейеров">
        <NavLink to="/conveyorfilters" end className={({ isActive }) => `cf-subnav-link${isActive ? ' active' : ''}`}>
          Общие фильтры
        </NavLink>
        <NavLink
          to="/conveyorfilters/my"
          className={({ isActive }) => `cf-subnav-link${isActive ? ' active' : ''}`}
        >
          Приватные фильтры
        </NavLink>
        <NavLink
          to="/conveyorfilters/about"
          className={({ isActive }) => `cf-subnav-link${isActive ? ' active' : ''}`}
        >
          Как это работает
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

export default ConveyorFiltersLayout;
