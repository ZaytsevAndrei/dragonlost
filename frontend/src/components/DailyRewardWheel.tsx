import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  DAILY_REWARD_WHEEL_SECTORS,
  WHEEL_DEGREES_PER_SECTOR,
  WHEEL_TIER_COLORS,
  wheelSpinDelta,
  type DailyRewardWheelAmount,
} from '../constants/dailyRewardWheel';
import { COIN_VIEW_BOX, coinBgGradientId } from './coinIconMarkup';
import { playWheelSpinSound, playWheelWinChime, resumeWheelAudio } from '../utils/wheelSpinSound';
import './DailyRewardWheel.css';

const SPIN_DURATION_MS = 4800;
const WHEEL_SIZE = 400;
const WHEEL_R = WHEEL_SIZE / 2;
const INNER_R = 58;
const OUTER_R = WHEEL_R - 14;

const TIER_GRADIENT_STOPS: Record<DailyRewardWheelAmount, [string, string, string]> = {
  10: ['#ffe08a', '#f0c040', '#c89618'],
  30: ['#7ed99a', '#4caf6a', '#2a7a42'],
  50: ['#7eb8f0', '#4a8fd4', '#2a5a98'],
  100: ['#d4a8f8', '#a86cd8', '#6a3898'],
  200: ['#ff8a7a', '#e04538', '#9a2018'],
};

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

function sectorCoinMarkOffset(amount: number): { textX: number; coinX: number; coinY: number; coinSize: number } {
  const digits = String(amount).length;
  const textX = digits >= 3 ? -9 : digits === 2 ? -6 : -4;
  return { textX, coinX: 2, coinY: -5, coinSize: amount >= 100 ? 9 : 10 };
}

function sectorLabelPosition(index: number): { x: number; y: number; rotate: number } {
  const midAngle = index * WHEEL_DEGREES_PER_SECTOR + WHEEL_DEGREES_PER_SECTOR / 2 - 90;
  const rad = (midAngle * Math.PI) / 180;
  const labelR = (INNER_R + OUTER_R) / 2 + 6;
  return {
    x: WHEEL_R + labelR * Math.cos(rad),
    y: WHEEL_R + labelR * Math.sin(rad),
    rotate: midAngle + 90,
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

  const uniqueTiers = [...new Set(DAILY_REWARD_WHEEL_SECTORS)] as DailyRewardWheelAmount[];

  const runSpinAnimation = useCallback((sectorIndex: number) => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const base = rotationRef.current;
    const delta = wheelSpinDelta(base, sectorIndex, 6);
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
  }, []);

  useEffect(() => {
    if (!spinTarget) {
      lastSpinKeyRef.current = null;
      return;
    }
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
    <div className="drw-root">
      <div
        className={`drw-scene ${interactive ? 'drw-scene-ready' : ''} ${isAnimating ? 'drw-scene-spinning' : ''}`}
        role="group"
        aria-labelledby={labelId}
      >
        <div className="drw-stage">
          <div className="drw-aura" aria-hidden />
          <div className="drw-frame">
            <div className="drw-pointer" aria-hidden>
              <svg className="drw-pointer-svg" viewBox="0 0 40 48" width="40" height="48">
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
                    {uniqueTiers.map((tier) => {
                      const [light, mid, dark] = TIER_GRADIENT_STOPS[tier];
                      return (
                        <radialGradient
                          key={tier}
                          id={`${gradPrefix}-tier-${tier}`}
                          cx="50%"
                          cy="50%"
                          r="75%"
                          gradientUnits="userSpaceOnUse"
                          gradientTransform={`translate(${WHEEL_R} ${WHEEL_R})`}
                        >
                          <stop offset="0%" stopColor={light} />
                          <stop offset="55%" stopColor={mid} />
                          <stop offset="100%" stopColor={dark} />
                        </radialGradient>
                      );
                    })}
                    <radialGradient id={`${gradPrefix}-hub`} cx="38%" cy="32%" r="68%">
                      <stop offset="0%" stopColor="#f5ead8" />
                      <stop offset="50%" stopColor="#c9a87a" />
                      <stop offset="100%" stopColor="#6b4428" />
                    </radialGradient>
                    <filter id={`${gradPrefix}-glow`} x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <symbol id={`${gradPrefix}-coin`} viewBox={COIN_VIEW_BOX}>
                      <defs>
                        <radialGradient id={coinBgGradientId(`${gradPrefix}-wheel`)} cx="35%" cy="30%" r="70%">
                          <stop offset="0%" stopColor="#ef5350" />
                          <stop offset="100%" stopColor="#b71c1c" />
                        </radialGradient>
                      </defs>
                      <circle
                        cx="12"
                        cy="12"
                        r="11"
                        fill={`url(#${coinBgGradientId(`${gradPrefix}-wheel`)})`}
                        stroke="#7a0c0c"
                        strokeWidth="1"
                      />
                      <circle cx="9.5" cy="9" r="2.8" fill="rgba(255,255,255,0.22)" />
                      <path
                        fill="#fff"
                        d="M8.25 6.75h2.85c3.55 0 5.9 2.35 5.9 5.85s-2.35 5.85-5.9 5.85H8.25V6.75Z"
                      />
                    </symbol>
                  </defs>

                  <circle cx={WHEEL_R} cy={WHEEL_R} r={OUTER_R + 10} className="drw-rim-shadow" />

                  {DAILY_REWARD_WHEEL_SECTORS.map((amount, index) => {
                    const colors = WHEEL_TIER_COLORS[amount as DailyRewardWheelAmount];
                    const isWinner = litSector === index;
                    const isJackpot = amount === 200;

                    return (
                      <path
                        key={`seg-${index}`}
                        d={describeSector(index)}
                        fill={`url(#${gradPrefix}-tier-${amount})`}
                        stroke={colors.stroke}
                        strokeWidth={1}
                        className={`drw-sector ${isWinner ? 'drw-sector-winner' : ''} ${isJackpot ? 'drw-sector-jackpot' : ''}`}
                        style={isWinner ? { filter: `drop-shadow(0 0 10px ${colors.glow})` } : undefined}
                      />
                    );
                  })}

                  {DAILY_REWARD_WHEEL_SECTORS.map((_, index) => {
                    const angle = index * WHEEL_DEGREES_PER_SECTOR - 90;
                    const inner = polarToCartesian(angle, INNER_R);
                    const outer = polarToCartesian(angle, OUTER_R);
                    return (
                      <line
                        key={`div-${index}`}
                        x1={inner.x}
                        y1={inner.y}
                        x2={outer.x}
                        y2={outer.y}
                        className="drw-divider"
                      />
                    );
                  })}

                  {DAILY_REWARD_WHEEL_SECTORS.map((amount, index) => {
                    const label = sectorLabelPosition(index);
                    const fontSize = amount >= 100 ? 13 : amount >= 50 ? 14 : 15;
                    const isJackpot = amount === 200;
                    const coinMark = sectorCoinMarkOffset(amount);

                    return (
                      <g
                        key={`lbl-${index}`}
                        transform={`translate(${label.x}, ${label.y}) rotate(${label.rotate})`}
                      >
                        <text
                          x={coinMark.textX}
                          y={0}
                          className={`drw-sector-num ${isJackpot ? 'drw-sector-num-jackpot' : ''}`}
                          fontSize={fontSize}
                          textAnchor="end"
                          dominantBaseline="middle"
                        >
                          {amount}
                        </text>
                        <use
                          href={`#${gradPrefix}-coin`}
                          x={coinMark.coinX}
                          y={coinMark.coinY}
                          width={coinMark.coinSize}
                          height={coinMark.coinSize}
                        />
                      </g>
                    );
                  })}

                  <circle cx={WHEEL_R} cy={WHEEL_R} r={OUTER_R + 8} className="drw-outer-rim" fill="none" />
                  <circle cx={WHEEL_R} cy={WHEEL_R} r={OUTER_R + 4} className="drw-outer-rim-inner" fill="none" />

                  <circle cx={WHEEL_R} cy={WHEEL_R} r={INNER_R} fill={`url(#${gradPrefix}-hub)`} className="drw-hub" />
                  <circle cx={WHEEL_R} cy={WHEEL_R} r={INNER_R} className="drw-hub-ring" fill="none" />
                  <text
                    x={WHEEL_R}
                    y={WHEEL_R}
                    className="drw-hub-label"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    SPIN
                  </text>
                  <circle cx={WHEEL_R} cy={WHEEL_R} r={8} className="drw-hub-axle" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        <p id={labelId} className={`drw-hint ${available ? 'drw-hint-ready' : 'drw-hint-wait'}`}>
          {isAnimating ? (
            <>
              <span className="drw-hint-icon" aria-hidden>
                ◌
              </span>
              Крутим…
            </>
          ) : available ? (
            <>
              <span className="drw-hint-icon" aria-hidden>
                ↻
              </span>
              Нажмите на колесо
            </>
          ) : (
            <>
              <span className="drw-hint-icon" aria-hidden>
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
