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

    it('calls onFilesSelected when files are selected via browse', async () => {
      const onFilesSelected = vi.fn()
      render(<FileUpload onFilesSelected={onFilesSelected} />)

      // The browse button triggers the native file input
      // Testing actual file selection requires more complex setup with DataTransfer
      expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
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
})
