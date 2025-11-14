import clsx from 'clsx'

type HeadingProps = {
  level?: 1 | 2 | 3 | 4 | 5 | 6
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  weight?: 'normal' | 'medium' | 'semibold' | 'bold'
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLHeadingElement>

export function Heading({ level = 2, size, weight = 'semibold', children, className, ...rest }: HeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

  // Default size based on level if not specified
  const defaultSize = {
    1: '2xl',
    2: 'xl',
    3: 'lg',
    4: 'md',
    5: 'sm',
    6: 'xs',
  }[level] as HeadingProps['size']

  const finalSize = size || defaultSize

  return (
    <Tag
      className={clsx(
        {
          'text-xs': finalSize === 'xs',
          'text-sm': finalSize === 'sm',
          'text-base': finalSize === 'md',
          'text-lg': finalSize === 'lg',
          'text-xl': finalSize === 'xl',
          'text-2xl': finalSize === '2xl',
        },
        {
          'font-normal': weight === 'normal',
          'font-medium': weight === 'medium',
          'font-semibold': weight === 'semibold',
          'font-bold': weight === 'bold',
        },
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
