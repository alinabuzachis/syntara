import clsx from "clsx";

type ButtonProps = {
  variant?: "primary" | "secondary" | "plain";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;
export function Button(props: ButtonProps) {
  const { variant, size, children, className, ...rest } = props;
  return (
    <button
      className={clsx(
        "rounded-full",
        // Variant styles
        {
          "bg-blue-500 text-white hover:bg-blue-600":
            !variant || variant === "primary",
          "bg-gray-500 text-white hover:bg-gray-600": variant === "secondary",
          "bg-transparent text-gray-700 hover:bg-gray-100": variant === "plain",
        },
        // Size styles
        {
          "px-2 py-1": size === "sm",
          "px-3 py-1.5": !size || size === "md",
          "px-4 py-2": size === "lg",
        },
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
