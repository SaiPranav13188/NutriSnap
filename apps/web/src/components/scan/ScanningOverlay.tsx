'use client';

import { motion } from 'framer-motion';

/**
 * The scanning-radar effect the plan asks for over the viewfinder while the
 * model is thinking (section 4 suggests Lottie; a hand-rolled SVG sweep keeps
 * the bundle smaller and renders identically).
 */
export function ScanningOverlay({ label = 'Reading your plate…' }: { label?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-2xl bg-base-900/65 backdrop-blur-[3px]">
      <div className="relative grid h-44 w-44 place-items-center">
        {[0, 1, 2].map((ring) => (
          <motion.span
            key={ring}
            className="absolute rounded-full border border-accent-lime/35"
            style={{ inset: ring * 22 }}
            animate={{ opacity: [0.55, 0.12, 0.55], scale: [1, 1.05, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: ring * 0.35, ease: 'easeInOut' }}
          />
        ))}

        {/* The sweep. */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, rgba(198,255,61,0) 0deg, rgba(198,255,61,0.32) 40deg, rgba(198,255,61,0) 80deg)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        />

        <motion.span
          className="h-2.5 w-2.5 rounded-full bg-accent-lime"
          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      </div>

      <p className="absolute bottom-10 text-sm font-medium text-ink-secondary" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
