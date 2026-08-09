import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import {
  ConveyorFilter,
  copyText,
  downloadText,
  exportConveyorJson,
} from '../../utils/conveyorExport';

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
      const res = await api.post<{ json: string; filename: string }>(`/conveyor-filters/${filter.id}/export`);
      const json = res.data.json || exportConveyorJson(filter.items);
      const ok = await copyText(json);
      downloadText(res.data.filename || `${filter.title}.json`, json);
      flash(ok ? 'Скопировано и скачано' : 'Файл скачан');
      onChanged?.();
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

  return (
    <article className="cf-card">
      <div className="cf-card-top">
        <h3>
          <Link to={`/conveyorfilters/${filter.id}`}>{filter.title}</Link>
        </h3>
        {filter.is_public ? <span className="cf-badge">Public</span> : <span className="cf-badge muted">Private</span>}
      </div>
      {filter.description && <p className="cf-card-desc">{filter.description}</p>}
      <div className="cf-card-meta">
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
    </article>
  );
}

export default FilterCard;
