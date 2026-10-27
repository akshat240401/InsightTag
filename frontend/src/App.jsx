import { useCallback, useEffect, useRef, useState } from "react";

import { createEntry, deleteEntry, getEntries, getEntry } from "./api.js";
import EntryDetail from "./components/EntryDetail.jsx";
import EntryForm from "./components/EntryForm.jsx";
import EntryList from "./components/EntryList.jsx";

const PAGE_SIZE = 10;

export default function App() {
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    page_size: PAGE_SIZE,
    total_pages: 0,
  });
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const mountedRef = useRef(true);
  const listRequestRef = useRef({ id: 0, controller: null });
  const detailRequestRef = useRef({ id: 0, controller: null });
  const deletedEntryIdsRef = useRef(new Set());
  const deleteDialogRef = useRef(null);
  const deleteCancelButtonRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const isDeletingRef = useRef(false);

  const clearSelection = useCallback(() => {
    detailRequestRef.current.controller?.abort();
    detailRequestRef.current = {
      id: detailRequestRef.current.id + 1,
      controller: null,
    };
    setSelectedId(null);
    setSelectedEntry(null);
    setDetailError("");
    setIsLoadingDetail(false);
  }, []);

  const showEntry = useCallback((entry) => {
    detailRequestRef.current.controller?.abort();
    detailRequestRef.current = {
      id: detailRequestRef.current.id + 1,
      controller: null,
    };
    setSelectedId(entry.id);
    setSelectedEntry(entry);
    setDetailError("");
    setIsLoadingDetail(false);
  }, []);

  const loadEntryDetail = useCallback(async (entryId) => {
    detailRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = detailRequestRef.current.id + 1;
    detailRequestRef.current = { id: requestId, controller };

    setSelectedId(entryId);
    setSelectedEntry(null);
    setDetailError("");
    setIsLoadingDetail(true);

    try {
      const entry = await getEntry(entryId, controller.signal);
      if (
        !mountedRef.current ||
        detailRequestRef.current.id !== requestId ||
        deletedEntryIdsRef.current.has(entryId)
      ) {
        return;
      }
      setSelectedEntry(entry);
    } catch (error) {
      if (
        error?.name !== "AbortError" &&
        mountedRef.current &&
        detailRequestRef.current.id === requestId
      ) {
        setDetailError(error.message);
      }
    } finally {
      if (
        mountedRef.current &&
        detailRequestRef.current.id === requestId
      ) {
        setIsLoadingDetail(false);
      }
    }
  }, []);

  const loadSavedEntries = useCallback(
    async (requestedPage, { selectFirst = false } = {}) => {
      listRequestRef.current.controller?.abort();
      const controller = new AbortController();
      const requestId = listRequestRef.current.id + 1;
      listRequestRef.current = { id: requestId, controller };

      setIsLoadingEntries(true);
      setListError("");
      setPagination((current) => ({ ...current, page: requestedPage }));

      try {
        const result = await getEntries(
          requestedPage,
          PAGE_SIZE,
          controller.signal,
        );
        if (
          !mountedRef.current ||
          listRequestRef.current.id !== requestId
        ) {
          return null;
        }

        setEntries(result.items);
        setPagination({
          total: result.total,
          page: result.page,
          page_size: result.page_size,
          total_pages: result.total_pages,
        });

        if (selectFirst) {
          if (result.items.length > 0) {
            loadEntryDetail(result.items[0].id);
          } else {
            clearSelection();
          }
        }
        return result;
      } catch (error) {
        if (
          error?.name !== "AbortError" &&
          mountedRef.current &&
          listRequestRef.current.id === requestId
        ) {
          setListError(error.message);
        }
        return null;
      } finally {
        if (mountedRef.current && listRequestRef.current.id === requestId) {
          setIsLoadingEntries(false);
        }
      }
    },
    [clearSelection, loadEntryDetail],
  );

  useEffect(() => {
    mountedRef.current = true;
    loadSavedEntries(1, { selectFirst: true });
    return () => {
      mountedRef.current = false;
      listRequestRef.current.controller?.abort();
      detailRequestRef.current.controller?.abort();
    };
  }, [loadSavedEntries]);

  useEffect(() => {
    isDeletingRef.current = isDeleting;
  }, [isDeleting]);

  useEffect(() => {
    if (!entryToDelete) return undefined;

    const trigger = deleteTriggerRef.current;
    const dialog = deleteDialogRef.current;
    deleteCancelButtonRef.current?.focus();

    function handleDialogKeyDown(event) {
      if (event.key === "Escape" && !isDeletingRef.current) {
        event.preventDefault();
        setEntryToDelete(null);
        setDeleteError("");
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll("button:not(:disabled)")];
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [entryToDelete]);

  async function handleSubmit(text) {
    if (isSubmitting) return false;

    setIsSubmitting(true);
    setSubmitError("");
    setSuccessMessage("");

    try {
      const createdEntry = await createEntry(text);
      if (!mountedRef.current) return false;
      deletedEntryIdsRef.current.delete(createdEntry.id);
      setEntries((currentEntries) =>
        [
          createdEntry,
          ...currentEntries.filter((entry) => entry.id !== createdEntry.id),
        ].slice(0, PAGE_SIZE),
      );
      showEntry(createdEntry);
      await loadSavedEntries(1);
      setListError("");
      setSuccessMessage("Insight summarized and saved.");
      return true;
    } catch (error) {
      setSubmitError(error.message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSelectEntry(entryId) {
    if (entryId === selectedId && selectedEntry) return;
    loadEntryDetail(entryId);
  }

  function handleRequestDelete(entry, trigger) {
    deleteTriggerRef.current = trigger;
    setEntryToDelete(entry);
    setDeleteError("");
  }

  function handleCancelDelete() {
    if (isDeleting) return;
    setEntryToDelete(null);
    setDeleteError("");
  }

  async function handleConfirmDelete() {
    if (!entryToDelete || isDeleting) return;

    const entryId = entryToDelete.id;
    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteEntry(entryId);
      if (!mountedRef.current) return;

      deletedEntryIdsRef.current.add(entryId);
      setEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.id !== entryId),
      );
      if (selectedId === entryId) clearSelection();
      setEntryToDelete(null);
      setSuccessMessage("Insight deleted.");

      const remainingTotal = Math.max(0, pagination.total - 1);
      const lastPage = Math.max(1, Math.ceil(remainingTotal / PAGE_SIZE));
      const targetPage = Math.min(pagination.page, lastPage);
      await loadSavedEntries(targetPage, { selectFirst: true });
    } catch (error) {
      if (mountedRef.current) setDeleteError(error.message);
    } finally {
      if (mountedRef.current) setIsDeleting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-navbar">
        <div className="navbar-inner">
          <h1>InsightTag</h1>
          <p>AI Content Assistant</p>
        </div>
      </header>
      <main id="top" className="page-content">
        <section className="dashboard-grid" aria-label="InsightTag workspace">
          <EntryForm
            isSubmitting={isSubmitting}
            error={submitError}
            successMessage={successMessage}
            onSubmit={handleSubmit}
          />
          <EntryDetail
            entry={selectedEntry}
            isLoading={isLoadingDetail}
            error={detailError}
            isDeleting={isDeleting}
            variant="featured"
            onDelete={handleRequestDelete}
          />

          <section className="library-section" aria-labelledby="library-title">
            <div className="section-heading">
              <h2 id="library-title">Saved Insights</h2>
              {!isLoadingEntries && !listError && (
                <span className="entry-count">
                  {pagination.total}{" "}
                  {pagination.total === 1 ? "entry" : "entries"}
                </span>
              )}
            </div>
            <EntryList
              entries={entries}
              selectedId={selectedId}
              isLoading={isLoadingEntries}
              error={listError}
              onSelect={handleSelectEntry}
            />
            {pagination.total_pages > 1 && (
              <nav className="pagination" aria-label="Saved Insights pages">
                <button
                  type="button"
                  onClick={() =>
                    loadSavedEntries(pagination.page - 1, { selectFirst: true })
                  }
                  disabled={pagination.page <= 1}
                >
                  Previous
                </button>
                <span aria-live="polite">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    loadSavedEntries(pagination.page + 1, { selectFirst: true })
                  }
                  disabled={pagination.page >= pagination.total_pages}
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        </section>
      </main>

      {entryToDelete && (
        <div className="dialog-backdrop">
          <section
            ref={deleteDialogRef}
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
          >
            <h2 id="delete-dialog-title">Delete saved insight?</h2>
            <p id="delete-dialog-description">
              This saved insight will be permanently deleted. This action
              cannot be undone.
            </p>
            {deleteError && (
              <p className="feedback feedback-error" role="alert">
                <span aria-hidden="true">!</span>
                {deleteError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                ref={deleteCancelButtonRef}
                className="secondary-button"
                type="button"
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
