import { CITY_GROUPS } from "@tcu/shared";
import * as React from "react";
import { Select } from "@/components/ui/form";

/** Municipios agrupados por departamento. `anyLabel` agrega la opción vacía (por ejemplo "Todo el país"). */
export const CitySelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select"> & { anyLabel?: string }>(
  ({ anyLabel, ...props }, ref) => (
    <Select ref={ref} {...props}>
      {anyLabel !== undefined && <option value="">{anyLabel}</option>}
      {CITY_GROUPS.map((g) =>
        g.cities.length === 1 && g.cities[0] === g.department.replace(" D. C.", "") ? (
          <option key={g.department} value={g.cities[0]}>{g.cities[0]}</option>
        ) : (
          <optgroup key={g.department} label={g.department}>
            {g.cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </optgroup>
        ),
      )}
    </Select>
  ),
);
CitySelect.displayName = "CitySelect";
