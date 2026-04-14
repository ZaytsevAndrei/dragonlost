import { useRef, useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeId } from '../theme/themes';
import './ThemeSwitcher.css';

type ThemeSwitcherProps = {
  /** Компактная кнопка для узких мест (например, админка) */
  compact?: boolean;
};

function ThemeSwitcher({ compact = false }: ThemeSwitcherProps) {
  const { theme, setTheme, options } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const current = options.find((o) => o.id === theme)?.label ?? theme;

  const select = (id: ThemeId) => {
    setTheme(id);
    setOpen(false);
  };

  return (
    <div className={`theme-switcher ${compact ? 'theme-switcher--compact' : ''}`} ref={ref}>
      <button
        type="button"
        className="theme-switcher__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Тема оформления"
        title="Тема оформления"
      >
        <span className="theme-switcher__icon" aria-hidden>
          ◐
        </span>
        {!compact && <span className="theme-switcher__label">{current}</span>}
        <span className={`theme-switcher__caret ${open ? 'theme-switcher__caret--open' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul className="theme-switcher__menu" role="listbox" aria-label="Выбор темы">
          {options.map((o) => (
            <li key={o.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={o.id === theme}
                className={`theme-switcher__item ${o.id === theme ? 'theme-switcher__item--active' : ''}`}
                onClick={() => select(o.id)}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ThemeSwitcher;
