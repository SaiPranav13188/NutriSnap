'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Camera, Home, LineChart, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/scan', label: 'Scan', icon: Camera },
  { href: '/progress', label: 'Progress', icon: LineChart },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/**
 * Bottom tab bar on mobile, side rail on desktop — the four destinations from
 * the plan's nav (Groups is a phase-2 item and deliberately absent).
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-glass-border bg-base-900/80 backdrop-blur-xl
        md:inset-y-0 md:left-0 md:right-auto md:w-20 md:border-r md:border-t-0"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)] md:h-full md:max-w-none md:flex-col md:justify-center md:gap-3 md:px-0">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors',
                  active ? 'text-accent-lime' : 'text-ink-tertiary hover:text-ink-secondary',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent md:inset-x-auto md:left-0 md:top-2 md:h-10 md:w-0.5"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
