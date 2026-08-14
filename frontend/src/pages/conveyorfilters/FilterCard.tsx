import { useState } from 'react';
import { Link } from 'react-router-dom';
import { rustCategoryLabel } from '../../data/rustCategories';
import { findRustItem, rustItemIconUrl } from '../../data/rustItems';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { ConveyorFilter, copyText, exportConveyorJson } from '../../utils/conveyorExport';

interface FilterCardProps {
  filter: ConveyorFilter;
  onChanged?: () => void;
  showOwner?: boolean;
}

function FilterCard({ filter, onChanged, showOwner = true }: FilterCardProps) {
  const { user } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const handleExport = async () => {
    try {
      setBusy(true);
      const json = exportConveyorJson(filter.items);
      const ok = await copyText(json);

      try {
        await api.post(`/conveyor-filters/${filter.id}/export`);
        onChanged?.();
      } catch {
        if (!ok) throw new Error('export failed');
      }

      flash(ok ? 'Скопировано в буфер обмена' : 'Не удалось скопировать');
    } catch {
      flash('Ошибка экспорта');
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    if (!user) return;
    try {
      setBusy(true);
      if (filter.is_saved) {
        await api.delete(`/conveyor-filters/${filter.id}/save`);
      } else {
        await api.post(`/conveyor-filters/${filter.id}/save`);
      }
      onChanged?.();
    } catch {
      flash('Не удалось обновить избранное');
    } finally {
      setBusy(false);
    }
  };

  const cover =
    filter.cover_shortname || filter.items?.[0]?.TargetItemName || '';
  const coverMeta = cover ? findRustItem(cover) : undefined;
  const categoryLabel = rustCategoryLabel(filter.category);

  return (
    <article className="cf-card">
      <div className="cf-card-preview">
        {cover ? (
          <img
            src={rustItemIconUrl(cover)}
            alt={coverMeta?.name || cover}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="cf-card-preview-empty" aria-hidden="true" />
        )}
      </div>
      <div className="cf-card-body">
        <div className="cf-card-top">
          <h3>
            <Link to={`/conveyorfilters/${filter.id}`}>{filter.title}</Link>
          </h3>
          {filter.is_public ? <span className="cf-badge">Public</span> : <span className="cf-badge muted">Private</span>}
        </div>
        {filter.description && <p className="cf-card-desc">{filter.description}</p>}
        <div className="cf-card-meta">
          {categoryLabel && <span className="cf-card-category">{categoryLabel}</span>}
          {showOwner && filter.owner_username && (
            <span className="cf-owner">
              {filter.owner_avatar && <img src={filter.owner_avatar} alt="" />}
              {filter.owner_username}
            </span>
          )}
          <span>{filter.item_count} предметов</span>
          <span>{filter.export_count} экспортов</span>
        </div>
        <div className="cf-card-actions">
          <button type="button" className="cf-btn cf-btn-primary" disabled={busy} onClick={() => void handleExport()}>
            Экспорт
          </button>
          <Link to={`/conveyorfilters/${filter.id}`} className="cf-btn">
            Открыть
          </Link>
          {user && user.steamid !== filter.owner_steamid && (
            <button type="button" className="cf-btn" disabled={busy} onClick={() => void toggleSave()}>
              {filter.is_saved ? 'Убрать' : 'Сохранить'}
            </button>
          )}
        </div>
        {toast && <p className="cf-toast">{toast}</p>}
      </div>
    </article>
  );
}

export default FilterCard;
