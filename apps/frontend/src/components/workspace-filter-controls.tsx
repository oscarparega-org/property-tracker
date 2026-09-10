import { useEffect, useRef, type ReactNode } from 'react';
import { MaterialIcon } from './material-icon';

export function MultiFilter<T extends string>({
  label,
  values,
  selected,
  labels,
  onChange
}: {
  label: string;
  values: readonly T[];
  selected: T[];
  labels?: Partial<Record<T, string>>;
  onChange: (values: T[]) => void;
}) {
  return (
    <fieldset className="workspace-multi-filter">
      <legend>{label}</legend>
      <div>
        {values.map((value) => (
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

export function RangeInputs({
  label,
  minimum,
  maximum,
  setMinimum,
  setMaximum
}: {
  label: string;
  minimum: string;
  maximum: string;
  setMinimum: (value: string) => void;
  setMaximum: (value: string) => void;
}) {
  return (
    <fieldset className="workspace-range-filter">
      <legend>{label}</legend>
      <div>
        <input
          type="number"
          min="0"
          placeholder="Mín."
          value={minimum}
          onChange={(event) => setMinimum(event.target.value)}
        />
        <span>–</span>
        <input
          type="number"
          min="0"
          placeholder="Máx."
          value={maximum}
          onChange={(event) => setMaximum(event.target.value)}
        />
      </div>
    </fieldset>
  );
}

export function FilterDialog({
  children,
  onClose,
  onClear,
  activeCount
}: {
  children: ReactNode;
  onClose: () => void;
  onClear: () => void;
  activeCount: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={dialogRef} className="filter-sheet" aria-labelledby="filter-sheet-title" onCancel={onClose}>
      <header>
        <div>
          <span>{activeCount ? `${activeCount} activos` : 'Todas las propiedades'}</span>
          <h2 id="filter-sheet-title">Filtrar propiedades</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar filtros">
          <MaterialIcon name="close" />
        </button>
      </header>
      <div className="filter-sheet-fields">{children}</div>
      <footer>
        <button className="button subtle" type="button" onClick={onClear} disabled={!activeCount}>
          Limpiar
        </button>
        <button className="button primary" type="button" onClick={onClose}>
          Ver resultados
        </button>
      </footer>
    </dialog>
  );
}
