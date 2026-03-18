import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import { useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  ImageIcon,
  Loader2,
} from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { uploadJournalImage } from '@/lib/api/journal';

interface RichTextEditorProps {
  content?: string;
  placeholder?: string;
  onChange?: (html: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

export function RichTextEditor({
  content = '',
  placeholder = 'Napiš poznámku…',
  onChange,
  onSubmit,
  autoFocus = false,
}: RichTextEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Underline,
      Image.configure({ inline: false }),
    ],
    content,
    autofocus: autoFocus,
    onUpdate({ editor }) {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      handleKeyDown(_, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          onSubmit?.();
          return true;
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (!imageFiles.length) return false;
        event.preventDefault();
        imageFiles.forEach(async (file) => {
          setIsUploading(true);
          try {
            const url = await uploadJournalImage(file);
            const { schema } = view.state;
            const node = schema.nodes.image.create({ src: url });
            const transaction = view.state.tr.replaceSelectionWith(node);
            view.dispatch(transaction);
          } catch { /* ignore */ }
          finally { setIsUploading(false); }
        });
        return true;
      },
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setIsUploading(true);
    try {
      const url = await uploadJournalImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      // silently ignore
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!editor) return null;

  return (
    <div className="border border-input rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-ring">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-muted/40">
        <Toggle
          size="sm"
          pressed={editor.isActive('heading', { level: 2 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Nadpis H2"
          className="h-7 w-7 p-0"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('heading', { level: 3 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label="Nadpis H3"
          className="h-7 w-7 p-0"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </Toggle>
        <div className="w-px h-4 bg-border mx-1" />
        <Toggle
          size="sm"
          pressed={editor.isActive('bold')}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          aria-label="Tučné"
          className="h-7 w-7 p-0"
        >
          <Bold className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('italic')}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Kurzíva"
          className="h-7 w-7 p-0"
        >
          <Italic className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('underline')}
          onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Podtržení"
          className="h-7 w-7 p-0"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Toggle>
        <div className="w-px h-4 bg-border mx-1" />
        <Toggle
          size="sm"
          pressed={editor.isActive('bulletList')}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Odrážky"
          className="h-7 w-7 p-0"
        >
          <List className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('orderedList')}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Číslovaný seznam"
          className="h-7 w-7 p-0"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Toggle>
        <div className="w-px h-4 bg-border mx-1" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-label="Vložit obrázek"
          className="h-7 w-7 p-0 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isUploading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <ImageIcon className="h-3.5 w-3.5" />
          }
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleImageUpload}
        />
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[100px] focus:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[80px] [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_img]:max-w-full [&_.tiptap_img]:rounded-md"
      />
    </div>
  );
}
