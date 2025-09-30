import type { ReactNode } from "react";

export function AppLogin(props: { children?: ReactNode }) {
  const isLoggedIn = true;
  if (!isLoggedIn) {
    return (
      <>
        {props.children}
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-lg z-10">
          Please log in to continue.
        </div>
      </>
    );
  }
  return props.children;
}
