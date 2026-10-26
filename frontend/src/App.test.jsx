import { act, render, screen, within } from "@testing-library/react";
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

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("InsightTag smoke flow", () => {
  it("submits text, shows pending state, renders three tags, and selects saved entries", async () => {
    const pendingCreate = deferred();
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === "/entries" && options.method === "POST") {
        return pendingCreate.promise;
      }
      if (path === "/entries") {
        return Promise.resolve(jsonResponse([savedEntry, secondEntry]));
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

    const detail = await screen.findByRole("article");
    expect(within(detail).getByText(savedEntry.summary)).toBeInTheDocument();

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
    expect(within(updatedDetail).getAllByRole("listitem")).toHaveLength(3);
    for (const tag of createdEntry.tags) {
      expect(within(updatedDetail).getByText(tag)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: new RegExp(createdEntry.summary) }),
    ).toBeInTheDocument();

    const createCall = fetchMock.mock.calls.find(
      ([path, options]) => path === "/entries" && options.method === "POST",
    );
    expect(JSON.parse(createCall[1].body)).toEqual({
      text: createdEntry.original_text,
    });
  });

  it("shows a useful error when entry creation fails", async () => {
    const fetchMock = vi.fn((path, options = {}) => {
      if (path === "/entries" && options.method === "POST") {
        return Promise.resolve(
          jsonResponse({ detail: "AI service request failed" }, 502),
        );
      }
      if (path === "/entries") {
        return Promise.resolve(jsonResponse([]));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("No saved entries yet");

    await user.type(
      screen.getByLabelText("Text to summarize"),
      "Text that triggers a mocked provider failure.",
    );
    await user.click(
      screen.getByRole("button", { name: "Summarize & Save" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI service request failed",
    );
    expect(
      screen.getByRole("button", { name: "Summarize & Save" }),
    ).toBeEnabled();
  });
});
