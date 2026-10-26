import { useEffect, useState } from "react";

import { createEntry, getEntries, getEntry } from "./api.js";
import EntryDetail from "./components/EntryDetail.jsx";
import EntryForm from "./components/EntryForm.jsx";
import EntryList from "./components/EntryList.jsx";

export default function App() {
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadSavedEntries() {
      try {
        const savedEntries = await getEntries();
        if (!isActive) return;

        setEntries(savedEntries);
        setListError("");

        if (savedEntries.length > 0) {
          setIsLoadingDetail(true);
          try {
            const firstEntry = await getEntry(savedEntries[0].id);
            if (!isActive) return;
            setSelectedId(firstEntry.id);
            setSelectedEntry(firstEntry);
          } catch (error) {
            if (isActive) setDetailError(error.message);
          } finally {
            if (isActive) setIsLoadingDetail(false);
          }
        }
      } catch (error) {
        if (isActive) setListError(error.message);
      } finally {
        if (isActive) setIsLoadingEntries(false);
      }
    }

    loadSavedEntries();
    return () => {
      isActive = false;
    };
  }, []);

  async function handleSubmit(text) {
    if (isSubmitting) return false;

    setIsSubmitting(true);
    setSubmitError("");
    setSuccessMessage("");

    try {
      const createdEntry = await createEntry(text);
      setEntries((currentEntries) => [
        createdEntry,
        ...currentEntries.filter((entry) => entry.id !== createdEntry.id),
      ]);
      setSelectedId(createdEntry.id);
      setSelectedEntry(createdEntry);
      setDetailError("");
      setListError("");
      setSuccessMessage(`Entry #${createdEntry.id} summarized and saved.`);
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

    setSelectedId(entryId);
    setSelectedEntry(null);
    setDetailError("");
    setIsLoadingDetail(true);

    try {
      const entry = await getEntry(entryId);
      setSelectedEntry(entry);
    } catch (error) {
      setDetailError(error.message);
    } finally {
      setIsLoadingDetail(false);
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
            variant="featured"
          />

          <section className="library-section" aria-labelledby="library-title">
            <div className="section-heading">
              <h2 id="library-title">Saved Insights</h2>
              {!isLoadingEntries && !listError && (
                <span className="entry-count">
                  {entries.length} {entries.length === 1 ? "entry" : "entries"}
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
          </section>
        </section>
      </main>
    </div>
  );
}
