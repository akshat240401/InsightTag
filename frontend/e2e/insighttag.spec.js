import { expect, test } from "@playwright/test";

const firstEntry = {
  id: 1,
  original_text: "Synthetic quarterly planning notes.",
  summary: "The team agreed on quarterly priorities and review dates.",
  tags: ["planning", "priorities", "quarterly-review"],
  created_at: "2026-10-26T15:00:00Z",
};

const secondEntry = {
  id: 2,
  original_text: "Synthetic reliability review notes.",
  summary: "The reliability review identified two follow-up actions.",
  tags: ["reliability", "operations", "follow-up"],
  created_at: "2026-10-26T16:00:00Z",
};

const createdEntry = {
  id: 3,
  original_text: "Synthetic onboarding workflow update.",
  summary: "The onboarding workflow was updated to reduce processing delays.",
  tags: ["onboarding", "workflow", "performance"],
  created_at: "2026-10-26T17:00:00Z",
};

function paginated(items, currentPage = 1, total = items.length, totalPages = null) {
  return {
    items,
    total,
    page: currentPage,
    page_size: 10,
    total_pages: totalPages ?? Math.ceil(total / 10),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function json(route, payload, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: status === 204 ? "" : JSON.stringify(payload),
  });
}

function requestInfo(route) {
  const request = route.request();
  return {
    method: request.method(),
    url: new URL(request.url()),
  };
}

test("submits content, exposes pending state, and renders three tags", async ({ page }) => {
  const postGate = deferred();
  const records = [];

  await page.route("**/entries**", async (route) => {
    const { method, url } = requestInfo(route);
    if (url.pathname === "/entries" && method === "POST") {
      await postGate.promise;
      records.unshift(createdEntry);
      return json(route, createdEntry, 201);
    }
    if (url.pathname === "/entries" && method === "GET") {
      return json(route, paginated(records));
    }
    if (url.pathname === "/entries/3") return json(route, createdEntry);
    return route.abort();
  });

  await page.goto("/");
  await expect(page.getByText("No saved entries yet")).toBeVisible();
  const input = page.getByLabel("Text to summarize");
  await input.fill(createdEntry.original_text);
  await page.getByRole("button", { name: "Summarize & Save" }).click();
  await expect(page.getByRole("button", { name: /Generating insight/ })).toBeDisabled();
  await expect(input).toBeDisabled();

  postGate.resolve();
  const detail = page.getByRole("article");
  await expect(detail.getByText(createdEntry.summary)).toBeVisible();
  await expect(page.getByText("Insight summarized and saved.")).toBeVisible();
  await expect(detail.locator(".tag-list li")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: new RegExp(createdEntry.summary) }),
  ).toBeVisible();
});

test("selects a saved entry and displays its corresponding details", async ({ page }) => {
  await page.route("**/entries**", async (route) => {
    const { method, url } = requestInfo(route);
    if (url.pathname === "/entries" && method === "GET") {
      return json(route, paginated([firstEntry, secondEntry]));
    }
    if (url.pathname === "/entries/1") return json(route, firstEntry);
    if (url.pathname === "/entries/2") return json(route, secondEntry);
    return route.abort();
  });

  await page.goto("/");
  await expect(page.getByRole("article").getByText(firstEntry.summary)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(secondEntry.summary) }).click();
  await expect(page.getByRole("article").getByText(secondEntry.summary)).toBeVisible();
  await expect(
    page.getByRole("article").getByRole("heading", { name: "Generated Insight" }),
  ).toBeVisible();
  await expect(page.getByRole("article").getByText("Saved Insight", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Saved entries" }).getByText("Saved Insight", { exact: true })).toHaveCount(0);
});

test("delete dialog traps focus, supports cancel and Escape, and deletion refreshes state", async ({ page }) => {
  let records = [firstEntry, secondEntry];
  await page.route("**/entries**", async (route) => {
    const { method, url } = requestInfo(route);
    if (url.pathname === "/entries" && method === "GET") {
      return json(route, paginated(records));
    }
    if (url.pathname === "/entries/1" && method === "DELETE") {
      records = records.filter((entry) => entry.id !== 1);
      return json(route, null, 204);
    }
    const match = url.pathname.match(/^\/entries\/(\d+)$/);
    if (match) return json(route, records.find((entry) => entry.id === Number(match[1])));
    return route.abort();
  });

  await page.goto("/");
  await expect(page.getByRole("article").getByText(firstEntry.summary)).toBeVisible();
  const trigger = page.getByRole("button", { name: "Delete" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Delete saved insight?" });
  await expect(dialog).toContainText("This saved insight will be permanently deleted.");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Delete" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(firstEntry.summary)).toHaveCount(0);
  await expect(page.getByRole("article").getByText(secondEntry.summary)).toBeVisible();
  await expect(page.getByText("Insight deleted.")).toBeVisible();
});

test("navigates paginated results and displays the empty state", async ({ page }) => {
  await page.route("**/entries**", async (route) => {
    const { method, url } = requestInfo(route);
    if (url.pathname === "/entries" && method === "GET") {
      const requestedPage = Number(url.searchParams.get("page"));
      return requestedPage === 1
        ? json(route, paginated([secondEntry], 1, 11, 2))
        : json(route, paginated([firstEntry], 2, 11, 2));
    }
    if (url.pathname === "/entries/1") return json(route, firstEntry);
    if (url.pathname === "/entries/2") return json(route, secondEntry);
    return route.abort();
  });

  await page.goto("/");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(firstEntry.summary) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();

  await page.unroute("**/entries**");
  await page.route("**/entries**", (route) => json(route, paginated([])));
  await page.reload();
  await expect(page.getByText("No saved entries yet")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Saved Insights pages" }),
  ).toHaveCount(0);

  const tenEntries = Array.from({ length: 10 }, (_, index) => ({
    ...firstEntry,
    id: index + 1,
    summary: `Saved insight ${index + 1}`,
  }));
  await page.unroute("**/entries**");
  await page.route("**/entries**", async (route) => {
    const { method, url } = requestInfo(route);
    if (url.pathname === "/entries" && method === "GET") {
      return json(route, paginated(tenEntries, 1, 10, 1));
    }
    const match = url.pathname.match(/^\/entries\/(\d+)$/);
    if (match) return json(route, tenEntries[Number(match[1]) - 1]);
    return route.abort();
  });
  await page.reload();
  await expect(page.getByText("10 entries")).toBeVisible();
  await expect(page.getByRole("list", { name: "Saved entries" }).getByRole("button")).toHaveCount(10);
  await expect(
    page.getByRole("navigation", { name: "Saved Insights pages" }),
  ).toHaveCount(0);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
]) {
  test(`${viewport.name} layout has accessible controls and no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route("**/entries**", async (route) => {
      const { method, url } = requestInfo(route);
      if (url.pathname === "/entries" && method === "GET") {
        return json(route, paginated([firstEntry]));
      }
      if (url.pathname === "/entries/1") return json(route, firstEntry);
      return route.abort();
    });

    await page.goto("/");
    await expect(page.getByLabel("Text to summarize")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Saved Insights pages" }),
    ).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Saved entries" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    const importantControls = [
      page.getByLabel("Text to summarize"),
      page.getByRole("button", { name: "Summarize & Save" }),
      page.getByRole("button", { name: "Delete" }),
    ];
    for (const control of importantControls) {
      await control.scrollIntoViewIfNeeded();
      const controlBox = await control.boundingBox();
      expect(controlBox).not.toBeNull();
      expect(controlBox.x).toBeGreaterThanOrEqual(0);
      expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(viewport.width);
    }

    if (viewport.name === "desktop") {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= window.innerHeight + 1,
        ),
      ).toBe(true);
    }

    await page.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });
}
