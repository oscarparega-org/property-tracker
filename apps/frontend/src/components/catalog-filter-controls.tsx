import type { CatalogPropertyDto } from '@house-tracker/shared';
import { propertyTypeLabels } from '@/lib/property-format';

export type PropertyType = CatalogPropertyDto['propertyType'];
export type RoomToken = '1' | '2' | '3' | '4+';
export type BathroomToken = '1' | '1.5' | '2' | '2.5' | '3' | '3.5' | '4+';
export type CatalogSort = 'modified_desc' | 'price_asc' | 'price_desc' | 'area_asc' | 'area_desc';

export const propertyTypeOptions = Object.keys(propertyTypeLabels) as PropertyType[];
export const roomOptions: RoomToken[] = ['1', '2', '3', '4+'];
export const bathroomOptions: BathroomToken[] = ['1', '1.5', '2', '2.5', '3', '3.5', '4+'];
export const catalogSortLabels: Record<CatalogSort, string> = {
  modified_desc: 'Más recientes',
  price_asc: 'Precio: menor a mayor',
  price_desc: 'Precio: mayor a menor',
  area_asc: 'Construcción: menor a mayor',
  area_desc: 'Construcción: mayor a menor'
};

export function listParam<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return [...new Set(value.split(',').filter((item): item is T => allowed.includes(item as T)))];
}

export function sameList<T extends string>(current: T[], next: T[]) {
  return current.length === next.length && current.every((value, index) => value === next[index]);
}

export function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ChoiceGroup<T extends string>({
  legend,
  options,
  selected,
  labels,
  onChange,
  compact = false
}: {
  legend: string;
  options: T[];
  selected: T[];
  labels?: Partial<Record<T, string>>;
  onChange: (next: T[]) => void;
  compact?: boolean;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className={`filter-choice-list${compact ? ' compact' : ''}`}>
        {options.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={selected.includes(value)}
            onClick={() =>
              onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
            }
          >
            {labels?.[value] ?? value}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function RangeFilter({
  legend,
  unit,
  step,
  minimum,
  maximum,
  setMinimum,
  setMaximum
}: {
  legend: string;
  unit: string;
  step: string;
  minimum: string;
  maximum: string;
  setMinimum: (value: string) => void;
  setMaximum: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend>
        {legend} <span>{unit}</span>
      </legend>
      <div className="filter-range">
        <label>
          <span>Mínimo</span>
          <input
            aria-label={`${legend} mínimo`}
            type="number"
            min="0"
            step={step}
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
          />
        </label>
        <span aria-hidden="true">–</span>
        <label>
          <span>Máximo</span>
          <input
            aria-label={`${legend} máximo`}
            type="number"
            min="0"
            step={step}
            value={maximum}
            onChange={(event) => setMaximum(event.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}
