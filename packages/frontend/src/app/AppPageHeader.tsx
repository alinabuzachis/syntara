export function AppPageHeader(props: { title: string }) {
  return (
    <div className="flex items-center font-bold px-8 py-6 text-white text-xl glass rounded-3xl border">
      {props.title}
    </div>
  );
}
