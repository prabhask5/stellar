import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { cx } from "./cx";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}

export function FieldShell({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between text-footnote font-medium text-fg-2"
      >
        <span>{label}</span>
        {optional && <span className="text-caption font-normal text-fg-2/70">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} className="text-footnote text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-msg`} className="text-footnote text-fg-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-11 w-full rounded-button border border-hairline bg-[rgba(10,8,28,0.55)] px-3.5 text-fg outline-none " +
  "transition-[border-color,background-color] duration-100 placeholder:text-fg-2/60 " +
  "focus-visible:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/60 " +
  "disabled:opacity-60 aria-[invalid=true]:border-danger/60";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  hint,
  error,
  optional,
  mono,
  className,
  id,
  ...rest
}: TextFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} htmlFor={fieldId}>
      <input
        id={fieldId}
        // Sensible defaults for a phone keyboard; a field can override any of them.
        autoComplete="off"
        enterKeyHint="done"
        dir="auto"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
        className={cx(inputClass, mono && "font-mono text-[14px]", className)}
        {...rest}
      />
    </FieldShell>
  );
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  mono?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextArea({
  label,
  hint,
  error,
  optional,
  mono,
  className,
  id,
  ...rest
}: TextAreaProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} htmlFor={fieldId}>
      <textarea
        id={fieldId}
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="enter"
        dir="auto"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
        className={cx(
          inputClass,
          "h-auto min-h-[88px] resize-y py-2.5 leading-snug",
          mono && "font-mono text-[13px]",
          className,
        )}
        {...rest}
      />
    </FieldShell>
  );
}
