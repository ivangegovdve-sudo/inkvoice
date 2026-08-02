-- Existing jobs keep NULL segment data because prior reposition history cannot
-- be reconstructed truthfully. Active jobs begin a measurable segment when
-- the worker next advances them.
ALTER TABLE "PregenJob" ADD COLUMN "generationStartChapter" INTEGER;
ALTER TABLE "PregenJob" ADD COLUMN "generationStartParagraph" INTEGER;
ALTER TABLE "PregenJob" ADD COLUMN "generationSegmentNumber" INTEGER;
ALTER TABLE "PregenJob" ADD COLUMN "readyWordsInSegment" INTEGER;
