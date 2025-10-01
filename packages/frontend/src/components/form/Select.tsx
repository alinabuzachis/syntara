import type React from "react";

export function Select(
  props: {
    label: string;
    options: { label: string; value: string }[];
  } & React.SelectHTMLAttributes<HTMLSelectElement>
) {
  const { label, options, ...rest } = props;
  return (
    <div className="flex flex-col gap-1">
      <label className="label">{label}</label>
      <select className="input" {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
