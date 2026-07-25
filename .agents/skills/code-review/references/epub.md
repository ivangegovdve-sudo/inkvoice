Applies when: the diff touches `src/lib/epub`, book upload/import, EPUB-derived
chapter or paragraph structures, search indexing, reader positions, or tests
and fixtures for parsed book content.

# EPUB behavior

Treat EPUB input as external and frequently malformed. Trace representative
content from archive entry through parsing, stored book structure, reader
rendering, search, progress, and TTS segmentation.

Check:

- archive paths and filenames cannot traverse outside the extraction boundary;
- missing, reordered, duplicated, or non-linear spine entries fail or degrade
  deliberately;
- HTML parsing preserves meaningful text, entities, emphasis, headings,
  epigraphs, scene breaks, tables, and paragraph order without rendering
  executable content;
- chunking never drops, duplicates, or reorders text and keeps plain-text
  offsets aligned with rendered segments;
- inferred titles and table-of-contents matching remain stable for duplicate,
  absent, filename-like, and differently normalized titles;
- chapter and paragraph indices remain compatible with saved progress,
  bookmarks, search results, and generated-audio positions;
- empty or unspeakable content cannot create infinite navigation, generation,
  or retry loops;
- parsing errors identify the book and boundary without leaking its full
  private contents into logs.

Prefer focused fixtures that prove a distinct input shape. Do not demand a new
fixture when an existing one or direct parser evidence covers the risk.
