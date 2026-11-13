export async function prepareRaceSetup(
  page,
  { mode, quality = false, trackIndex = 0, craftIndex = 0 } = {},
) {
  if (mode) await page.locator(`input[name="mode"][value="${mode}"]`).check();
  if (quality) await page.locator("#quality").check();
  await page.locator("#setup-next").click();
  await page.locator('[data-panel="track"]').waitFor({ state: "visible" });
  await page.locator(`#tracks button:nth-child(${trackIndex + 1})`).click();
  await page.locator("#setup-next").click();
  await page.locator('[data-panel="craft"]').waitFor({ state: "visible" });
  if (craftIndex !== 0)
    await page.locator(`#crafts button:nth-child(${craftIndex + 1})`).click();
}
