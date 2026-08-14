import type { ReactNode } from 'react';

interface ConveyorFiltersPageHeaderProps {
  title: string;
  lead: string;
  actions?: ReactNode;
  centered?: boolean;
}

function ConveyorFiltersPageHeader({ title, lead, actions, centered = false }: ConveyorFiltersPageHeaderProps) {
  return (
    <header className={`cf-page-header${centered ? ' cf-page-header-center' : ''}`}>
      <div className="cf-page-header-text">
        <h1>{title}</h1>
        <p className="cf-lead">{lead}</p>
      </div>
      {actions ? <div className="cf-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export default ConveyorFiltersPageHeader;
