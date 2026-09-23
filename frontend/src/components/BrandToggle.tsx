export default function BrandToggle({
  value,
  onChange,
  ask,
  onLabel,
  onHint,
  offLabel,
  offHint,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  ask: string;
  onLabel: string;
  onHint: string;
  offLabel: string;
  offHint: string;
}) {
  return (
    <div className="brand-toggle">
      <p className="hint">{ask}</p>
      <div className="choice-row tones">
        <button type="button" className={`choice ${value ? "on" : ""}`} onClick={() => onChange(true)}>
          <b>{onLabel}</b>
          <span>{onHint}</span>
        </button>
        <button type="button" className={`choice ${!value ? "on" : ""}`} onClick={() => onChange(false)}>
          <b>{offLabel}</b>
          <span>{offHint}</span>
        </button>
      </div>
    </div>
  );
}
