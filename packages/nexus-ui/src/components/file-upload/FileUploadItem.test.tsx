import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { FileUploadItem } from './FileUploadItem'

describe('FileUploadItem', () => {
  const createFile = (name: string, size = 1024): File => {
    return new File(['x'.repeat(size)], name, { type: 'image/png' })
  }

  describe('file info display', () => {
    it('renders file name', () => {
      const file = createFile('document.png')
      render(<FileUploadItem file={file} fileId="1" />)
      expect(screen.getByText('document.png')).toBeInTheDocument()
    })

    it('renders custom file name when provided', () => {
      const file = createFile('original.png')
      render(<FileUploadItem file={file} fileId="1" fileName="renamed.png" />)
      expect(screen.getByText('renamed.png')).toBeInTheDocument()
      expect(screen.queryByText('original.png')).not.toBeInTheDocument()
    })

    it('renders file extension', () => {
      const file = createFile('document.pdf', 2048)
      render(<FileUploadItem file={file} fileId="1" />)
      expect(screen.getByText(/PDF/)).toBeInTheDocument()
    })

    it('renders file size in bytes', () => {
      const file = createFile('small.png', 500)
      render(<FileUploadItem file={file} fileId="1" />)
      expect(screen.getByText(/500 B/)).toBeInTheDocument()
    })

    it('renders file size in KB', () => {
      const file = createFile('medium.png', 2048)
      render(<FileUploadItem file={file} fileId="1" />)
      expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument()
    })

    it('renders file size in MB', () => {
      const file = createFile('large.png', 2 * 1024 * 1024)
      render(<FileUploadItem file={file} fileId="1" />)
      expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument()
    })
  })

  describe('status display', () => {
    it('does not show progress bar for pending status', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" status="pending" progress={0} />)
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('shows progress bar for uploading status', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" status="uploading" progress={50} />)
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('shows progress bar for success status', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" status="success" progress={100} />)
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('shows progress bar for error status', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" status="error" progress={30} />)
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('displays error message when provided', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" status="error" progress={30} errorMessage="Upload failed" />)
      expect(screen.getByText(/Upload failed/)).toBeInTheDocument()
    })
  })

  describe('remove button', () => {
    it('renders remove button', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" onRemove={() => {}} />)
      expect(screen.getByLabelText('Remove file')).toBeInTheDocument()
    })

    it('calls onRemove when clicked', async () => {
      const user = userEvent.setup()
      const onRemove = vi.fn()
      const file = createFile('test.png')

      render(<FileUploadItem file={file} fileId="1" onRemove={onRemove} />)

      await user.click(screen.getByLabelText('Remove file'))
      expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it('uses custom aria-label when provided', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" onRemove={() => {}} removeButtonAriaLabel="Delete test.png" />)
      expect(screen.getByLabelText('Delete test.png')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has accessible progress bar with file name', () => {
      const file = createFile('document.png')
      render(<FileUploadItem file={file} fileId="1" status="uploading" progress={50} />)
      expect(screen.getByLabelText('document.png upload progress')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('applies custom className', () => {
      const file = createFile('test.png')
      const { container } = render(<FileUploadItem file={file} fileId="1" className="custom-class" />)

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('edge cases', () => {
    it('handles file without extension', () => {
      const file = new File(['content'], 'README', { type: 'text/plain' })
      render(<FileUploadItem file={file} fileId="1" />)
      // File name appears as both display name and extension (getFileExtension returns the whole name)
      expect(screen.getAllByText('README').length).toBeGreaterThanOrEqual(1)
      // Should show the file size
      expect(screen.getByText(/7 B/)).toBeInTheDocument()
    })

    it('does not show progress bar when progress is undefined', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" status="uploading" />)
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('uses default pending status when not provided', () => {
      const file = createFile('test.png')
      render(<FileUploadItem file={file} fileId="1" progress={50} />)
      // pending status doesn't show progress bar
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })
  })
})
