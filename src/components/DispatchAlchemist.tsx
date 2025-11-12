"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import Lottie from "lottie-react";

export type PriceCalcResult = { total: number; currency?: string };

type AnimationData = Record<string, unknown>;

const hexToRgba = (hex: string, alpha = 1) => {
  const sanitized = hex.replace("#", "");
  const bigint = Number.parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type Theme = {
  progressColor?: string;
  ticketFrom?: string;
  ticketTo?: string;
  glowFrom?: string;
  glowVia?: string;
  glowTo?: string;
};

type DispatchAlchemistProps = {
  messages?: string[];
  durationMs?: number;
  carsAnimation: AnimationData;
  driverAnimation: AnimationData;
  confettiAnimation: AnimationData;
  calculatorAnimation: AnimationData;
  finalizerAnimation: AnimationData;
  finalizeDurationMs?: number;
  calculatePrice: () => Promise<PriceCalcResult>;
  theme?: Theme;
  onComplete?: (r: PriceCalcResult) => void;
  footerSlot?: ReactNode;
};

export default function DispatchAlchemist({
  messages = [
    "working magic...",
    "checking surge & demand...",
    "applying available discounts...",
    "gathering the drivers...",
    "working magic...",
  ],
  durationMs = 10000,
  carsAnimation,
  driverAnimation,
  confettiAnimation,
  calculatorAnimation,
  finalizerAnimation,
  finalizeDurationMs = 2500,
  calculatePrice,
  theme,
  onComplete,
  footerSlot,
}: DispatchAlchemistProps) {
  const [elapsed, setElapsed] = useState(0);
  const [timerDone, setTimerDone] = useState(false);
  const [price, setPrice] = useState<PriceCalcResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeComplete, setFinalizeComplete] = useState(false);
  const tickRef = useRef<number | null>(null);
  const finalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = {
    progressColor: theme?.progressColor ?? "#4f46e5",
    ticketFrom: theme?.ticketFrom ?? "#0f172a",
    ticketTo: theme?.ticketTo ?? "#1f2937",
    glowFrom: theme?.glowFrom ?? "#eef2ff",
    glowVia: theme?.glowVia ?? "#faf5ff",
    glowTo: theme?.glowTo ?? "#fff1f2",
  };

  const stepMs = useMemo(() => durationMs / messages.length, [durationMs, messages.length]);
  const index = Math.min(messages.length - 1, Math.floor(elapsed / stepMs));
  const progress = Math.round((elapsed / durationMs) * 100);
  const googlePalette = ["#4285F4", "#EA4335", "#FBBC05", "#34A853", "#4285F4", "#EA4335"];
  const googleColor = googlePalette[index % googlePalette.length];
  const nextGoogleColor = googlePalette[(index + 1) % googlePalette.length];
  const googleShadow = hexToRgba(googleColor, 0.35);
  const remainingSeconds = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));

  useEffect(() => {
    const start = performance.now();
    const tick = () => {
      const now = performance.now();
      const ms = Math.min(durationMs, now - start);
      setElapsed(ms);
      if (ms < durationMs) {
        tickRef.current = requestAnimationFrame(tick);
      } else {
        setTimerDone(true);
      }
    };
    tickRef.current = requestAnimationFrame(tick);
    return () => tickRef.current && cancelAnimationFrame(tickRef.current);
  }, [durationMs]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await calculatePrice();
        if (mounted) setPrice(res);
      } catch {
        if (mounted) setPrice({ total: 0, currency: "CAD" });
      }
    })();
    return () => { mounted = false; };
  }, [calculatePrice]);

  useEffect(() => {
    if (timerDone && price && !revealed && !finalizeComplete && !isFinalizing) {
      setIsFinalizing(true);
      const latestPrice = price;
      if (finalizeTimeoutRef.current) clearTimeout(finalizeTimeoutRef.current);
      finalizeTimeoutRef.current = setTimeout(() => {
        setIsFinalizing(false);
        setFinalizeComplete(true);
        setShowConfetti(true);
        if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = setTimeout(() => {
          setShowConfetti(false);
          setRevealed(true);
          onComplete?.(latestPrice);
        }, 1200);
      }, finalizeDurationMs);
    }
  }, [
    finalizeComplete,
    finalizeDurationMs,
    isFinalizing,
    onComplete,
    price,
    revealed,
    timerDone,
  ]);

  const liveMsg = messages[index];
  const flipCardStyle: CSSProperties = { transformStyle: "preserve-3d" };
  const ticketFaceStyle: CSSProperties = { backfaceVisibility: "hidden" };
  const showCalculator = !revealed && !isFinalizing;
  const showFinalizer = false;

  const skip = () => {
    setElapsed(durationMs);
    setTimerDone(true);
  };

  useEffect(() => {
    return () => {
      if (finalizeTimeoutRef.current) clearTimeout(finalizeTimeoutRef.current);
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
    };
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto p-8 rounded-3xl bg-white shadow-lg relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-24"
        style={{
          background: `linear-gradient(135deg, ${t.glowFrom}, ${t.glowVia}, ${t.glowTo})`,
          opacity: 0.7,
        }}
      />

      <div className="flex flex-col gap-6 pb-5 sm:flex-row sm:items-center">
        <div className="flex flex-1 justify-center">
          <motion.svg aria-hidden viewBox="0 0 200 120" className="h-24 w-full max-w-sm">
            <motion.path
              d="M10,100 C40,20 160,20 190,100"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              style={{ color: "#818cf8" }}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
            />
            <circle cx="10" cy="100" r="10" fill="#4f46e5" />
            <circle cx="190" cy="100" r="10" fill="#c026d3" />
          </motion.svg>
        </div>

        <div className="flex flex-1 justify-center">
          <div
            className="relative rounded-3xl bg-white/80 p-4 shadow-inner flex items-center justify-center"
            style={{ width: 280, height: 180 }}
          >
            <Lottie animationData={carsAnimation} loop autoplay style={{ width: 260, height: 160 }} />
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <Lottie animationData={driverAnimation} loop autoplay style={{ width: "160px", height: "110px" }} />
            </div>
          </div>
        </div>

        <div className="flex-1">
          <div className="sr-only" aria-live="assertive" aria-atomic="true">{liveMsg}</div>

          <AnimatePresence mode="popLayout">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="text-center text-base font-semibold sm:text-left sm:text-lg"
              style={{
                color: "transparent",
                backgroundImage: `linear-gradient(120deg, ${googleColor}, ${nextGoogleColor})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textShadow: `0 4px 12px ${googleShadow}`,
                filter: "drop-shadow(0 6px 18px rgba(15, 23, 42, 0.35))",
              }}
            >
              {messages[index]}
            </motion.div>
          </AnimatePresence>

          {!revealed ? (
            <p
              aria-live="polite"
              className="mt-1 text-center text-sm font-medium text-slate-500 sm:text-left"
            >
              {remainingSeconds > 0 ? `${remainingSeconds}s remaining` : "Finishing up"}
            </p>
          ) : null}

          <div className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full"
              style={{ backgroundColor: t.progressColor }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "tween", ease: "linear", duration: 0.1 }}
            />
          </div>

        </div>
      </div>

      <div className="relative mt-4" style={{ perspective: 1000 }}>
        <motion.div
          className="relative w-full h-56 rounded-3xl shadow-md bg-white"
          style={flipCardStyle}
          animate={{ rotateY: revealed ? 180 : 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        >
          <div
            className="absolute inset-0 rounded-3xl border border-dashed border-slate-300 overflow-hidden"
            style={ticketFaceStyle}
          >
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
              {showCalculator ? (
                <>
                  <div className="w-64 md:w-80">
                    <Lottie animationData={calculatorAnimation} loop autoplay />
                  </div>
                  <div className="text-base font-semibold text-slate-600">Crunching the route details…</div>
                </>
              ) : (
                <div className="text-base font-semibold text-slate-600">Locking in your fare…</div>
              )}
            </div>
          </div>
          <div
            className="absolute inset-0 rounded-3xl text-white grid place-items-center"
            style={{
              ...ticketFaceStyle,
              transform: "rotateY(180deg)",
              background: `linear-gradient(135deg, ${t.ticketFrom}, ${t.ticketTo})`,
            }}
          >
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider text-slate-300">Your price</div>
              <div className="text-3xl font-semibold mt-1">
                {price ? `${price.currency ?? "CAD"} ${price.total.toFixed(2)}` : "—"}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div
        className={clsx(
          "mt-4 flex flex-col gap-3 sm:flex-row sm:items-center text-midnight",
          footerSlot ? "sm:justify-between" : "sm:justify-end",
        )}
      >
        {footerSlot && (
          <div className="text-center text-sm sm:text-left">
            {footerSlot}
          </div>
        )}
        <button
          onClick={skip}
          className="text-xs font-semibold uppercase tracking-[0.25em] text-horizon hover:text-horizon/80 underline underline-offset-4 self-end sm:self-auto"
        >
          skip animation
        </button>
      </div>

      <AnimatePresence>
        {showConfetti && (
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Lottie animationData={confettiAnimation} loop={false} autoplay />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
