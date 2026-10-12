import { useState } from 'react';
import { Icon } from './Icon';

interface Props {
  id: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  hint?: string;
  suggestions?: string[];
}

/** A list of values typed one at a time (Enter after each). Commas stay inside a value: "Texas, US" is one chip. */
export function Chips({ id, label, values, onChange, placeholder = '', hint, suggestions }: Props) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const s = raw.trim();
    if (!s || values.some((v) => v.toLowerCase() === s.toLowerCase())) return;
    onChange([...values, s]);
  };
  const commit = () => { if (text.trim()) { add(text); setText(''); } };
  return (
    <div>
      <label className="f" htmlFor={id}>{label}</label>
      <div className="chips">
        {values.map((v) => (
          <span className="ch" key={v}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}><Icon name="x" /></button>
          </span>
        ))}
        <input
          type="text"
          id={id}
          value={text}
          placeholder={values.length ? '' : placeholder}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={commit}
        />
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="sugg">
          {suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())).map((s) => (
            <button type="button" key={s} onClick={() => add(s)}>{s}</button>
          ))}
        </div>
      )}
      {hint && <p className="hint" style={{ margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}
