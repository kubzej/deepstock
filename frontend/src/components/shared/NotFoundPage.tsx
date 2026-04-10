import { Link, useRouterState } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const location = useRouterState({ select: (s) => s.location });

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-lg text-muted-foreground">Stránka nenalezena</p>
      <p className="text-sm text-zinc-400 font-mono">{location.pathname}</p>
      <Button asChild variant="outline">
        <Link to="/">Zpět na hlavní stránku</Link>
      </Button>
    </div>
  );
}
