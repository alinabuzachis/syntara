import { ThemeProvider } from "../theme/ThemeProvider";

export function FrameworkProvider({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
