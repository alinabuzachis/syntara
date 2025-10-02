import { createContext } from "react";

export const FlowDirectionContext = createContext<"TB" | "LR">("TB");
