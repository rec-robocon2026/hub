"use client";

import { createContext, useActionState, useContext, type CSSProperties, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Corners, Notice } from "@/components/ui";
import type { ActionResult } from "@/lib/types";

type Action = (state: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const ResultContext = createContext<ActionResult | null>(null);

/** A form bound to a server action; place <FormNotice/> wherever the result message should appear. */
export function ActionForm({
  action,
  children,
  className,
  style,
  id,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <ResultContext.Provider value={state}>
      <form id={id} action={formAction} className={className} style={style}>
        {children}
      </form>
    </ResultContext.Provider>
  );
}

export function FormNotice() {
  return <Notice result={useContext(ResultContext)} />;
}

export function Submit({
  children,
  primary,
  pendingText,
  name,
  value,
  className = "",
  disabled,
}: {
  children: ReactNode;
  primary?: boolean;
  pendingText?: string;
  name?: string;
  value?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={`btn ${primary ? "btn-primary blueprint" : "btn-secondary"} ${className}`}
    >
      {primary && <Corners />}
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
