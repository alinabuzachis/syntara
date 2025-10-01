import type React from "react";

export function Form(props: { children: React.ReactNode; className?: string }) {
  return <form className={props.className}>{props.children}</form>;
}
