import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import './VouchersAdmin.css';

interface Voucher {
  id: number;
  code: string;
  amount: number;
  valid_from: string | null;
  valid_until: string | null;
  max_activations_total: number | null;
  activations_count: number;
  max_activations_per_user: number;
  weekly_repeat: number;
  is_active: number;
  redemption_count: number;
  created_at: string;
}

function formatForInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const emptyForm = {
  code: '',
  amount: '100',
  valid_from: '',
  valid_until: '',
  max_activations_total: '',
  max_activations_per_user: '1',
  weekly_repeat: false,
};

function VouchersAdmin() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ vouchers: Voucher[] }>('/admin/vouchers');
      setVouchers(res.data.vouchers || []);
      setError(null);
    } catch {
      setError('Не удалось загрузить промокоды');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (v: Voucher) => {
    setEditingId(v.id);
    setForm({
      code: v.code,
      amount: String(v.amount),
      valid_from: formatForInput(v.valid_from),
      valid_until: formatForInput(v.valid_until),
      max_activations_total: v.max_activations_total != null ? String(v.max_activations_total) : '',
      max_activations_per_user: String(v.max_activations_per_user),
      weekly_repeat: v.weekly_repeat === 1,
    });
  };

  const submit = async () => {
    if (saving) return;
    const code = form.code.trim();
    if (!code) {
      setError('Укажите код промокода');
      return;
    }
    const amount = Number.parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Укажите положительную сумму');
      return;
    }

    const payload: Record<string, unknown> = {
      code,
      amount,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      max_activations_total: form.max_activations_total.trim() === '' ? null : Number.parseInt(form.max_activations_total, 10),
      max_activations_per_user: Number.parseInt(form.max_activations_per_user, 10) || 1,
      weekly_repeat: form.weekly_repeat,
    };

    if (payload.max_activations_total !== null && (typeof payload.max_activations_total !== 'number' || payload.max_activations_total < 1)) {
      setError('Лимит активаций (всего) — целое число ≥ 1 или пусто');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      if (editingId != null) {
        await api.patch(`/admin/vouchers/${editingId}`, payload);
      } else {
        await api.post('/admin/vouchers', payload);
      }
      resetForm();
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Ошибка сохранения';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (v: Voucher) => {
    try {
      setError(null);
      await api.patch(`/admin/vouchers/${v.id}`, { is_active: v.is_active !== 1 });
      await load();
    } catch {
      setError('Не удалось изменить статус');
    }
  };

  return (
    <div className="va-page">
      <div className="va-header">
        <h1>Промокоды</h1>
        <p className="va-lead">
          Сроки действия, общий лимит активаций и лимит на пользователя. Режим «раз в неделю»: лимит на пользователя
          обнуляется каждую календарную неделю (ISO, с понедельника).
        </p>
      </div>

      {error && (
        <div className="va-error">
          <span>{error}</span>
          <button type="button" className="va-error-close" onClick={() => setError(null)} aria-label="Закрыть">
            ×
          </button>
        </div>
      )}

      <section className="va-card">
        <h2>{editingId != null ? `Редактирование #${editingId}` : 'Новый промокод'}</h2>
        <div className="va-form-grid">
          <label className="va-field">
            <span>Код</span>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              maxLength={64}
              placeholder="например WIPE2026"
            />
          </label>
          <label className="va-field">
            <span>Сумма, ₽</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          <label className="va-field">
            <span>Действует с</span>
            <input
              type="datetime-local"
              value={form.valid_from}
              onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
            />
          </label>
          <label className="va-field">
            <span>Действует до</span>
            <input
              type="datetime-local"
              value={form.valid_until}
              onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
            />
          </label>
          <label className="va-field">
            <span>Макс. активаций всего</span>
            <input
              type="number"
              min={1}
              placeholder="пусто = без лимита"
              value={form.max_activations_total}
              onChange={(e) => setForm((f) => ({ ...f, max_activations_total: e.target.value }))}
            />
          </label>
          <label className="va-field">
            <span>На одного пользователя</span>
            <input
              type="number"
              min={1}
              value={form.max_activations_per_user}
              onChange={(e) => setForm((f) => ({ ...f, max_activations_per_user: e.target.value }))}
            />
          </label>
          <label className="va-field va-field-check">
            <input
              type="checkbox"
              checked={form.weekly_repeat}
              onChange={(e) => setForm((f) => ({ ...f, weekly_repeat: e.target.checked }))}
            />
            <span>Повторять лимит на пользователя каждую неделю</span>
          </label>
        </div>
        <div className="va-actions">
          <button type="button" className="va-btn-primary" disabled={saving} onClick={submit}>
            {saving ? 'Сохранение…' : editingId != null ? 'Сохранить' : 'Создать'}
          </button>
          {editingId != null && (
            <button type="button" className="va-btn-secondary" onClick={resetForm}>
              Отменить редактирование
            </button>
          )}
        </div>
      </section>

      <section className="va-card va-table-wrap">
        <h2>Список</h2>
        {loading ? (
          <p className="va-muted">Загрузка…</p>
        ) : vouchers.length === 0 ? (
          <p className="va-muted">Промокодов пока нет</p>
        ) : (
          <div className="va-table-scroll">
            <table className="va-table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>₽</th>
                  <th>Срок</th>
                  <th>Всего / лимит</th>
                  <th>На юзера</th>
                  <th>Неделя</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id} className={v.is_active !== 1 ? 'va-row-inactive' : undefined}>
                    <td>
                      <code>{v.code}</code>
                    </td>
                    <td>{Number(v.amount).toFixed(2)}</td>
                    <td className="va-dates">
                      <div>{formatDisplay(v.valid_from)}</div>
                      <div>{formatDisplay(v.valid_until)}</div>
                    </td>
                    <td>
                      {v.redemption_count ?? v.activations_count}
                      {v.max_activations_total != null ? ` / ${v.max_activations_total}` : ' / ∞'}
                    </td>
                    <td>{v.max_activations_per_user}</td>
                    <td>{v.weekly_repeat === 1 ? 'да' : 'нет'}</td>
                    <td>{v.is_active === 1 ? 'вкл' : 'выкл'}</td>
                    <td className="va-row-actions">
                      <button type="button" className="va-btn-small" onClick={() => startEdit(v)}>
                        Изменить
                      </button>
                      <button type="button" className="va-btn-small" onClick={() => toggleActive(v)}>
                        {v.is_active === 1 ? 'Выключить' : 'Включить'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default VouchersAdmin;
