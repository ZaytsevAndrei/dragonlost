import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  FORTUNE_WHEEL_RARITY_COLORS,
  fortuneWheelSpinDelta,
  type FortuneWheelPrize,
  type WheelSpinTarget,
} from '../constants/fortuneWheel';
import { playWheelSpinSound, playWheelWinChime, resumeWheelAudio } from '../utils/wheelSpinSound';
import './FortuneWheelDisk.css';

const SPIN_DURATION_MS = 4800;
const WHEEL_SIZE = 400;
const WHEEL_R = WHEEL_SIZE / 2;
const INNER_R = 58;
const OUTER_R = WHEEL_R - 14;

function polarToCartesian(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: WHEEL_R + radius * Math.cos(rad),
    y: WHEEL_R + radius * Math.sin(rad),
  };
}

interface FortuneWheelDiskProps {
  prizes: FortuneWheelPrize[];
  available: boolean;
  countdownLabel: string;
  spinTarget: WheelSpinTarget | null;
  disabled: boolean;
  onSpinRequest: () => void;
  onSpinComplete: () => void;
}

export function FortuneWheelDisk({
  prizes,
  available,
  countdownLabel,
  spinTarget,
  disabled,
  onSpinRequest,
  onSpinComplete,
}: FortuneWheelDiskProps) {
  const labelId = useId();
  const gradPrefix = labelId.replace(/:/g, '');
  const wheelRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const [rotation, setRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [litSector, setLitSector] = useState<number | null>(null);
  const stopSoundRef = useRef<(() => void) | null>(null);
  const lastSpinKeyRef = useRef<string | null>(null);
  const isAnimatingRef = useRef(false);
  const onSpinCompleteRef = useRef(onSpinComplete);
  onSpinCompleteRef.current = onSpinComplete;

  const sectorCount = prizes.length;
  const degreesPerSector = sectorCount > 0 ? 360 / sectorCount : 360;
  const rarities = [...new Set(prizes.map((prize) => prize.rarity))];

  const describeSector = useCallback(
    (index: number): string => {
      const startAngle = index * degreesPerSector - 90;
      const endAngle = startAngle + degreesPerSector;
      const start = polarToCartesian(startAngle, OUTER_R);
      const end = polarToCartesian(endAngle, OUTER_R);
      const innerStart = polarToCartesian(startAngle, INNER_R);
      const innerEnd = polarToCartesian(endAngle, INNER_R);
      const largeArc = degreesPerSector > 180 ? 1 : 0;

      return [
        `M ${innerStart.x} ${innerStart.y}`,
        `L ${start.x} ${start.y}`,
        `A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${end.x} ${end.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
        'Z',
      ].join(' ');
    },
    [degreesPerSector]
  );

  const sectorLabelPosition = useCallback(
    (index: number): { x: number; y: number; rotate: number } => {
      const midAngle = index * degreesPerSector + degreesPerSector / 2 - 90;
      const rad = (midAngle * Math.PI) / 180;
      const labelR = (INNER_R + OUTER_R) / 2 + 6;
      return {
        x: WHEEL_R + labelR * Math.cos(rad),
        y: WHEEL_R + labelR * Math.sin(rad),
        rotate: midAngle + 90,
      };
    },
    [degreesPerSector]
  );

  const runSpinAnimation = useCallback(
    (sectorIndex: number) => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const base = rotationRef.current;
      const delta = fortuneWheelSpinDelta(base, sectorIndex, sectorCount);
      const next = base + delta;
      rotationRef.current = next;

      if (reducedMotion) {
        setRotation(next);
        setLitSector(sectorIndex);
        playWheelWinChime();
        onSpinCompleteRef.current();
        return;
      }

      isAnimatingRef.current = true;
      setIsAnimating(true);
      setLitSector(null);
      stopSoundRef.current?.();
      stopSoundRef.current = playWheelSpinSound(SPIN_DURATION_MS);

      requestAnimationFrame(() => {
        setRotation(next);
      });
    },
    [sectorCount]
  );

  useEffect(() => {
    if (!spinTarget) {
      lastSpinKeyRef.current = null;
      return;
    }
    const key = String(spinTarget.sectorIndex);
    if (key === lastSpinKeyRef.current) return;
    lastSpinKeyRef.current = key;
    runSpinAnimation(spinTarget.sectorIndex);
  }, [spinTarget, runSpinAnimation]);

  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'transform') return;
      if (!isAnimatingRef.current) return;
      isAnimatingRef.current = false;
      setIsAnimating(false);
      stopSoundRef.current?.();
      stopSoundRef.current = null;
      if (spinTarget) {
        setLitSector(spinTarget.sectorIndex);
        playWheelWinChime();
      }
      onSpinCompleteRef.current();
    };

    el.addEventListener('transitionend', onEnd);
    return () => el.removeEventListener('transitionend', onEnd);
  }, [spinTarget]);

  const handleActivate = () => {
    if (!available || disabled || isAnimating) return;
    resumeWheelAudio();
    onSpinRequest();
  };

  const interactive = available && !disabled && !isAnimating;

  return (
    <div className="fw-root">
      <div
        className={`fw-scene ${interactive ? 'fw-scene-ready' : ''} ${isAnimating ? 'fw-scene-spinning' : ''}`}
        role="group"
        aria-labelledby={labelId}
      >
        <div className="fw-stage">
          <div className="fw-aura" aria-hidden />
          <div className="fw-frame">
            <div className="fw-pointer" aria-hidden>
              <svg className="fw-pointer-svg" viewBox="0 0 40 48" width="40" height="48">
                <defs>
                  <linearGradient id={`${gradPrefix}-ptr`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ffd080" />
                    <stop offset="45%" stopColor="#e87d3e" />
                    <stop offset="100%" stopColor="#a84a18" />
                  </linearGradient>
                </defs>
                <path
                  d="M20 44 L6 14 Q6 8 20 4 Q34 8 34 14 Z"
                  fill={`url(#${gradPrefix}-ptr)`}
                  stroke="#5c3010"
                  strokeWidth="1.5"
                />
                <circle cx="20" cy="12" r="4" fill="#2a1810" stroke="#1a1008" strokeWidth="1" />
              </svg>
            </div>

            <button
              type="button"
              className="fw-wheel-hit"
              disabled={!interactive}
              onClick={handleActivate}
              aria-label={
                available ? 'Крутить колесо удачи' : `Следующее вращение через ${countdownLabel}`
              }
            >
              <div
                ref={wheelRef}
                className="fw-wheel-rotor"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: isAnimating
                    ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.75, 0.1, 1)`
                    : 'none',
                }}
              >
                <svg
                  className="fw-wheel-svg"
                  viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
                  width={WHEEL_SIZE}
                  height={WHEEL_SIZE}
                  aria-hidden
                >
                  <defs>
                    {rarities.map((rarity) => {
                      const colors = FORTUNE_WHEEL_RARITY_COLORS[rarity];
                      return (
                        <radialGradient
                          key={rarity}
                          id={`${gradPrefix}-tier-${rarity}`}
                          cx="50%"
                          cy="50%"
                          r="75%"
                          gradientUnits="userSpaceOnUse"
                          gradientTransform={`translate(${WHEEL_R} ${WHEEL_R})`}
                        >
                          <stop offset="0%" stopColor={colors.light} />
                          <stop offset="55%" stopColor={colors.mid} />
                          <stop offset="100%" stopColor={colors.dark} />
                        </radialGradient>
                      );
                    })}
                    <radialGradient id={`${gradPrefix}-hub`} cx="38%" cy="32%" r="68%">
                      <stop offset="0%" stopColor="#f5ead8" />
                      <stop offset="50%" stopColor="#c9a87a" />
                      <stop offset="100%" stopColor="#6b4428" />
                    </radialGradient>
                  </defs>

                  <circle cx={WHEEL_R} cy={WHEEL_R} r={OUTER_R + 10} className="fw-rim-shadow" />

                  {prizes.map((prize, index) => {
                    const colors = FORTUNE_WHEEL_RARITY_COLORS[prize.rarity];
                    const isWinner = litSector === index;
                    const isLegendary = prize.rarity === 'legendary';

                    return (
                      <path
                        key={`seg-${prize.id}`}
                        d={describeSector(index)}
                        fill={`url(#${gradPrefix}-tier-${prize.rarity})`}
                        stroke={colors.stroke}
                        strokeWidth={1}
                        className={`fw-sector ${isWinner ? 'fw-sector-winner' : ''} ${isLegendary ? 'fw-sector-legendary' : ''}`}
                        style={isWinner ? { filter: `drop-shadow(0 0 10px ${colors.glow})` } : undefined}
                      />
                    );
                  })}

                  {prizes.map((prize, index) => {
                    const angle = index * degreesPerSector - 90;
                    const inner = polarToCartesian(angle, INNER_R);
                    const outer = polarToCartesian(angle, OUTER_R);
                    return (
                      <line
                        key={`div-${prize.id}`}
                        x1={inner.x}
                        y1={inner.y}
                        x2={outer.x}
                        y2={outer.y}
                        className="fw-divider"
                      />
                    );
                  })}

                  {prizes.map((prize, index) => {
                    const label = sectorLabelPosition(index);
                    return (
                      <text
                        key={`lbl-${prize.id}`}
                        x={label.x}
                        y={label.y}
                        className={`fw-sector-label ${prize.rarity === 'legendary' ? 'fw-sector-label-legendary' : ''}`}
                        fontSize={prize.wheel_label.length > 8 ? 11 : 13}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${label.rotate}, ${label.x}, ${label.y})`}
                      >
                        {prize.wheel_label}
                      </text>
                    );
                  })}

                  <circle cx={WHEEL_R} cy={WHEEL_R} r={OUTER_R + 8} className="fw-outer-rim" fill="none" />
                  <circle cx={WHEEL_R} cy={WHEEL_R} r={OUTER_R + 4} className="fw-outer-rim-inner" fill="none" />

                  <circle cx={WHEEL_R} cy={WHEEL_R} r={INNER_R} fill={`url(#${gradPrefix}-hub)`} className="fw-hub" />
                  <circle cx={WHEEL_R} cy={WHEEL_R} r={INNER_R} className="fw-hub-ring" fill="none" />
                  <text
                    x={WHEEL_R}
                    y={WHEEL_R}
                    className="fw-hub-label"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    SPIN
                  </text>
                  <circle cx={WHEEL_R} cy={WHEEL_R} r={8} className="fw-hub-axle" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        <p id={labelId} className={`fw-hint ${available ? 'fw-hint-ready' : 'fw-hint-wait'}`}>
          {isAnimating ? (
            <>
              <span className="fw-hint-icon" aria-hidden>
                ◌
              </span>
              Крутим…
            </>
          ) : available ? (
            <>
              <span className="fw-hint-icon" aria-hidden>
                ↻
              </span>
              Нажмите на колесо
            </>
          ) : (
            <>
              <span className="fw-hint-icon" aria-hidden>
                ⏱
              </span>
              До следующего вращения: <strong>{countdownLabel}</strong>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default FortuneWheelDisk;
