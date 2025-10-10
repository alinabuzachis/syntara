import type React from "react";

export function Form(props: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props}>{props.children}</form>;
}
