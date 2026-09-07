"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditableTitleProps {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function EditableTitle({
  value,
  onSave,
  placeholder = "Untitled conversation",
  className,
  inputClassName,
  disabled,
}: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    const next = draft.trim() || placeholder;
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        className={cn("flex min-w-0 items-center gap-1", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") cancel();
          }}
          disabled={saving}
          className={cn(
            "min-w-0 flex-1 rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-white outline-none focus:border-indigo-500",
            inputClassName
          )}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={saving}
          className="rounded p-1 text-emerald-400 hover:bg-zinc-800"
          aria-label="Save title"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
          aria-label="Cancel rename"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn("group flex min-w-0 items-center gap-1.5", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <span className={cn("truncate font-semibold text-white", inputClassName)} title={value}>
        {value || placeholder}
      </span>
      {!disabled && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-300 group-hover:opacity-100 focus:opacity-100"
          aria-label="Rename conversation"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
