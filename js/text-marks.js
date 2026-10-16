export const TEXT_MARK_TOOLS = Object.freeze([
  "highlight",
  "annotate-underline",
  "annotate-squiggle",
  "annotate-strike",
]);

export function isTextMarkAnnotation(annotation) {
  return Boolean(
    annotation &&
      (annotation.textMark === true ||
        annotation.type === "highlight" ||
        (annotation.type === "draw" && TEXT_MARK_TOOLS.includes(annotation.tool)))
  );
}
