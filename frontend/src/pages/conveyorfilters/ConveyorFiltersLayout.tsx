import { NavLink, Outlet } from 'react-router-dom';
import './ConveyorFilters.css';

function ConveyorFiltersLayout() {
  return (
    <div className="cf-page">
      <nav className="cf-subnav" aria-label="Conveyor Filters">
        <NavLink to="/conveyorfilters" end className={({ isActive }) => `cf-subnav-link${isActive ? ' active' : ''}`}>
          Filters
        </NavLink>
        <NavLink
          to="/conveyorfilters/my"
          className={({ isActive }) => `cf-subnav-link${isActive ? ' active' : ''}`}
        >
          My Filters
        </NavLink>
        <NavLink
          to="/conveyorfilters/about"
          className={({ isActive }) => `cf-subnav-link${isActive ? ' active' : ''}`}
        >
          About
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

export default ConveyorFiltersLayout;
