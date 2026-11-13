const setupStages = ["class", "track", "craft"];

export async function goToSetupStage(page, target) {
  let current = await page.locator("#menu").getAttribute("data-stage");
  while (current !== target) {
    const currentIndex = setupStages.indexOf(current);
    const targetIndex = setupStages.indexOf(target);
    const next =
      setupStages[currentIndex + Math.sign(targetIndex - currentIndex)];
    await page
      .locator(currentIndex < targetIndex ? "#setup-next" : "#setup-back")
      .click();
    await page.waitForFunction(
      (stage) => document.querySelector("#menu").dataset.stage === stage,
      next,
    );
    current = next;
  }
}

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
