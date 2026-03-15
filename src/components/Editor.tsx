import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Markdown from 'react-markdown';
import { diffWords } from 'diff';
import { generateInitialDraft, iterateText, getProactiveSuggestion, generateImage } from '../services/ai';
import { Sparkles, Wand2, RefreshCw, ArrowRight, Check, X, Loader2, Paperclip, ChevronDown, ChevronUp, Image as ImageIcon, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const renderDiff = (original: string, improved: string) => {
  const diffParts = diffWords(original, improved);
  return diffParts.map((part, index) => {
    if (part.added) {
      return <span key={index} className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 rounded px-0.5 mx-0.5">{part.value}</span>;
    }
    if (part.removed) {
      return <span key={index} className="bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 line-through rounded px-0.5 mx-0.5">{part.value}</span>;
    }
    return <span key={index}>{part.value}</span>;
  });
};

interface EditorProps {
  initialContent: string;
  onSave: (content: string) => void;
}

export default function Editor({ initialContent, onSave }: EditorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [proactiveSuggestion, setProactiveSuggestion] = useState<{ text: string, feedback: string, from: number, to: number, original: string, imagePrompt?: string, imageReasoning?: string, imageUrl?: string } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnalyzedTextRef = useRef<string>('');
  const [isWidgetExpanded, setIsWidgetExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingProactiveImage, setIsGeneratingProactiveImage] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-2xl shadow-lg dark:shadow-2xl dark:shadow-black/60 border border-zinc-200 dark:border-white/10 my-8 w-full object-cover bg-zinc-100 dark:bg-zinc-900/50 ring-1 ring-black/5 dark:ring-white/5 transition-all duration-300',
        },
      }),
      Placeholder.configure({
        placeholder: 'Start writing or type "/" for commands...',
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose prose-lg dark:prose-invert focus:outline-none max-w-none min-h-[500px] leading-relaxed',
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }

      // Debounce proactive suggestions
      suggestionTimeoutRef.current = setTimeout(async () => {
        const { state } = editor;
        const { selection } = state;
        const { $anchor } = selection;
        
        const node = $anchor.parent;
        const text = node.textContent;

        // Heuristic 1: Only analyze paragraphs or headings
        if (!['paragraph', 'heading'].includes(node.type.name)) return;

        // Heuristic 2: Must have some substance (e.g., > 40 characters)
        if (text.length < 40) return;

        // Heuristic 3: Trigger on significant edits or completed thoughts
        const lastAnalyzed = lastAnalyzedTextRef.current;
        const isSignificantChange = Math.abs(text.length - lastAnalyzed.length) > 20;
        const endsWithPunctuation = /[.!?]\s*$/.test(text);

        if (isSignificantChange || (endsWithPunctuation && text !== lastAnalyzed)) {
          lastAnalyzedTextRef.current = text;

          const startPos = $anchor.start();
          const endPos = $anchor.end();
          const doc = editor.state.doc;
          
          const contextBefore = doc.textBetween(Math.max(0, startPos - 1500), Math.max(0, startPos - 1), '\n');
          const contextAfter = doc.textBetween(Math.min(doc.content.size, endPos + 1), Math.min(doc.content.size, endPos + 1500), '\n');

          const suggestion = await getProactiveSuggestion(text, contextBefore, contextAfter);
          if (suggestion) {
            setProactiveSuggestion({
              text: suggestion.improvedText,
              feedback: suggestion.feedback,
              from: startPos,
              to: endPos,
              original: text,
              imagePrompt: suggestion.imagePrompt,
              imageReasoning: suggestion.imageReasoning
            });
          }
        }
      }, 2500);
    }
  });

  useEffect(() => {
    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (proactiveSuggestion?.imagePrompt && !proactiveSuggestion.imageUrl && !isGeneratingProactiveImage) {
      let isCurrent = true;
      const fetchImage = async () => {
        setIsGeneratingProactiveImage(true);
        try {
          const url = await generateImage(proactiveSuggestion.imagePrompt!);
          if (isCurrent && url) {
            setProactiveSuggestion(prev => prev ? { ...prev, imageUrl: url } : null);
          }
        } catch (e) {
          console.error(e);
        } finally {
          if (isCurrent) setIsGeneratingProactiveImage(false);
        }
      };
      fetchImage();
      return () => { isCurrent = false; };
    }
  }, [proactiveSuggestion?.imagePrompt, proactiveSuggestion?.imageUrl]);

  if (!editor) {
    return null;
  }

  const handleSave = () => {
    setIsSaving(true);
    onSave(editor.getHTML());
    setTimeout(() => setIsSaving(false), 1500);
  };

  const handleGenerateImage = async () => {
    const prompt = window.prompt("What kind of image would you like to generate?");
    if (!prompt) return;
    setIsGeneratingImage(true);
    try {
      const imageUrl = await generateImage(prompt);
      if (imageUrl) {
        editor.chain().focus().setImage({ src: imageUrl }).run();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerate = async (prompt: string) => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const draft = await generateInitialDraft(prompt, files);
      editor.commands.insertContent(draft);
      setFiles([]);
    } catch (error) {
      console.error("Failed to generate draft", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleIterate = async (instruction: string) => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    if (!selectedText) return;

    setIsGenerating(true);
    try {
      const context = editor.getText().slice(0, 1000);
      const newText = await iterateText(selectedText, instruction, context);
      editor.chain().focus().insertContent(newText).run();
    } catch (error) {
      console.error("Failed to iterate", error);
    } finally {
      setIsGenerating(false);
      setShowCustomInput(false);
      setCustomInstruction('');
    }
  };

  const applyProactiveSuggestion = () => {
    if (!proactiveSuggestion) return;
    
    editor.chain()
      .focus()
      .deleteRange({ from: proactiveSuggestion.from, to: proactiveSuggestion.to })
      .insertContent(proactiveSuggestion.text)
      .run();
      
    setProactiveSuggestion(null);
  };

  const insertProactiveImage = () => {
    if (!proactiveSuggestion?.imageUrl) return;
    editor.chain()
      .focus()
      .setTextSelection(proactiveSuggestion.to)
      .insertContent('\n')
      .setImage({ src: proactiveSuggestion.imageUrl })
      .run();
      
    setProactiveSuggestion(null);
  };

  return (
    <div className="relative w-full px-4 pb-32">
      {/* Top Bar */}
      <div className="flex justify-end mb-4">
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium transition-colors"
        >
          {isSaving ? <Check className="w-4 h-4 text-emerald-500" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Floating Menu for empty lines */}
      <FloatingMenu editor={editor} className="flex items-center gap-2">
        <div className="flex items-center bg-white dark:bg-zinc-900 shadow-lg border border-zinc-200 dark:border-zinc-800 rounded-full px-3 py-1.5">
          <Sparkles className="w-4 h-4 text-indigo-500 mr-2" />
          <input 
            type="text" 
            placeholder="Ask AI to write..." 
            className="bg-transparent border-none outline-none text-sm w-64 dark:text-zinc-200"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleGenerate(e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            title="Attach files"
          >
            <Paperclip className="w-4 h-4 text-zinc-400" />
          </button>
          <button 
            onClick={handleGenerateImage}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            title="Generate Image"
            disabled={isGeneratingImage}
          >
            {isGeneratingImage ? <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" /> : <ImageIcon className="w-4 h-4 text-zinc-400" />}
          </button>
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            multiple
            onChange={(e) => {
              if (e.target.files) {
                setFiles(Array.from(e.target.files));
              }
            }}
          />
          {files.length > 0 && (
            <span className="text-xs font-medium text-indigo-500 ml-2">{files.length} attached</span>
          )}
        </div>
      </FloatingMenu>

      {/* Bubble Menu for selected text */}
      <BubbleMenu editor={editor} options={{ placement: 'top' }}>
        <div className="flex flex-col bg-white dark:bg-zinc-900 shadow-xl border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          {!showCustomInput ? (
            <div className="flex items-center p-1">
              <button onClick={() => handleIterate("Improve this text")} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
                <Wand2 className="w-4 h-4 text-indigo-500" />
                Improve
              </button>
              <button onClick={() => handleIterate("Make it shorter")} className="px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
                Shorter
              </button>
              <button onClick={() => handleIterate("Make it longer")} className="px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
                Longer
              </button>
              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
              <button onClick={() => setShowCustomInput(true)} className="px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
                Custom...
              </button>
            </div>
          ) : (
            <div className="flex items-center p-2 gap-2">
              <input 
                autoFocus
                type="text" 
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="Tell AI what to do..." 
                className="bg-zinc-100 dark:bg-zinc-800 border-none outline-none text-sm px-3 py-1.5 rounded-md w-64"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleIterate(customInstruction);
                  } else if (e.key === 'Escape') {
                    setShowCustomInput(false);
                  }
                }}
              />
              <button 
                onClick={() => handleIterate(customInstruction)}
                className="p-1.5 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setShowCustomInput(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </BubbleMenu>

      {/* Main Editor Content */}
      <div className={cn("transition-opacity duration-300", isGenerating && "opacity-50 pointer-events-none")}>
        <EditorContent editor={editor} />
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white dark:bg-zinc-900 shadow-lg border border-zinc-200 dark:border-zinc-800 rounded-full px-4 py-2"
          >
            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
            <span className="text-sm font-medium">AI is thinking...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Proactive Suggestion Widget */}
      <AnimatePresence>
        {proactiveSuggestion && !isGenerating && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed top-24 right-8 w-80 bg-white dark:bg-zinc-900 shadow-2xl border border-indigo-100 dark:border-indigo-900/50 rounded-2xl overflow-hidden z-50"
          >
            <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 border-b border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">AI Suggestion</span>
              </div>
              <button onClick={() => setProactiveSuggestion(null)} className="text-indigo-400 hover:text-indigo-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {proactiveSuggestion.text !== proactiveSuggestion.original && (
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-xs font-medium text-indigo-500">Why:</p>
                    <button 
                      onClick={() => setIsWidgetExpanded(!isWidgetExpanded)} 
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    >
                      {isWidgetExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className={cn("text-sm text-zinc-600 dark:text-zinc-400 mb-3", !isWidgetExpanded && "line-clamp-2")}>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <Markdown>{proactiveSuggestion.feedback}</Markdown>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-indigo-500 mb-1">Suggestion:</p>
                  <p className={cn("text-sm text-zinc-800 dark:text-zinc-200", !isWidgetExpanded && "line-clamp-3")}>
                    {renderDiff(proactiveSuggestion.original, proactiveSuggestion.text)}
                  </p>
                </div>
              )}

              {proactiveSuggestion.imagePrompt && (
                <div className={cn("mb-4", proactiveSuggestion.text !== proactiveSuggestion.original && "pt-4 border-t border-indigo-100 dark:border-indigo-900/50")}>
                  <p className="text-xs font-medium text-indigo-500 mb-1">Visual Suggestion:</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                    {proactiveSuggestion.imageReasoning}
                  </p>
                  
                  {isGeneratingProactiveImage && !proactiveSuggestion.imageUrl ? (
                    <div className="w-full aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center mb-3">
                      <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    </div>
                  ) : proactiveSuggestion.imageUrl ? (
                    <div className="mb-3 rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 shadow-sm dark:shadow-lg dark:shadow-black/40 bg-zinc-100 dark:bg-zinc-900/50 ring-1 ring-black/5 dark:ring-white/5">
                      <img src={proactiveSuggestion.imageUrl} alt="Suggested visual" className="w-full h-auto object-cover aspect-video" />
                    </div>
                  ) : null}

                  <button 
                    onClick={insertProactiveImage}
                    disabled={!proactiveSuggestion.imageUrl}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 text-sm font-medium py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Insert Image
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                {proactiveSuggestion.text !== proactiveSuggestion.original && (
                  <button 
                    onClick={applyProactiveSuggestion}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium py-2 rounded-xl transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    Apply Text
                  </button>
                )}
                <button 
                  onClick={() => setProactiveSuggestion(null)}
                  className="flex-1 flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium py-2 rounded-xl transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
