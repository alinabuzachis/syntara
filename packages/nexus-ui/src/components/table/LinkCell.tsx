import { Link } from 'wouter'

export function LinkCell(props: { href: string; children: React.ReactNode }) {
  return (
    <Link href={props.href} className="py-3 text-blue-400 no-underline">
      {props.children}
    </Link>
  )
}
