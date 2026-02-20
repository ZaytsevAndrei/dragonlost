import { useEffect, useState, useCallback } from 'react';
import { api, getImageUrl } from '../services/api';
import { useAuthStore } from '../store/authStore';
import './MapVote.css';

interface MapOption {
  id: number;
  map_name: string;
  map_seed: number | null;
  map_size: number | null;
  image_url: string | null;
  description: string | null;
  vote_count: number;
  percentage: number;
}

interface VoteSession {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  total_votes: number;
}

function MapVote() {
  const { user } = useAuthStore();
  const [session, setSession] = useState<VoteSession | null>(null);
  const [options, setOptions] = useState<MapOption[]>([]);
  const [userVote, setUserVote] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const fetchActiveVote = useCallback(async () => {
    try {
      const res = await api.get('/map-vote/active');
      setSession(res.data.session);
      setOptions(res.data.options || []);
      setUserVote(res.data.user_vote || null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchActiveVote();
  }, [fetchActiveVote]);

  useEffect(() => {
    if (!session) return;

    const update = () => {
      const now = new Date().getTime();
      const end = new Date(session.ends_at).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('Завершено');
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (d > 0) {
        setTimeLeft(`${d}д ${h}ч ${m}м`);
      } else if (h > 0) {
        setTimeLeft(`${h}ч ${m}м`);
      } else {
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${m}м ${s}с`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session]);

  const handleVote = useCallback(async (optionId: number) => {
    if (voting || !user) return;
    try {
      setVoting(true);
      await api.post('/map-vote/vote', { option_id: optionId });
      setUserVote(optionId);
      await fetchActiveVote();
    } catch {
      // ignore
    } finally {
      setVoting(false);
    }
  }, [voting, user, fetchActiveVote]);

  if (!session || options.length === 0) return null;

  return (
    <div className="map-vote">
      <div className="map-vote-header">
        <div className="map-vote-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
            <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
            <path d="M8 2v16" />
            <path d="M16 6v16" />
          </svg>
          <h2>{session.title}</h2>
        </div>
        <div className="map-vote-meta">
          <span className="map-vote-timer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            {timeLeft}
          </span>
          <span className="map-vote-total">
            {session.total_votes} {pluralVotes(session.total_votes)}
          </span>
        </div>
      </div>

      <div className="map-vote-grid">
        {options.map((opt) => {
          const isSelected = userVote === opt.id;
          const isLeading = options.length > 0 && opt.vote_count === Math.max(...options.map(o => o.vote_count)) && opt.vote_count > 0;

          return (
            <button
              key={opt.id}
              className={`map-vote-card ${isSelected ? 'map-vote-card-selected' : ''} ${isLeading ? 'map-vote-card-leading' : ''}`}
              onClick={() => handleVote(opt.id)}
              disabled={voting || !user}
              type="button"
            >
              {opt.image_url ? (
                <div className="map-vote-img">
                  <img
                    src={getImageUrl(opt.image_url)}
                    alt={opt.map_name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="map-vote-img map-vote-img-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                    <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                    <path d="M8 2v16" />
                    <path d="M16 6v16" />
                  </svg>
                </div>
              )}

              <div className="map-vote-card-body">
                <div className="map-vote-card-name">{opt.map_name}</div>

                {(opt.map_size || opt.map_seed) && (
                  <div className="map-vote-card-details">
                    {opt.map_size && <span>{opt.map_size}m</span>}
                    {opt.map_seed && <span>seed: {opt.map_seed}</span>}
                  </div>
                )}

                {opt.description && (
                  <p className="map-vote-card-desc">{opt.description}</p>
                )}

                <div className="map-vote-bar-wrap">
                  <div className="map-vote-bar" style={{ width: `${opt.percentage}%` }} />
                </div>

                <div className="map-vote-card-footer">
                  <span className="map-vote-count">{opt.vote_count} голосов</span>
                  <span className="map-vote-pct">{opt.percentage}%</span>
                </div>
              </div>

              {isSelected && (
                <div className="map-vote-check">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="18" height="18"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
              )}

              {isLeading && !isSelected && (
                <div className="map-vote-leading-badge">Лидер</div>
              )}
            </button>
          );
        })}
      </div>

      {!user && (
        <p className="map-vote-login-hint">
          Войдите через Steam, чтобы проголосовать
        </p>
      )}
    </div>
  );
}

function pluralVotes(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return 'голосов';
  if (last === 1) return 'голос';
  if (last >= 2 && last <= 4) return 'голоса';
  return 'голосов';
}

export default MapVote;
