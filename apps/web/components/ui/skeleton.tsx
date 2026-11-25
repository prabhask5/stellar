import { cx } from "./cx";

/**
 * Placeholder rows shown only while a list has genuinely never been loaded on this
 * device (first launch, or after signing in). With a cached copy the real rows are there
 * from the first frame and this never appears. Static: no shimmer competing with the sky.
 */
export function RowsSkeleton({
  rows = 3,
  className,
  label = "Loading",
}: {
  rows?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      data-testid="skeleton"
      className={cx("glass overflow-hidden rounded-list", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cx(
            "flex min-h-[60px] items-center gap-3 px-4",
            i > 0 && "border-t border-separator",
          )}
        >
          <span className="size-[22px] shrink-0 rounded-full bg-fill-selected" />
          <span
            className="h-3 rounded-full bg-fill-selected"
            style={{ width: `${[58, 42, 66, 50][i % 4]}%` }}
          />
        </div>
      ))}
    </div>
  );
}
