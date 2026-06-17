import { ExpressionHelpPopover } from './ExpressionHelpPopover'

export function ConditionalExpressionHelp() {
  return (
    <ExpressionHelpPopover
      ariaLabel="Conditional expression help"
      headerContent="Conditional expression"
      description="The condition that determines if the loop continues. The loop executes while this condition is true."
    />
  )
}
