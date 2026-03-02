import { test, expect, toAppUrl } from './fixtures'

test('user approves an approval request and sees status update', async ({ app }) => {
  // Arrange - Open approvals list
  await app.goto(toAppUrl('/approvals'))
  await expect(app.getByRole('heading', { name: 'Approvals' })).toBeVisible()

  // Act - Find a pending approval and open details
  await app.getByPlaceholder('Search approvals...').fill('AI Agent Decision')
  await app.getByRole('button', { name: 'AI Agent Decision' }).first().click()

  // Act - Approve with notes
  await app.getByRole('button', { name: 'Approve' }).click()
  await app.getByPlaceholder(/Explain the reason for approving/i).fill('Looks good')
  await app.getByRole('button', { name: 'Submit' }).click()

  // Assert - Submit alert appears
  await expect(app.getByText('Approval submitted')).toBeVisible()
  await expect(app.getByText("Unfortunately, this isn't yet implemented.")).toBeVisible()
})
