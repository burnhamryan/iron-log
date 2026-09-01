import { useSearchParams } from 'react-router-dom';
import { ProteinCard } from '../components/protein/ProteinCard';

/**
 * Landing page for the home-screen shortcut. Arriving with ?add=1 opens the
 * entry sheet immediately, so logging is: long-press icon, tap, type, done.
 */
export function Protein() {
  const [searchParams] = useSearchParams();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Protein
      </h1>
      <ProteinCard autoOpenAdd={searchParams.get('add') === '1'} />
    </div>
  );
}
