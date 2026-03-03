import './StatePanel.css';

type StateType = 'loading' | 'empty' | 'error';

interface StatePanelProps {
  type: StateType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ICON_BY_TYPE: Record<StateType, string> = {
  loading: '⏳',
  empty: '📭',
  error: '⚠️',
};

function StatePanel({ type, title, message, actionLabel, onAction }: StatePanelProps) {
  return (
    <section className={`ui-state ui-state-${type}`} role={type === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span className="ui-state-icon" aria-hidden="true">{ICON_BY_TYPE[type]}</span>
      <h2 className="ui-state-title">{title}</h2>
      {message ? <p className="ui-state-message">{message}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className="ui-state-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export default StatePanel;
