import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "./App.jsx";

const savedEntry = {
  id: 1,
  original_text: "Existing source text about quarterly planning.",
  summary: "The team established its priorities for the next quarter.",
  tags: ["planning", "priorities", "quarterly-review"],
  created_at: "2026-10-26T15:00:00Z",
};

const secondEntry = {
  id: 2,
  original_text: "Existing source text about service reliability.",
  summary: "The service reliability review identified two follow-up actions.",
  tags: ["reliability", "operations", "follow-up"],
  created_at: "2026-10-26T16:00:00Z",
};

const createdEntry = {
  id: 3,
  original_text: "A customer onboarding workflow update.",
  summary: "The onboarding workflow was updated to reduce processing delays.",
  tags: ["onboarding", "workflow", "performance"],
  created_at: "2026-10-26T17:00:00Z",
};

const pageOnePath = "/entries?page=1&page_size=10";
const pageTwoPath = "/entries?page=2&page_size=10";

function page(items, currentPage = 1, total = items.length, totalPages = null) {
  return {
    items,
    total,
    page: currentPage,
    page_size: 10,
    total_pages:
      totalPages === null ? Math.ceil(total / 10) : totalPages,
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function openInitialEntry() {
  const detail = await screen.findByRole("article");
  expect(within(detail).getByText(savedEntry.summary)).toBeInTheDocument();
  expect(
    within(detail).getByRole("heading", { name: "Generated Insight" }),
  ).toBeInTheDocument();
  expect(within(detail).queryByText("Saved Insight")).not.toBeInTheDocument();
  return detail;
}

describe("InsightTag smoke flow", () => {
  it("submits text, shows pending state, renders three tags, and selects saved entries", async () => {
    const pendingCreate = deferred();
    let listRequests = 0;
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === "/entries" && options.method === "POST") {
        return pendingCreate.promise;
      }
      if (path === pageOnePath) {
        listRequests += 1;
        const items =
          listRequests === 1
            ? [savedEntry, secondEntry]
            : [createdEntry, secondEntry, savedEntry];
        return Promise.resolve(jsonResponse(page(items)));
      }
      if (path === "/entries/1") {
        return Promise.resolve(jsonResponse(savedEntry));
      }
      if (path === "/entries/2") {
        return Promise.resolve(jsonResponse(secondEntry));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "New Analysis" }),
    ).toBeInTheDocument();
    await openInitialEntry();

    await user.click(
      screen.getByRole("button", { name: new RegExp(secondEntry.summary) }),
    );
    expect(
      await within(screen.getByRole("article")).findByText(secondEntry.summary),
    ).toBeInTheDocument();

    const sourceInput = screen.getByLabelText("Text to summarize");
    await user.type(sourceInput, createdEntry.original_text);
    await user.click(
      screen.getByRole("button", { name: "Summarize & Save" }),
    );

    expect(
      screen.getByRole("button", { name: /Generating insight/ }),
    ).toBeDisabled();
    expect(sourceInput).toBeDisabled();

    await act(async () => {
      pendingCreate.resolve(jsonResponse(createdEntry, 201));
    });

    const updatedDetail = await screen.findByRole("article");
    expect(
      within(updatedDetail).getByText(createdEntry.summary),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Insight summarized and saved."),
    ).toBeInTheDocument();
    expect(within(updatedDetail).getAllByRole("listitem")).toHaveLength(3);
    expect(
      await screen.findByRole("button", {
        name: new RegExp(createdEntry.summary),
      }),
    ).toBeInTheDocument();

    const createCall = fetchMock.mock.calls.find(
      ([path, options]) => path === "/entries" && options.method === "POST",
    );
    expect(JSON.parse(createCall[1].body)).toEqual({
      text: createdEntry.original_text,
    });
  });

  it.each([
    [
      "provider rate limit",
      () =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: "PROVIDER_RATE_LIMITED",
                message: "The AI provider is rate limited. Please try again later.",
              },
            },
            503,
          ),
        ),
      "The AI provider is rate limited. Please try again later.",
    ],
    [
      "network failure",
      () => Promise.reject(new TypeError("Failed to fetch")),
      "Unable to reach the API. Confirm the backend is running and try again.",
    ],
  ])("shows a safe message for a %s", async (_, createResult, expectedMessage) => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path, options = {}) => {
        if (path === pageOnePath) return Promise.resolve(jsonResponse(page([])));
        if (path === "/entries" && options.method === "POST") {
          return createResult();
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("No saved entries yet");
    await user.type(
      screen.getByLabelText("Text to summarize"),
      "Synthetic source text for an expected failure.",
    );
    await user.click(screen.getByRole("button", { name: "Summarize & Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(expectedMessage);
  });

  it("shows FastAPI field validation without exposing submitted values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path, options = {}) => {
        if (path === pageOnePath) return Promise.resolve(jsonResponse(page([])));
        if (path === "/entries" && options.method === "POST") {
          return Promise.resolve(
            jsonResponse(
              {
                detail: [
                  {
                    type: "string_too_long",
                    loc: ["body", "text"],
                    msg: "String should have at most 10000 characters",
                  },
                ],
              },
              422,
            ),
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("No saved entries yet");
    await user.type(screen.getByLabelText("Text to summarize"), "Valid local text");
    await user.click(screen.getByRole("button", { name: "Summarize & Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "String should have at most 10000 characters",
    );
  });

  it("cancels or confirms deletion and refreshes only after confirmation", async () => {
    const pendingDelete = deferred();
    let listRequests = 0;
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === pageOnePath) {
        listRequests += 1;
        const items = listRequests === 1 ? [savedEntry, secondEntry] : [secondEntry];
        return Promise.resolve(jsonResponse(page(items)));
      }
      if (path === "/entries/1" && options.method === "DELETE") {
        return pendingDelete.promise;
      }
      if (path === "/entries/1") return Promise.resolve(jsonResponse(savedEntry));
      if (path === "/entries/2") return Promise.resolve(jsonResponse(secondEntry));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await openInitialEntry();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    let dialog = screen.getByRole("dialog", { name: "Delete saved insight?" });
    expect(dialog).toHaveTextContent("This saved insight will be permanently deleted.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE"),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      within(dialog).getByRole("button", { name: "Deleting…" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => {
      pendingDelete.resolve(jsonResponse(null, 204));
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      await within(screen.getByRole("article")).findByText(secondEntry.summary),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: new RegExp(savedEntry.summary) }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 entry")).toBeInTheDocument();
    expect(screen.getByText("Insight deleted.")).toBeInTheDocument();
  });

  it("returns to the previous page after deleting the only final-page item", async () => {
    let pageOneRequests = 0;
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === pageOnePath) {
        pageOneRequests += 1;
        const total = pageOneRequests === 1 ? 11 : 10;
        const totalPages = pageOneRequests === 1 ? 2 : 1;
        return Promise.resolve(
          jsonResponse(page([secondEntry], 1, total, totalPages)),
        );
      }
      if (path === pageTwoPath) {
        return Promise.resolve(jsonResponse(page([savedEntry], 2, 11, 2)));
      }
      if (path === "/entries/1" && options.method === "DELETE") {
        return Promise.resolve(jsonResponse(null, 204));
      }
      if (path === "/entries/1") return Promise.resolve(jsonResponse(savedEntry));
      if (path === "/entries/2") return Promise.resolve(jsonResponse(secondEntry));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Page 1 of 2");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    await within(screen.getByRole("article")).findByText(savedEntry.summary);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
    );

    expect(
      await screen.findByRole("button", { name: new RegExp(secondEntry.summary) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Saved Insights pages" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the entry and reports an error when deletion fails", async () => {
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === pageOnePath) return Promise.resolve(jsonResponse(page([savedEntry])));
      if (path === "/entries/1" && options.method === "DELETE") {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: "DATABASE_ERROR",
                message: "The database operation could not be completed.",
              },
            },
            500,
          ),
        );
      }
      if (path === "/entries/1") return Promise.resolve(jsonResponse(savedEntry));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await openInitialEntry();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The database operation could not be completed.",
    );
    expect(
      within(screen.getByRole("article")).getByText(savedEntry.summary),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("navigates between server pages and disables boundary controls", async () => {
    const fetchMock = vi.fn((path) => {
      if (path === pageOnePath) {
        return Promise.resolve(jsonResponse(page([secondEntry], 1, 11, 2)));
      }
      if (path === pageTwoPath) {
        return Promise.resolve(jsonResponse(page([savedEntry], 2, 11, 2)));
      }
      if (path === "/entries/1") return Promise.resolve(jsonResponse(savedEntry));
      if (path === "/entries/2") return Promise.resolve(jsonResponse(secondEntry));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Page 1 of 2");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: new RegExp(savedEntry.summary) }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: new RegExp(secondEntry.summary) }),
    ).toBeInTheDocument();
  });

  it("returns to page one and shows a newly created entry", async () => {
    let pageOneRequests = 0;
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === pageOnePath) {
        pageOneRequests += 1;
        const items = pageOneRequests === 1 ? [secondEntry] : [createdEntry, secondEntry];
        return Promise.resolve(jsonResponse(page(items, 1, 12, 2)));
      }
      if (path === pageTwoPath) {
        return Promise.resolve(jsonResponse(page([savedEntry], 2, 11, 2)));
      }
      if (path === "/entries" && options.method === "POST") {
        return Promise.resolve(jsonResponse(createdEntry, 201));
      }
      if (path === "/entries/1") return Promise.resolve(jsonResponse(savedEntry));
      if (path === "/entries/2") return Promise.resolve(jsonResponse(secondEntry));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Page 1 of 2");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 2");

    await user.type(
      screen.getByLabelText("Text to summarize"),
      createdEntry.original_text,
    );
    await user.click(screen.getByRole("button", { name: "Summarize & Save" }));

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: new RegExp(createdEntry.summary) }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText(createdEntry.summary)).toBeInTheDocument();
  });

  it("ignores a stale detail response after a newer selection", async () => {
    const staleSecond = deferred();
    const currentFirst = deferred();
    let firstDetailRequests = 0;
    const fetchMock = vi.fn((path) => {
      if (path === pageOnePath) {
        return Promise.resolve(jsonResponse(page([savedEntry, secondEntry])));
      }
      if (path === "/entries/1") {
        firstDetailRequests += 1;
        return firstDetailRequests === 1
          ? Promise.resolve(jsonResponse(savedEntry))
          : currentFirst.promise;
      }
      if (path === "/entries/2") return staleSecond.promise;
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await openInitialEntry();
    await user.click(
      screen.getByRole("button", { name: new RegExp(secondEntry.summary) }),
    );
    await user.click(
      screen.getByRole("button", { name: new RegExp(savedEntry.summary) }),
    );

    await act(async () => {
      currentFirst.resolve(jsonResponse(savedEntry));
    });
    expect(
      await within(screen.getByRole("article")).findByText(savedEntry.summary),
    ).toBeInTheDocument();

    await act(async () => {
      staleSecond.resolve(jsonResponse(secondEntry));
    });
    expect(within(screen.getByRole("article")).getByText(savedEntry.summary)).toBeInTheDocument();
    expect(within(screen.getByRole("article")).queryByText(secondEntry.summary)).not.toBeInTheDocument();
  });

  it("ignores an older pagination response that finishes last", async () => {
    const stalePageTwo = deferred();
    const currentPageOne = deferred();
    let pageOneRequests = 0;
    const fetchMock = vi.fn((path) => {
      if (path === pageOnePath) {
        pageOneRequests += 1;
        return pageOneRequests === 1
          ? Promise.resolve(jsonResponse(page([savedEntry], 1, 11, 2)))
          : currentPageOne.promise;
      }
      if (path === pageTwoPath) return stalePageTwo.promise;
      if (path === "/entries/1") return Promise.resolve(jsonResponse(savedEntry));
      if (path === "/entries/2") return Promise.resolve(jsonResponse(secondEntry));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Page 1 of 2");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 2");
    await user.click(screen.getByRole("button", { name: "Previous" }));

    await act(async () => {
      currentPageOne.resolve(jsonResponse(page([savedEntry], 1, 11, 2)));
    });
    expect(
      await screen.findByRole("button", { name: new RegExp(savedEntry.summary) }),
    ).toBeInTheDocument();

    await act(async () => {
      stalePageTwo.resolve(jsonResponse(page([secondEntry], 2, 11, 2)));
    });
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: new RegExp(secondEntry.summary) }),
    ).not.toBeInTheDocument();
  });

  it("does not let a stale list response overwrite a post-create refresh", async () => {
    const stalePageTwo = deferred();
    let pageOneRequests = 0;
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === pageOnePath) {
        pageOneRequests += 1;
        const items = pageOneRequests === 1 ? [savedEntry] : [createdEntry, savedEntry];
        return Promise.resolve(jsonResponse(page(items, 1, 12, 2)));
      }
      if (path === pageTwoPath) return stalePageTwo.promise;
      if (path === "/entries" && options.method === "POST") {
        return Promise.resolve(jsonResponse(createdEntry, 201));
      }
      if (path === "/entries/1") return Promise.resolve(jsonResponse(savedEntry));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await openInitialEntry();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Text to summarize"), createdEntry.original_text);
    await user.click(screen.getByRole("button", { name: "Summarize & Save" }));

    expect(
      await screen.findByRole("button", { name: new RegExp(createdEntry.summary) }),
    ).toBeInTheDocument();
    await act(async () => {
      stalePageTwo.resolve(jsonResponse(page([secondEntry], 2, 12, 2)));
    });
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: new RegExp(createdEntry.summary) }),
    ).toBeInTheDocument();
  });

  it("does not restore a deleted entry from stale list or detail responses", async () => {
    const stalePageTwo = deferred();
    const staleDeletedDetail = deferred();
    let pageOneRequests = 0;
    let savedDetailRequests = 0;
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === pageOnePath) {
        pageOneRequests += 1;
        const items =
          pageOneRequests === 1 ? [savedEntry, secondEntry] : [secondEntry];
        const total = pageOneRequests === 1 ? 11 : 10;
        const totalPages = pageOneRequests === 1 ? 2 : 1;
        return Promise.resolve(jsonResponse(page(items, 1, total, totalPages)));
      }
      if (path === pageTwoPath) return stalePageTwo.promise;
      if (path === "/entries/1" && options.method === "DELETE") {
        return Promise.resolve(jsonResponse(null, 204));
      }
      if (path === "/entries/1") {
        savedDetailRequests += 1;
        return savedDetailRequests === 1
          ? Promise.resolve(jsonResponse(savedEntry))
          : staleDeletedDetail.promise;
      }
      if (path === "/entries/2") return Promise.resolve(jsonResponse(secondEntry));
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await openInitialEntry();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");

    // Start real UI requests that will become stale before confirming deletion.
    await user.click(
      screen.getByRole("button", { name: new RegExp(secondEntry.summary) }),
    );
    await within(screen.getByRole("article")).findByText(secondEntry.summary);
    await user.click(
      screen.getByRole("button", { name: new RegExp(savedEntry.summary) }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await within(screen.getByRole("article")).findByText(secondEntry.summary),
    ).toBeInTheDocument();
    await act(async () => {
      stalePageTwo.resolve(jsonResponse(page([savedEntry], 2, 1, 1)));
      staleDeletedDetail.resolve(jsonResponse(savedEntry));
    });

    expect(within(screen.getByRole("article")).getByText(secondEntry.summary)).toBeInTheDocument();
    expect(screen.queryByText(savedEntry.summary)).not.toBeInTheDocument();
  });
});
