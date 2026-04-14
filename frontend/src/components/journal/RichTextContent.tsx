/**
 * Renders stored HTML rich text content from Tiptap.
 * Uses the same prose styles as the editor for consistent rendering.
 */
interface RichTextContentProps {
  html: string;
  className?: string;
}

export function RichTextContent({ html, className = '' }: RichTextContentProps) {
  return (
    <div
      className={`theme-prose prose prose-sm dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
