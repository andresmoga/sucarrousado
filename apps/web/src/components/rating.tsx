import { cn } from "@/lib/utils";

interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  name: string;
  legend: string;
  hint?: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}

/** Grupo de radio con aspecto de botones segmentados, accesible con teclado. */
export function Segmented<T extends string | number>({ name, legend, hint, options, value, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
      <legend className="contents">
        <span className="text-sm font-semibold">{legend}</span>
      </legend>
      <div>
        <div
          className="grid w-full rounded-md border border-input bg-card p-1 sm:inline-grid sm:w-auto"
          style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, auto))` }}
        >
          {options.map((o) => (
            <label
              key={String(o.value)}
              className={cn(
                "cursor-pointer rounded px-1.5 py-1.5 text-center text-xs font-medium leading-tight transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:px-3 sm:text-sm",
                value === o.value ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </fieldset>
  );
}

export const RATING_OPTIONS: Option<number>[] = [
  { value: 1, label: "Malo" },
  { value: 2, label: "Regular" },
  { value: 3, label: "Bueno" },
  { value: 4, label: "Muy bueno" },
  { value: 5, label: "Excelente" },
];
