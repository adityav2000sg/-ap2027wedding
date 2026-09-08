/**
 * What you see while a page is being fetched.
 *
 * Without this, a navigation stalls on the old screen and then the whole new
 * one lands at once — the "flash" that makes an app feel like a series of
 * documents rather than one thing. With it, the tap is acknowledged instantly
 * and the real content fades in over a shape that already matches it.
 *
 * The skeleton deliberately mirrors the standard page furniture — eyebrow,
 * script title, a row of figures, a list — so the layout doesn't jump when the
 * real thing arrives.
 */

export default function AppLoading() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-8 sm:py-8" aria-busy>
      <span className="sr-only">Loading…</span>

      <header className="mb-7">
        <Shimmer className="mb-3 h-2.5 w-24 rounded-full" />
        <Shimmer className="h-9 w-52 rounded-lg sm:h-12 sm:w-64" />
        <Shimmer className="mt-3 h-3 w-40 rounded-full" />
      </header>

      <div className="mb-6 flex gap-6 border-y border-line py-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1">
            <Shimmer className="h-6 w-14 rounded-md" />
            <Shimmer className="mt-2 h-2.5 w-16 rounded-full" />
          </div>
        ))}
      </div>

      <div className="mb-5 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <Shimmer key={i} className="h-7 w-20 rounded-lg" />
        ))}
      </div>

      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3"
            // Each row starts its shimmer a beat later, so the list reads as
            // filling in rather than pulsing as one block.
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <Shimmer className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Shimmer className="h-3 w-[42%] rounded-full" />
              <Shimmer className="mt-1.5 h-2.5 w-[26%] rounded-full" />
            </div>
            <Shimmer className="h-3 w-14 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Shimmer({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} />;
}
