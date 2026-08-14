import { RUST_CATEGORIES, type RustCategoryId } from '../../data/rustCategories';

interface ConveyorCategoryBarProps {
  value: RustCategoryId | '';
  onChange: (value: RustCategoryId | '') => void;
}

function ConveyorCategoryBar({ value, onChange }: ConveyorCategoryBarProps) {
  return (
    <div className="cf-category-bar" role="listbox" aria-label="Категории">
      <button
        type="button"
        className={`cf-category-chip${!value ? ' active' : ''}`}
        onClick={() => onChange('')}
      >
        Все
      </button>
      {RUST_CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`cf-category-chip${value === c.id ? ' active' : ''}`}
          onClick={() => onChange(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export default ConveyorCategoryBar;
