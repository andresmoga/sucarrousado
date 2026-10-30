import { cn } from "@/lib/utils";

interface PlateInputProps {
  value: string;
  onChange: (value: string) => void;
  city: string;
  invalid?: boolean;
}

const normalize = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/** El campo de la placa ES una placa colombiana: amarilla, con la ciudad abajo. */
export function PlateInput({ value, onChange, city, invalid }: PlateInputProps) {
  const shown = value.length > 3 ? `${value.slice(0, 3)} ${value.slice(3)}` : value;
  return (
    <label className={cn("plate plate-enter w-full max-w-[460px] cursor-text", invalid && "outline outline-2 outline-offset-4 outline-destructive")}>
      <span className="sr-only">Placa del carro</span>
      <input
        value={shown}
        onChange={(e) => onChange(normalize(e.target.value))}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="ABC 123"
        maxLength={7}
        aria-invalid={invalid || undefined}
        className="plate-chars w-full min-w-0 bg-transparent text-center text-[clamp(44px,15vw,84px)] placeholder:text-plate-ink/25 focus:outline-none"
      />
      <span className="plate-city" aria-hidden>
        {city || "Colombia"}
      </span>
    </label>
  );
}
