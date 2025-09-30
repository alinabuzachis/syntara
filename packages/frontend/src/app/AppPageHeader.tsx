export function AppPageHeader(props: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center  px-8 py-6  glass rounded-3xl border">
      <span className="text-white text-xl font-bold grow">{props.title}</span>
      {props.children}
    </div>
  );
}
