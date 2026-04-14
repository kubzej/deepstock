/**
 * FearGreedGauge - CNN Fear & Greed Index
 */
import { Skeleton } from '@/components/ui/skeleton';
import { useFearGreed } from '@/hooks/useFearGreed';

const RATING_CZ: Record<string, string> = {
  'extreme fear': 'Extrémní strach',
  'fear': 'Strach',
  'neutral': 'Neutrální',
  'greed': 'Chamtivost',
  'extreme greed': 'Extrémní chamtivost',
};

function getColor(score: number): string {
  if (score < 25) return '#ef4444';
  if (score < 45) return '#f97316';
  if (score < 55) return '#eab308';
  if (score < 75) return '#84cc16';
  return '#22c55e';
}

export function FearGreedGauge() {
  const { data, isLoading, error } = useFearGreed();

  if (isLoading) return <Skeleton className="h-10 w-72" />;
  if (error || !data) return null;

  const color = getColor(data.score);
  const rating = RATING_CZ[data.rating.toLowerCase()] ?? data.rating;
  const pct = Math.min(Math.max(data.score, 1.5), 98.5);

  return (
    <div className="flex flex-col gap-2 w-72">
      {/* Header — same pattern as section headers in MarketOverview */}
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Nálada trhu</h3>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono-price text-lg font-bold leading-none" style={{ color }}>
            {Math.round(data.score)}
          </span>
          <span className="text-xs font-medium" style={{ color }}>{rating}</span>
        </div>
      </div>

      {/* Bar with tick indicator */}
      <div className="relative py-1.5">
        {/* Tick — thin line, sticks out above + below the bar */}
        <div
          className="absolute inset-y-0 z-10 w-px rounded-full bg-background/85 shadow-[0_0_0_1px_var(--border)]"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
        {/* Gradient bar */}
        <div
          className="h-2.5 w-full rounded-full"
          style={{
            background:
              'linear-gradient(to right, #ef4444 0%, #f97316 25%, #eab308 45%, #84cc16 55%, #22c55e 100%)',
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Extrémní strach</span>
        <span>Extrémní chamtivost</span>
      </div>
    </div>
  );
}
