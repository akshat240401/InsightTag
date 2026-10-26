const DEFAULT_ERROR = "Something went wrong. Please try again.";

class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function validationMessage(detail) {
  if (!Array.isArray(detail) || detail.length === 0) return null;
  const message = detail[0]?.msg;
  return typeof message === "string"
    ? message.replace(/^Value error,\s*/i, "")
    : null;
}

function errorMessage(status, detail) {
  if (status === 422) {
    return validationMessage(detail) || "Please check the submitted text.";
  }

  if (typeof detail === "string" && detail.trim()) return detail;
  if (status === 404) return "That saved entry could not be found.";
  if (status >= 500) {
    return "The service is temporarily unavailable. Please try again.";
  }
  return DEFAULT_ERROR;
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Unable to reach the API. Confirm the backend is running and try again.",
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) throw new ApiError(DEFAULT_ERROR, response.status);
  }

  if (!response.ok) {
    throw new ApiError(
      errorMessage(response.status, payload?.detail),
      response.status,
    );
  }

  return payload;
}

export function createEntry(text) {
  return request("/entries", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function getEntries() {
  return request("/entries");
}

export function getEntry(entryId) {
  return request(`/entries/${entryId}`);
}
