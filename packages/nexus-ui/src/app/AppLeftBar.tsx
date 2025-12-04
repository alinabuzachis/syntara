import { Toolbar, ToolbarButton } from '@ansible/nexus-ui-framework'
import { ClosedCaptionIcon, GalleryVerticalEndIcon, SquarePlusIcon, Volume2Icon } from 'lucide-react'

export function AppLeftBar() {
  return (
    <Toolbar orientation="vertical" className="glass grow-0 self-center rounded-full border py-1">
      <ToolbarButton>
        <SquarePlusIcon />
      </ToolbarButton>

      <ToolbarButton>
        <GalleryVerticalEndIcon />
      </ToolbarButton>

      <ToolbarButton>
        <div className="ai-shadow flex h-6 w-6 items-center justify-center rounded-full" />
      </ToolbarButton>

      <ToolbarButton>
        <Volume2Icon />
      </ToolbarButton>

      <ToolbarButton>
        <ClosedCaptionIcon />
      </ToolbarButton>
    </Toolbar>
  )
}
