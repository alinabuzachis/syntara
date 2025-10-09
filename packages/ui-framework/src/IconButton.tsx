import clsx from "clsx";

type IconButtonProps = {
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;
export function IconButton(props: IconButtonProps) {
  const { children, className, ...rest } = props;
  return (
    <div className="group h-12 w-12 min-h-12 min-w-12 flex items-center justify-center">
      <button
        className={clsx(
          "rounded-full min-h-11 min-w-11 group-hover:bg-white/10 flex items-center justify-center ",
          className
        )}
        {...rest}
      >
        {children}
      </button>
    </div>
  );
}
