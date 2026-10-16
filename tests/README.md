# Manual smoke test

Use `sample.pdf` to verify local PDF rendering and page editing:

1. Open the file in `editor.html` or drop it on the landing page.
2. Rotate, duplicate, and reorder a page. Add an annotation before duplicating, then edit or move the copy and confirm the original stays unchanged.
3. Delete a page, then verify undo and redo.
4. Extract the selected page and download the full document.
5. Check the browser Network panel: document bytes stay in this browser.

For a large multi-page PDF, verify loading displays an "Opening files…" status and temporarily disables editor controls and keyboard shortcuts. After loading, scroll through the thumbnail list and the document preview; confirm previews appear as pages enter view, the current-page indicator follows navigation, and page order and selection remain correct. Download the document and reopen it to compare its page count and ordering with the editor.
Add, move, resize, edit, and delete an annotation on a page; compare its thumbnail with the viewer after each change, undo, and redo. Repeat after duplicating, rotating, and reordering the page. Thumbnail overlays should track the page without showing selection handles.

Use `text-sample.pdf` to verify in-place text editing and annotation:

1. With Select text active, verify detected PDF text has dashed blue outlines. Click within the existing “Hello roadmap” text; it should open for editing with the caret near the clicked character, not the entire text selected.
2. Type within the text, then click elsewhere to finish editing; confirm the edit outline disappears. Click the edited text again and verify it reopens without creating a duplicate overlay.
3. Drag across a PDF text run to select text; confirm the selection does not move the run. PDF replacement targets the complete source run: a partial PDF-layer selection should show that limitation, while the inline replacement field should allow selecting and changing a word without losing the rest of the run. Alt-drag (or drag from an unselected area of the run) to move the complete run; confirm the original is covered in the preview and the text appears at the new position. Download and reopen the PDF; confirm the text remains moved and is not duplicated at its original position.
4. Download the edited PDF and reopen it; confirm the extracted text contains the new string and no longer contains “Hello roadmap”.
For in-place PDF text editing, enter printable ASCII and confirm it exports. Then enter a non-ASCII character and mixed ASCII/non-ASCII text; confirm validation appears when the edit is committed, the entered text remains available to correct, and export is blocked until corrected. Verify an empty replacement and a corrected ASCII replacement, including undo/redo. Confirm non-ASCII text in an added text annotation still follows its existing behavior.
4. Choose Add text, click a blank area, and type; while Add text remains active, click the existing text box and replace its text. Confirm no overlapping text box is created. Drag its border with Select active to move it and verify undo restores its previous position.
5. Verify Annotate exposes only Drag, Add text, Add image, Draw, and Add shape. Add text and Add shape options open in a horizontal toolbar row beneath the main toolbar. Add text includes font, size, bold/italic/underline, text/background color, and alignment; set styles, place text, and verify the preview and downloaded PDF preserve them. Drag should pan the page; Add shape options include Line, Rectangle, Circle, and Smiley.
6. In Edit, verify Drag and the Annotate, Shapes, Insert, Edit text, and Forms dropdowns. Each dropdown should show its options in the horizontal toolbar row beneath the main toolbar. In Annotate, drag-select a portion of PDF text with Highlight, Underline, Squiggly underline, and Strikethrough; only the selected text should be marked. Clicking without selecting text must not mark the entire text run. Verify color/opacity and export the marks. Confirm Free Text is present instead of Comment and exposes font, size, formatting, horizontal/vertical alignment, dynamic sizing, color, and outline controls. In Shapes, check separate Stroke and Fill colors, custom palette actions, stroke width/opacity, fill opacity, and line styles; add a Polyline with endpoint markers. Select placed shapes from the annotation list, change their properties, and verify Undo/Redo. Download and reopen the PDF to verify fill opacity, stroke appearance, dash styles, markers, and Polyline points. In Insert, browse and place stamps, create a custom stamp, and verify it appears in the gallery. Create signatures using Draw, Type, and Upload; verify each appears in the saved Signature List, can be deleted, and can be selected and placed again. Insert an attachment and image. Download and reopen the PDF to verify stamps, signatures, attachment, and image. Confirm the Annotate color remains synchronized, then use Undo, Redo, and Eraser.
7. In Forms, verify Signature, Text field, Free Text, Checkbox, Radio button, Dropdown, List Box Field, and the form-field color picker. Check each tool's defaults and properties in the right panel; change text defaults, mark a field required/read-only, and add, reorder, edit, and remove choice options. Place each field by dragging (or click to use its configured default size), switch to Drag/Select to move it, and resize its handles. Free Text should use a crosshair, allow typing, and expose copy, color, link, and delete actions when selected. Confirm the page cursor and Form Field List update. Download and reopen the PDF to verify widget properties, options, text defaults, dimensions, color, and required-field indicators.
8. Draw each shape and a freehand mark; export and reopen the PDF to verify all marks.
9. Attach a small file from Insert, then download and reopen the PDF to verify the attachment is embedded.
10. Use Edit to select text and annotations, apply text styles, reorder or remove layers, then undo and redo.
11. Click Save changes and verify it shows a session-saved confirmation without downloading a file. Download the edited PDF separately and reopen it to verify the remaining marks and form fields were exported.
12. Verify Drag uses a grab cursor and Add text uses a text cursor.
13. Switch to Edit and verify text annotations appear in the page layer list. Select an item, move it forward/backward, or remove it; confirm undo and redo restore the change.
14. Select an added text box and apply a font, size, color, bold/italic/underline/strikethrough, alignment, and optional web link. Export and reopen the PDF to verify its appearance and link.
15. Insert a PNG or JPEG image, switch to Edit/Drag, and drag it to a new position. Select it and drag each corner handle to resize; confirm the proportions stay intact, movement/resizing can be undone, and the downloaded PDF preserves the final image size and position. Use Remove all and undo to check layer deletion.

For PDFs with a table, click text in a populated cell and verify that only that cell's text is selected and opens for direct typing; the item number, headings, and neighboring cells must remain unchanged. Verify the inline preview retains the PDF.js-loaded font.
Click an empty cell in a PDF with drawn table rules, type text directly into it, then export and reopen the PDF; verify the text stays within that cell and populated cells remain unchanged.
For a PDF with colored text on a non-white background, edit a text run and verify the preview keeps its ink color and matches the nearby page background; export and confirm the original PDF text color is retained.

In-place editing supports `Tj` runs, `TJ` arrays with multiple strings and numeric spacing adjustments, and consecutive text-show operations when font and spacing state stays unchanged. Test standard-encoded Type1/TrueType fonts with printable ASCII replacement text, simple Type1/TrueType fonts without an Encoding entry but with a single-byte ToUnicode map and character-width table, and horizontal Identity-H composite fonts with ToUnicode mappings and CID widths. ToUnicode-based replacements should preserve line advance and export the replacement text; characters without an unambiguous source-font mapping, unsupported encodings, and unsupported text runs should produce an explicit error rather than a silent fallback.

Move and resize any element at any time:

1. Add text with Add text still active, then drag the new text box immediately — it moves without switching to Select, and its resize handles are visible right away.
2. Insert an image while in Annotate mode (Drag stays active) and drag it and its corner handles without changing tools; confirm undo restores position and size.
3. Draw a freehand signature or a line/polyline, click it to select it (a selection frame with handles appears), then drag the stroke to move it and drag a handle to resize it; a drawn signature keeps its proportions.
4. With any active tool — Draw, Shapes, Forms, Comment — drag an existing element to move it and use its handles to resize it; empty page areas still create new content, and the Eraser still erases on click.
5. While a text box is being edited, click another element; confirm the finished edit is saved, then confirm clicking the text box reopens it for editing with its handles visible.
6. Export and reopen the PDF to confirm moved/resized text, images, shapes, signatures, lines, and polylines keep their new positions and sizes.

Use `layout-sample.pdf` to check that editing text made from consecutive PDF text-show operations still keeps the original line advance: replace the full “Hello roadmap NEXT” line with both shorter and longer text, export it, and confirm the replacement stays on the same line without shifting its position.

When editing a PDF with bold or italic text, confirm the inline preview retains that style; font metadata comes from the existing PDF.js stack.
