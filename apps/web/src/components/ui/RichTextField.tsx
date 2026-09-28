"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import { useRef, useState, useEffect } from "react"
import StarterKit from "@tiptap/starter-kit"

import Modal, { ModalFooter } from "@/components/ui/Modal"
import { TextSelection } from "@tiptap/pm/state"

const toolbarBtn =
  "rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground-secondary hover:bg-fill-secondary border-border text-foreground-secondary hover:bg-fill-secondary"

const toolbarBtnActive =
  "rounded-md border border-primary bg-primary px-2 py-1 text-xs font-medium text-primary-text"

export function RichTextToolbar({ editor, onOpenLink }: { editor: any, onOpenLink: () => void }) {
  const [, setTick] = useState(0)
  
  useEffect(() => {
    const update = () => setTick(t => t + 1)
    editor.on('transaction', update)
    return () => {
        editor.off('transaction', update)
    }
  }, [editor])

  if (!editor) return null
  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      <button
        type="button"
        className={editor.isActive('bold') ? toolbarBtnActive : toolbarBtn}
        onClick={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBold().run();
        }}
        title="Bold"
      >
        <span className="font-bold">B</span>
      </button>
      <button
        type="button"
        className={editor.isActive('italic') ? toolbarBtnActive : toolbarBtn}
        onClick={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleItalic().run();
        }}
        title="Italic"
      >
        <span className="italic">I</span>
      </button>
      <button
        type="button"
        className={editor.isActive('underline') ? toolbarBtnActive : toolbarBtn}
        onClick={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleUnderline().run();
        }}
        title="Underline"
      >
        <span className="underline">U</span>
      </button>
      <button
        type="button"
        className={editor.isActive('bulletList') ? toolbarBtnActive : toolbarBtn}
        onClick={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBulletList().run();
        }}
        
        title="Bullet list"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
      </button>
      <button
        type="button"
        className={editor.isActive('link') ? toolbarBtnActive : toolbarBtn}
        onClick={(e) => {
            e.preventDefault();
            onOpenLink();
        }}
        title="Link"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      </button>
    </div>
  )
}

export default function RichTextField({
  label,
  icon,
  value,
  onChange,
  rows = 4,
  compact = false,
  mono = false,
  required = false,
  className,
  externalHistory = false,
}: {
  label?: string
  icon?: React.ReactNode
  value: string
  onChange: (value: string) => void
  rows?: number
  compact?: boolean
  mono?: boolean
  required?: boolean
  className?: string
  /** When true, this field's own undo/redo (Mod-Z) is disabled so a host-level
   * undo stack can own Mod-Z instead; the host is responsible for restoring
   * `value` on undo, which this component syncs back into the editor. */
  externalHistory?: boolean
}) {
  const [isFocused, setIsFocused] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [linkTitle, setLinkTitle] = useState("")
  const [showTitleOption, setShowTitleOption] = useState(false)
  const [urlError, setUrlError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef<any>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  
  const editor = useEditor({
    immediatelyRender: true,
    parseOptions: {
        preserveWhitespace: 'full',
    },
    extensions: [
      StarterKit.configure({
        ...(externalHistory ? { undoRedo: false } : {}),
        bulletList: {
          keepMarks: true,
          keepAttributes: true,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: true,
        },
        link: {
          openOnClick: false,
          autolink: false, // Prevents automatic link creation on click
          HTMLAttributes: {
              class: 'text-[var(--brand-color-primary)] underline',
          },
        },
        underline: {
            HTMLAttributes: {
                class: 'underline',
            }
        },
      }),
    ],
    content: value,
    // Prevent default browser behavior of opening links in editor by clicking
      editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none whitespace-pre-wrap rounded-lg border border-border bg-background p-2 text-sm text-foreground transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[var(--brand-color-primary)] [&_a]:underline ${className}`,
        style: `font-family: inherit; min-height: ${rows * 1.5}rem;`,
      },
      handleClick: (view, pos, event) => {
        const { state } = view;
        const $pos = state.doc.resolve(pos);
        const link = $pos.marks().find((m) => m.type.name === 'link');
        if (link) {
          event.preventDefault();
          // Move cursor to link so getAttributes('link') works
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
          openLinkModal();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Keeps the editor in sync when `value` changes from outside typing (e.g. a
  // host-level undo/redo restoring a prior snapshot); a no-op during normal
  // typing since `value` already matches the editor's HTML by the time this runs.
  useEffect(() => {
    if (!editor) return
    if (value === editor.getHTML()) return
    editor.commands.setContent(value, {
      emitUpdate: false,
      parseOptions: { preserveWhitespace: "full" },
    })
  }, [editor, value])

  useEffect(() => {
    if (!linkModalOpen && selectionRef.current && editor) {
      editor.commands.setTextSelection(selectionRef.current);
      editor.commands.focus();
      selectionRef.current = null;
    }
  }, [linkModalOpen, editor]);

  useEffect(() => {
    if (linkModalOpen && firstInputRef.current) {
        setTimeout(() => {
            firstInputRef.current?.focus();
        }, 100);
    }
  }, [linkModalOpen]);

  useEffect(() => {
    if (!editor) return;

    const onFocus = () => setIsFocused(true);
    const onBlur = ({ event }: { event: any }) => {
      // If the new focus target is inside our container OR modal is open (linkModalOpen), keep focus
      if (containerRef.current?.contains(event?.relatedTarget as Node) || linkModalOpen) return
      setIsFocused(false)
    };

    editor.on('focus', onFocus);
    editor.on('blur', onBlur);

    return () => {
        editor.off('focus', onFocus);
        editor.off('blur', onBlur);
    }
  }, [editor, linkModalOpen]);

  function openLinkModal() {
    if (!editor) return;
    
    // Ensure the focus state is correct before opening modality
    setIsFocused(true);

    // Save the selection before we potentially modify it
    selectionRef.current = editor.state.selection;

    // Extend selection to cover the link range if we are in a link
    editor.commands.extendMarkRange("link");
    
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    
    const linkAttrs = editor.getAttributes("link");
    
    setLinkUrl(linkAttrs.href || "");
    setLinkTitle(text || "");
    // Always show title so it can be edited if desired
    setShowTitleOption(true);
    setUrlError(false);
    setLinkModalOpen(true);
  }

  function handleAddLink() {
    if (!editor) return;
    if (!linkUrl) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
        try {
            new URL(linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`);
        } catch {
            setUrlError(true);
            return;
        }

        const urlToApply = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
        
        // Re-extend mark range to ensure we have the right range
        editor.chain().focus().extendMarkRange("link").run();
        
        const { from, to } = editor.state.selection;
        
        // If the user changed the text, replace content
        const currentText = editor.state.doc.textBetween(from, to, ' ');
        if (currentText !== linkTitle) {
            editor.chain().focus().deleteRange({from, to}).insertContent({
                type: 'text',
                text: linkTitle,
                marks: [{
                    type: 'link',
                    attrs: { href: urlToApply }
                }]
            }).run();
        } else {
            editor.chain().focus().setLink({ href: urlToApply }).run();
        }
    }
    setLinkModalOpen(false);
  }

  function handleRemoveLink() {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkModalOpen(false);
  }

  return (
    <div ref={containerRef}>
      {label ? (
        <label className="flex items-center gap-1.5 text-xs font-medium text-foreground-secondary mb-1">
          {icon}
          {label}
        </label>
      ) : null}
      
      {isFocused && <RichTextToolbar editor={editor} onOpenLink={openLinkModal} />}
      <EditorContent editor={editor} />
      
      <Modal 
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        title="Link"
        footer={
            <ModalFooter>
                <button type="button" onClick={() => setLinkModalOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-fill-secondary">Cancel</button>
                <div className="flex-1" />
                {linkUrl && (
                    <button type="button" onClick={handleRemoveLink} className="rounded-lg border border-border px-4 py-2 text-sm text-red-600 hover:bg-fill-secondary">Remove</button>
                )}
                <button type="button" onClick={handleAddLink} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-text">Apply</button>
            </ModalFooter>
        }
      >
        <div className="space-y-3" onKeyDown={(e) => {
              if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLink();
              }
        }}>
          {showTitleOption && (
            <input 
                ref={firstInputRef}
                type="text" 
                value={linkTitle} 
                onChange={(e) => setLinkTitle(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
                placeholder="Text"
            />
          )}
          <input 
              ref={!showTitleOption ? firstInputRef : null}
              type="text" 
              value={linkUrl} 
              onChange={(e) => { setUrlError(false); setLinkUrl(e.target.value); }}
              className={`w-full rounded-lg border border-border px-3 py-2 text-sm bg-background ${urlError ? 'border-error' : ''}`}
              placeholder="https://example.com"
          />
          {urlError && <p className="text-xs text-red-500">Please enter a valid URL</p>}
        </div>
      </Modal>
    </div>
  )
}