import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  DAILY_REWARD_WHEEL_SECTORS,
  WHEEL_DEGREES_PER_SECTOR,
  WHEEL_TIER_COLORS,
  wheelSpinDelta,
  type DailyRewardWheelAmount,
} from '../constants/dailyRewardWheel';
import { playWheelSpinSound, playWheelWinChime, resumeWheelAudio } from '../utils/wheelSpinSound';
import './DailyRewardWheel.css';

const SPIN_DURATION_MS = 4800;
const WHEEL_SIZE = 400;
const WHEEL_R = WHEEL_SIZE / 2;
const INNER_R = 62;
const OUTER_R = WHEEL_R - 6;

function polarToCartesian(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: WHEEL_R + radius * Math.cos(rad),
    y: WHEEL_R + radius * Math.sin(rad),
  };
}

function describeSector(index: number): string {
  const startAngle = index * WHEEL_DEGREES_PER_SECTOR - 90;
  const endAngle = startAngle + WHEEL_DEGREES_PER_SECTOR;
  const start = polarToCartesian(startAngle, OUTER_R);
  const end = polarToCartesian(endAngle, OUTER_R);
  const innerStart = polarToCartesian(startAngle, INNER_R);
  const innerEnd = polarToCartesian(endAngle, INNER_R);
  const largeArc = WHEEL_DEGREES_PER_SECTOR > 180 ? 1 : 0;

  return [
    `M ${innerStart.x} ${innerStart.y}`,
    `L ${start.x} ${start.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function sectorLabelPosition(index: number): { x: number; y: number; rotate: number } {
  const midAngle = index * WHEEL_DEGREES_PER_SECTOR + WHEEL_DEGREES_PER_SECTOR / 2 - 90;
  const rad = (midAngle * Math.PI) / 180;
  const labelR = (INNER_R + OUTER_R) / 2 + 8;
  return {
    x: WHEEL_R + labelR * Math.cos(rad),
    y: WHEEL_R + labelR * Math.sin(rad),
    rotate: midAngle,
  };
}

export interface WheelSpinTarget {
  sectorIndex: number;
  reward: number;
}

interface DailyRewardWheelProps {
  available: boolean;
  countdownLabel: string;
  spinTarget: WheelSpinTarget | null;
  disabled: boolean;
  onSpinRequest: () => void;
  onSpinComplete: () => void;
}

export function DailyRewardWheel({
  available,
  countdownLabel,
  spinTarget,
  disabled,
  onSpinRequest,
  onSpinComplete,
}: DailyRewardWheelProps) {
  const labelId = useId();
  const wheelRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const [rotation, setRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [litSector, setLitSector] = useState<number | null>(null);
  const stopSoundRef = useRef<(() => void) | null>(null);
  const lastSpinKeyRef = useRef<string | null>(null);

  const runSpinAnimation = useCallback(
    (sectorIndex: number) => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const base = rotationRef.current;
      const delta = wheelSpinDelta(base, sectorIndex, 6);
      const next = base + delta;
      rotationRef.current = next;

      if (reducedMotion) {
        setRotation(next);
        setLitSector(sectorIndex);
        playWheelWinChime();
        onSpinComplete();
        return;
      }

      setIsAnimating(true);
      setLitSector(null);
      stopSoundRef.current?.();
      stopSoundRef.current = playWheelSpinSound(SPIN_DURATION_MS);

      requestAnimationFrame(() => {
        setRotation(next);
      });
    },
    [onSpinComplete]
  );

  useEffect(() => {
    if (!spinTarget) return;
    const key = `${spinTarget.sectorIndex}:${spinTarget.reward}`;
    if (key === lastSpinKeyRef.current) return;
    lastSpinKeyRef.current = key;
    runSpinAnimation(spinTarget.sectorIndex);
  }, [spinTarget, runSpinAnimation]);

  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'transform') return;
      if (!isAnimating) return;
      setIsAnimating(false);
      stopSoundRef.current?.();
      stopSoundRef.current = null;
      if (spinTarget) {
        setLitSector(spinTarget.sectorIndex);
        playWheelWinChime();
      }
      onSpinComplete();
    };

    el.addEventListener('transitionend', onEnd);
    return () => el.removeEventListener('transitionend', onEnd);
  }, [isAnimating, spinTarget, onSpinComplete]);

  const handleActivate = () => {
    if (!available || disabled || isAnimating) return;
    resumeWheelAudio();
    onSpinRequest();
  };

  const interactive = available && !disabled && !isAnimating;

  return (
    <div className="drw-root">
      <div
        className={`drw-scene ${interactive ? 'drw-scene-ready' : ''} ${isAnimating ? 'drw-scene-spinning' : ''}`}
        role="group"
        aria-labelledby={labelId}
      >
        <div className="drw-wood-bg" aria-hidden />

        <div className="drw-frame">
          <div className="drw-pointer" aria-hidden>
            <span className="drw-pointer-arrow" />
          </div>

          <button
            type="button"
            className="drw-wheel-hit"
            disabled={!interactive}
            onClick={handleActivate}
            aria-label={
              available ? 'Крутить колесо ежедневной награды' : `Следующее вращение через ${countdownLabel}`
            }
          >
            <div
              ref={wheelRef}
              className="drw-wheel-rotor"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: isAnimating
                  ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.75, 0.1, 1)`
                  : 'none',
              }}
            >
              <svg
                className="drw-wheel-svg"
                viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
                width={WHEEL_SIZE}
                height={WHEEL_SIZE}
                aria-hidden
              >
                <defs>
                  <filter id="drw-rust-grunge" x="-10%" y="-10%" width="120%" height="120%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
                    <feColorMatrix type="saturate" values="0" in="noise" result="gray" />
                    <feBlend in="SourceGraphic" in2="gray" mode="multiply" />
                  </filter>
                  <radialGradient id="drw-hub-rust" cx="45%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#e8dfd0" />
                    <stop offset="45%" stopColor="#c9b89a" />
                    <stop offset="100%" stopColor="#8b5a3c" />
                  </radialGradient>
                </defs>

                <g filter="url(#drw-rust-grunge)">
                  {DAILY_REWARD_WHEEL_SECTORS.map((amount, index) => {
                    const colors = WHEEL_TIER_COLORS[amount as DailyRewardWheelAmount];
                    const isWinner = litSector === index;

                    return (
                      <path
                        key={`seg-${index}`}
                        d={describeSector(index)}
                        fill={colors.fill}
                        stroke={colors.stroke}
                        strokeWidth={1.2}
                        className={isWinner ? 'drw-sector-winner' : 'drw-sector'}
                      />
                    );
                  })}
                </g>

                {DAILY_REWARD_WHEEL_SECTORS.map((amount, index) => {
                  const label = sectorLabelPosition(index);
                  const fontSize = amount >= 100 ? 15 : amount >= 50 ? 17 : 19;

                  return (
                    <text
                      key={`lbl-${index}`}
                      x={label.x}
                      y={label.y}
                      className="drw-sector-num"
                      fontSize={fontSize}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${label.rotate}, ${label.x}, ${label.y})`}
                    >
                      {amount}
                    </text>
                  );
                })}

                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                  const inner = polarToCartesian(deg - 90, INNER_R - 4);
                  const outer = polarToCartesian(deg - 90, OUTER_R + 2);
                  return (
                    <line
                      key={`spoke-${deg}`}
                      x1={inner.x}
                      y1={inner.y}
                      x2={outer.x}
                      y2={outer.y}
                      className="drw-spoke"
                    />
                  );
                })}

                <circle cx={WHEEL_R} cy={WHEEL_R} r={INNER_R - 3} fill="url(#drw-hub-rust)" className="drw-hub" />
                <circle cx={WHEEL_R} cy={WHEEL_R} r={INNER_R - 3} className="drw-hub-ring" fill="none" />
                <circle cx={WHEEL_R} cy={WHEEL_R} r={10} className="drw-hub-axle" />

                <circle cx={WHEEL_R} cy={WHEEL_R} r={OUTER_R + 1} className="drw-outer-rim" fill="none" />
              </svg>
            </div>
          </button>
        </div>

        <p id={labelId} className="drw-hint">
          {isAnimating
            ? 'Крутим…'
            : available
              ? 'Нажмите на колесо'
              : `До следующего вращения: ${countdownLabel}`}
        </p>
      </div>
    </div>
  );
}
