import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { FileUpload, type UploadedFile } from './FileUpload'

describe('FileUpload', () => {
  describe('empty state', () => {
    it('renders dropzone with default text', () => {
      render(<FileUpload />)
      expect(screen.getByText('Drag and drop files here')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
    })

    it('renders custom title text', () => {
      render(<FileUpload titleText="Drop your files" />)
      expect(screen.getByText('Drop your files')).toBeInTheDocument()
    })

    it('renders custom browse button text', () => {
      render(<FileUpload browseButtonText="Choose Files" />)
      expect(screen.getByRole('button', { name: 'Choose Files' })).toBeInTheDocument()
    })

    it('displays accepted file types when provided', () => {
      render(<FileUpload acceptedMimeTypes={['.png', '.txt']} />)
      expect(screen.getByText('Accepted file types: PNG, TXT')).toBeInTheDocument()
    })

    it('displays custom info text over auto-generated', () => {
      render(<FileUpload acceptedMimeTypes={['.png']} infoText="Custom info" />)
      expect(screen.getByText('Custom info')).toBeInTheDocument()
      expect(screen.queryByText('Accepted file types: PNG')).not.toBeInTheDocument()
    })
  })

  describe('with files', () => {
    const createFile = (name: string, size = 1024): File => {
      return new File(['x'.repeat(size)], name, { type: 'image/png' })
    }

    const mockFiles: UploadedFile[] = [
      { id: '1', file: createFile('test1.png'), progress: 100, status: 'success' },
      { id: '2', file: createFile('test2.png'), progress: 50, status: 'uploading' },
    ]

    it('displays file count in status', () => {
      render(<FileUpload files={mockFiles} />)
      expect(screen.getByText('1/2 files uploaded')).toBeInTheDocument()
    })

    it('renders FileUploadItem for each file', () => {
      render(<FileUpload files={mockFiles} />)
      expect(screen.getByText('test1.png')).toBeInTheDocument()
      expect(screen.getByText('test2.png')).toBeInTheDocument()
    })

    it('shows success icon when all files complete', () => {
      const allSuccess: UploadedFile[] = [
        { id: '1', file: createFile('test1.png'), progress: 100, status: 'success' },
        { id: '2', file: createFile('test2.png'), progress: 100, status: 'success' },
      ]
      render(<FileUpload files={allSuccess} />)
      expect(screen.getByText('2/2 files uploaded')).toBeInTheDocument()
    })

    it('shows error icon when any file has error', () => {
      const withError: UploadedFile[] = [
        { id: '1', file: createFile('test1.png'), progress: 100, status: 'success' },
        { id: '2', file: createFile('test2.png'), progress: 30, status: 'error', errorMessage: 'Failed' },
      ]
      render(<FileUpload files={withError} />)
      expect(screen.getByText('1/2 files uploaded')).toBeInTheDocument()
    })
  })

  describe('callbacks', () => {
    it('calls onFileRemove when remove button is clicked', async () => {
      const user = userEvent.setup()
      const onFileRemove = vi.fn()
      const files: UploadedFile[] = [
        { id: 'file-1', file: new File([''], 'test.png'), progress: 100, status: 'success' },
      ]

      render(<FileUpload files={files} onFileRemove={onFileRemove} />)

      const removeButton = screen.getByLabelText('Remove file')
      await user.click(removeButton)

      expect(onFileRemove).toHaveBeenCalledWith('file-1')
    })

    it('calls onFilesSelected when files are dropped', async () => {
      const user = userEvent.setup()
      const onFilesSelected = vi.fn()
      render(<FileUpload onFilesSelected={onFilesSelected} />)

      const dropzone = screen.getByText('Drag and drop files here').closest('.pf-v6-c-multiple-file-upload')!
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement

      await user.upload(input, file)

      expect(onFilesSelected).toHaveBeenCalledWith([file])
    })
  })

  describe('error handling', () => {
    it('clears error when file is removed', async () => {
      const user = userEvent.setup()
      const onFileRemove = vi.fn()
      const files: UploadedFile[] = [{ id: '1', file: new File([''], 'test.png'), progress: 100, status: 'success' }]

      render(<FileUpload files={files} onFileRemove={onFileRemove} />)

      const removeButton = screen.getByLabelText('Remove file')
      await user.click(removeButton)

      expect(onFileRemove).toHaveBeenCalled()
    })
  })

  describe('controlled vs uncontrolled', () => {
    it('uses internal state when files prop is not provided', () => {
      render(<FileUpload />)
      // Internal state starts empty
      expect(screen.queryByText(/files uploaded/)).not.toBeInTheDocument()
    })

    it('uses controlled files when provided', () => {
      const files: UploadedFile[] = [{ id: '1', file: new File([''], 'test.png'), progress: 100, status: 'success' }]
      render(<FileUpload files={files} />)
      expect(screen.getByText('1/1 files uploaded')).toBeInTheDocument()
    })

    it('adds files to internal state when dropped in uncontrolled mode', async () => {
      const user = userEvent.setup()
      render(<FileUpload />)

      const file = new File(['test content'], 'dropped-file.png', { type: 'image/png' })
      const dropzone = screen.getByText('Drag and drop files here').closest('.pf-v6-c-multiple-file-upload')!
      const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement

      await user.upload(input, file)

      // File should appear in the UI
      expect(screen.getByText('dropped-file.png')).toBeInTheDocument()
      expect(screen.getByText('0/1 files uploaded')).toBeInTheDocument()
    })

    it('removes files from internal state in uncontrolled mode', async () => {
      const user = userEvent.setup()
      render(<FileUpload />)

      // First add a file
      const file = new File(['test content'], 'to-remove.png', { type: 'image/png' })
      const dropzone = screen.getByText('Drag and drop files here').closest('.pf-v6-c-multiple-file-upload')!
      const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement

      await user.upload(input, file)
      expect(screen.getByText('to-remove.png')).toBeInTheDocument()

      // Now remove it
      const removeButton = screen.getByLabelText('Remove file')
      await user.click(removeButton)

      // File should be gone
      expect(screen.queryByText('to-remove.png')).not.toBeInTheDocument()
    })

    it('replaces file with same name when re-uploaded in uncontrolled mode', async () => {
      const user = userEvent.setup()
      render(<FileUpload />)

      const dropzone = screen.getByText('Drag and drop files here').closest('.pf-v6-c-multiple-file-upload')!
      const input = dropzone.querySelector('input[type="file"]') as HTMLInputElement

      // Upload file first time
      const file1 = new File(['content1'], 'same-name.png', { type: 'image/png' })
      await user.upload(input, file1)
      expect(screen.getByText('same-name.png')).toBeInTheDocument()
      expect(screen.getByText('0/1 files uploaded')).toBeInTheDocument()

      // Upload file with same name again
      const file2 = new File(['content2'], 'same-name.png', { type: 'image/png' })
      await user.upload(input, file2)

      // Should still only have one file (replaced)
      expect(screen.getByText('same-name.png')).toBeInTheDocument()
      expect(screen.getByText('0/1 files uploaded')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('applies aria-label to status section', () => {
      const files: UploadedFile[] = [{ id: '1', file: new File([''], 'test.png'), progress: 100, status: 'success' }]
      render(<FileUpload files={files} aria-label="Custom label" />)
      expect(screen.getByLabelText('Custom label')).toBeInTheDocument()
    })

    it('has default aria-label when not provided', () => {
      const files: UploadedFile[] = [{ id: '1', file: new File([''], 'test.png'), progress: 100, status: 'success' }]
      render(<FileUpload files={files} />)
      expect(screen.getByLabelText('Uploaded files')).toBeInTheDocument()
    })
  })

  describe('accepted file types formatting', () => {
    it('formats MIME types with wildcard (e.g., image/*)', () => {
      render(<FileUpload acceptedMimeTypes={['image/*']} />)
      expect(screen.getByText('Accepted file types: image')).toBeInTheDocument()
    })

    it('formats full MIME types (e.g., application/pdf)', () => {
      render(<FileUpload acceptedMimeTypes={['application/pdf']} />)
      expect(screen.getByText('Accepted file types: PDF')).toBeInTheDocument()
    })

    it('formats multiple mixed types', () => {
      render(<FileUpload acceptedMimeTypes={['.png', 'image/*', 'application/pdf']} />)
      expect(screen.getByText('Accepted file types: PNG, image, PDF')).toBeInTheDocument()
    })

    it('displays no info text when no accepted types provided', () => {
      render(<FileUpload />)
      expect(screen.queryByText(/Accepted file types/)).not.toBeInTheDocument()
    })
  })

  describe('maxSizeMB prop', () => {
    it('uses maxSizeMB when provided', () => {
      // maxSizeMB is converted to bytes internally for dropzone
      render(<FileUpload maxSizeMB={5} />)
      expect(screen.getByText('Drag and drop files here')).toBeInTheDocument()
    })

    it('maxSizeBytes takes precedence when both provided', () => {
      render(<FileUpload maxSizeBytes={1024} maxSizeMB={5} />)
      expect(screen.getByText('Drag and drop files here')).toBeInTheDocument()
    })
  })

  describe('className prop', () => {
    it('applies custom className to container', () => {
      const { container } = render(<FileUpload className="custom-upload-class" />)
      expect(container.querySelector('.custom-upload-class')).toBeInTheDocument()
    })
  })

  describe('pending files', () => {
    it('shows 0 success count for all pending files', () => {
      const files: UploadedFile[] = [
        { id: '1', file: new File([''], 'test1.png'), progress: 0, status: 'pending' },
        { id: '2', file: new File([''], 'test2.png'), progress: 0, status: 'pending' },
      ]
      render(<FileUpload files={files} />)
      expect(screen.getByText('0/2 files uploaded')).toBeInTheDocument()
    })
  })
})
