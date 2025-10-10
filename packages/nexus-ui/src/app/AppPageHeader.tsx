export function AppPageHeader(props: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center px-8 py-6 glass rounded-4xl border gap-8">
      <span className="text-white text-xl font-bold">{props.title}</span>
      {props.children}
    </div>
  );
}
