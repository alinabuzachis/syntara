import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Submit a form using userEvent by appending a hidden submit button and clicking it.
 * Useful when the real submit button lives outside the component tree (e.g. in a parent layout).
 *
 * @param form - The form element to submit. Defaults to `screen.getByRole('form')`,
 *               which requires exactly one form in the DOM. Pass an explicit form
 *               element when multiple forms are rendered.
 */
export async function submitForm(form?: HTMLFormElement) {
  const user = userEvent.setup()
  const target = form ?? screen.getByRole<HTMLFormElement>('form')
  const btn = document.createElement('button')
  btn.type = 'submit'
  btn.style.display = 'none'
  target.appendChild(btn)
  await user.click(btn)
  btn.remove()
}
