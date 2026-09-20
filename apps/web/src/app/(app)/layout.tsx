import { AppNav } from '@/components/AppNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:pl-20">
      {/* Bottom nav overlaps content on mobile, so leave room for it. */}
      <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6 md:pb-10">{children}</main>
      <AppNav />
    </div>
  );
}
