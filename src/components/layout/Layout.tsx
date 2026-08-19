import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { RestTimer } from '../workout/RestTimer';

export function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <main className="pb-20 md:pb-4">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Outlet />
        </div>
      </main>
      <RestTimer />
      <BottomNav />
    </div>
  );
}
