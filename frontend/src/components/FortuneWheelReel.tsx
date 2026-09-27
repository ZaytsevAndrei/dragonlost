import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FORTUNE_WHEEL_RARITY_COLORS,
  type FortuneWheelPrize,
  type WheelSpinTarget,
} from '../constants/fortuneWheel';
import { getImageUrl } from '../services/api';
import { PixelCrateIcon } from './FortuneWheelIcons';
import { playWheelSpinSound, playWheelWinChime, resumeWheelAudio } from '../utils/wheelSpinSound';
import './FortuneWheelReel.css';

const SPIN_DURATION_MS = 4800;
const SPIN_EASING = 'cubic-bezier(0.08, 0.68, 0.06, 1)';
const IDLE_STRIP_LEN = 12;
/** Сколько карточек вокруг указателя переносим с прошлой ленты (до/после). */
const PREFIX_BEFORE = 2;
const PREFIX_AFTER = 3;
/** Случайный наполнитель между переносимыми карточками и победителем. */
const FILLER_COUNT = 42;
/** Карточки после победителя, чтобы лента не обрывалась сразу за ним. */
const TAIL_COUNT = 4;

interface FortuneWheelReelProps {
  prizes: FortuneWheelPrize[];
  available: boolean;
  countdownLabel: string;
  spinTarget: WheelSpinTarget | null;
  disabled: boolean;
  onSpinRequest: () => void;
  onSpinComplete: () => void;
}

interface ReelMetrics {
  /** Отступ первой карточки внутри окна (паддинг трека) — нужен для точного центрирования. */
  baseLeft: number;
  step: number;
  cardW: number;
  containerW: number;
}

function randomPrize(prizes: FortuneWheelPrize[]): FortuneWheelPrize {
  return prizes[Math.floor(Math.random() * prizes.length)];
}

/** Смещение ленты, при котором карточка index стоит ровно под указателем. */
function centerOffset(index: number, metrics: ReelMetrics): number {
  return metrics.containerW / 2 - (metrics.baseLeft + index * metrics.step + metrics.cardW / 2);
}

export function FortuneWheelReel({
  prizes,
  available,
  countdownLabel,
  spinTarget,
  disabled,
  onSpinRequest,
  onSpinComplete,
}: FortuneWheelReelProps) {
  const [strip, setStrip] = useState<FortuneWheelPrize[]>([]);
  const [offset, setOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [litIndex, setLitIndex] = useState<number | null>(null);
  /** Карточка, стоящая под указателем в покое — мягкая подсветка. */
  const [centerLit, setCenterLit] = useState<number | null>(null);

  const windowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const metricsRef = useRef<ReelMetrics | null>(null);
  const stripRef = useRef<FortuneWheelPrize[]>([]);
  const centerIndexRef = useRef(PREFIX_BEFORE);
  const winnerIndexRef = useRef<number | null>(null);
  const skipLayoutCenterRef = useRef(false);
  const stopSoundRef = useRef<(() => void) | null>(null);
  const isAnimatingRef = useRef(false);
  const onSpinCompleteRef = useRef(onSpinComplete);
  onSpinCompleteRef.current = onSpinComplete;
  stripRef.current = strip;

  const measure = useCallback((): ReelMetrics | null => {
    const windowEl = windowRef.current;
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    const second = track?.children[1] as HTMLElement | null;
    if (!windowEl || !first) return null;
    const cardW = first.offsetWidth;
    const baseLeft = first.offsetLeft;
    const step = second ? second.offsetLeft - first.offsetLeft : cardW + 12;
    return { baseLeft, step, cardW, containerW: windowEl.clientWidth };
  }, []);

  // Начальная лента из случайных призов — появляется, когда призы загружены.
  useEffect(() => {
    if (stripRef.current.length > 0 || prizes.length === 0) return;
    centerIndexRef.current = Math.floor(IDLE_STRIP_LEN / 2);
    setStrip(Array.from({ length: IDLE_STRIP_LEN }, () => randomPrize(prizes)));
  }, [prizes]);

  // После каждой смены ленты центрируем карточку под указателем (без анимации),
  // кроме случая, когда анимация уже ведёт ленту к цели.
  useLayoutEffect(() => {
    const metrics = measure();
    if (!metrics) return;
    metricsRef.current = metrics;
    if (isAnimatingRef.current || skipLayoutCenterRef.current) return;
    setOffset(centerOffset(centerIndexRef.current, metrics));
    setCenterLit(centerIndexRef.current);
  }, [strip, measure]);

  // При изменении окна пересчитываем отступы, если лента не крутится.
  useEffect(() => {
    const onResize = () => {
      const metrics = measure();
      if (!metrics) return;
      metricsRef.current = metrics;
      if (!isAnimatingRef.current) {
        setOffset(centerOffset(centerIndexRef.current, metrics));
        setCenterLit(centerIndexRef.current);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  useEffect(() => {
    if (!spinTarget) return;
    if (isAnimatingRef.current) return;

    const winner = prizes[spinTarget.sectorIndex];
    if (!winner || prizes.length === 0 || stripRef.current.length === 0) return;

    const metrics = measure() ?? metricsRef.current;
    if (!metrics) return;
    metricsRef.current = metrics;

    const from = Math.max(0, centerIndexRef.current - PREFIX_BEFORE);
    const prefix = stripRef.current.slice(from, centerIndexRef.current + PREFIX_AFTER);
    const winnerIndex = prefix.length + FILLER_COUNT;
    const filler = Array.from({ length: FILLER_COUNT }, () => randomPrize(prizes));
    const tail = Array.from({ length: TAIL_COUNT }, () => randomPrize(prizes));

    winnerIndexRef.current = winnerIndex;
    setLitIndex(null);
    setCenterLit(null);
    // Лента сменяется так, что видимые карточки остаются на месте:
    // бывшая карточка под указателем теперь стоит на позиции PREFIX_BEFORE.
    centerIndexRef.current = PREFIX_BEFORE;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const jitter = (Math.random() - 0.5) * 0.55 * metrics.step;
    const finalOffset = centerOffset(winnerIndex, metrics) + jitter;

    if (reducedMotion) {
      skipLayoutCenterRef.current = true;
      setStrip([...prefix, ...filler, winner, ...tail]);
      requestAnimationFrame(() => {
        skipLayoutCenterRef.current = false;
        setOffset(finalOffset);
        setLitIndex(winnerIndex);
        setCenterLit(winnerIndex);
        centerIndexRef.current = winnerIndex;
        playWheelWinChime();
        onSpinCompleteRef.current();
      });
      return;
    }

    setStrip([...prefix, ...filler, winner, ...tail]);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isAnimatingRef.current = true;
        setIsAnimating(true);
        stopSoundRef.current?.();
        stopSoundRef.current = playWheelSpinSound(SPIN_DURATION_MS);
        setOffset(finalOffset);
      });
    });
  }, [spinTarget, prizes, measure]);

  const handleTrackTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'transform' || !isAnimatingRef.current) return;
    isAnimatingRef.current = false;
    setIsAnimating(false);
    stopSoundRef.current?.();
    stopSoundRef.current = null;

    const winnerIndex = winnerIndexRef.current;
    winnerIndexRef.current = null;
    if (winnerIndex !== null) {
      centerIndexRef.current = winnerIndex;
      setLitIndex(winnerIndex);
      setCenterLit(winnerIndex);
      playWheelWinChime();
    }
    onSpinCompleteRef.current();
  };

  useEffect(() => () => stopSoundRef.current?.(), []);

  const handleActivate = () => {
    if (!available || disabled || isAnimating) return;
    resumeWheelAudio();
    onSpinRequest();
  };

  const interactive = available && !disabled && !isAnimating;

  return (
    <div className="fwr-root">
      <div
        className={`fwr-scene ${interactive ? 'fwr-scene-ready' : ''} ${isAnimating ? 'fwr-scene-spinning' : ''}`}
        role="group"
        aria-label="Рулетка колеса удачи"
      >
        <div className="fwr-stage">
          <div className="fwr-aura" aria-hidden />
          <button
            type="button"
            className="fwr-hit"
            disabled={!interactive}
            onClick={handleActivate}
            aria-label={
              available ? 'Крутить рулетку удачи' : `Следующее вращение через ${countdownLabel}`
            }
          >
            <div ref={windowRef} className="fwr-window">
              <div
                ref={trackRef}
                className="fwr-track"
                style={{
                  transform: `translateX(${offset}px)`,
                  transition: isAnimating ? `transform ${SPIN_DURATION_MS}ms ${SPIN_EASING}` : 'none',
                }}
                onTransitionEnd={handleTrackTransitionEnd}
              >
                {strip.map((prize, index) => (
                  <div
                    key={`${index}-${prize.id}`}
                    className={`fwr-card rarity-${prize.rarity} ${litIndex === index ? 'fwr-card-winner' : ''} ${
                      centerLit === index ? 'fwr-card-center' : ''
                    }`}
                    style={{ '--rarity-color': FORTUNE_WHEEL_RARITY_COLORS[prize.rarity].mid } as React.CSSProperties}
                  >
                    <div className="fwr-card-icon">
                      {prize.image_url ? (
                        <img src={getImageUrl(prize.image_url)} alt={prize.name} loading="lazy" />
                      ) : (
                        <PixelCrateIcon width={44} height={44} />
                      )}
                    </div>
                    <span className="fwr-card-name" title={prize.name}>{prize.wheel_label}</span>
                  </div>
                ))}
              </div>
              <div className="fwr-pointer" aria-hidden />
            </div>
          </button>
        </div>

        <p className={`fwr-hint ${available ? 'fwr-hint-ready' : 'fwr-hint-wait'}`}>
          {isAnimating ? (
            <>
              <span className="fwr-spinner" aria-hidden />
              Крутим…
            </>
          ) : available ? (
            'Нажмите на ленту'
          ) : (
            <>
              До следующего вращения: <strong>{countdownLabel}</strong>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default FortuneWheelReel;
