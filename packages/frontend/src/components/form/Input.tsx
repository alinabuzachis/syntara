import { Input as BaseInput } from "@base-ui-components/react";
import type React from "react";

export function Input(props: React.ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      className="w-full px-3 py-1.5 bg-black/20 rounded-lg ring ring-white/10 text-white/90 focus:outline-blue-800"
      {...props}
    />
  );
}
