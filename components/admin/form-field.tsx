/**
 * Shared markup for a labeled admin form control with an optional error line.
 * The error paragraph id is `${id}-error` so controls can point
 * `aria-describedby` at it.
 */
export function FormField({
  children,
  className,
  error,
  id,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  id: string;
  label: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block font-semibold text-sm" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-destructive text-xs" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Mirrors the shadcn Input styling for raw `<select>` elements. */
export const adminSelectClassName =
  "flex h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/** Mirrors the shadcn Input styling for raw `<textarea>` elements. */
export const adminTextareaClassName =
  "min-h-36 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";
