import { Link } from 'wouter'

export function LinkCell(props: { href: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <Link href={props.href} className="text-blue-400">
        {props.children}
      </Link>
    </div>
  )
}
