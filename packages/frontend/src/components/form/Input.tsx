import type React from "react";

export function Input(
  props: {
    label: string;
  } & React.InputHTMLAttributes<HTMLInputElement>
) {
  const { label, ...rest } = props;
  return (
    <div className="flex flex-col gap-1">
      <label className="label">{label}</label>
      <input type="text" className="input" {...rest} />
    </div>
  );
}
