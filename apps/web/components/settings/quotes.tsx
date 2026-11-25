"use client";

import { useMemo, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { GroupedList } from "@/components/ui/grouped-list";
import { TrashIcon } from "@/components/ui/icons";
import { useCollection } from "@/lib/client/data/hooks";
import { addQuote, deleteQuote } from "@/lib/client/data/settings";
import { Section } from "./parts";

export function QuotesSection() {
  const { rows } = useCollection("sp_quotes");
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const mine = useMemo(
    () => rows.filter((q) => !q.is_builtin).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [rows],
  );
  const builtin = rows.length - mine.length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addQuote(text, author);
    setText("");
    setAuthor("");
  };

  return (
    <Section
      id="quotes"
      title="Quotes"
      description={`The Goals page shows one at random from ${builtin || "the"} built-in ${builtin === 1 ? "quote" : "quotes"} and any you add here.`}
    >
      <form onSubmit={submit} className="glass flex flex-col gap-2 rounded-list p-3">
        <label htmlFor="quote-text" className="sr-only">
          Quote
        </label>
        <textarea
          autoComplete="off"
          enterKeyHint="enter"
          autoCapitalize="sentences"
          id="quote-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="A line worth remembering"
          className={`${inputClass} h-auto resize-none py-2.5 leading-snug`}
        />
        <div className="flex gap-2">
          <label htmlFor="quote-author" className="sr-only">
            Author
          </label>
          <input
            autoComplete="off"
            enterKeyHint="done"
            id="quote-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            maxLength={120}
            placeholder="Who said it (optional)"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button type="submit" variant="primary" disabled={!text.trim()}>
            Add
          </Button>
        </div>
      </form>
      {mine.length > 0 && (
        <GroupedList aria-label="Your quotes" role="list">
          {mine.map((q) => (
            <div key={q.id} role="listitem" className="flex items-start gap-2 py-3 pl-4 pr-2">
              <div className="min-w-0 flex-1">
                <p className="text-fg">“{q.text}”</p>
                {q.author && <p className="mt-0.5 text-footnote text-fg-2">{q.author}</p>}
              </div>
              <IconButton
                label={`Remove quote: ${q.text.slice(0, 40)}`}
                variant="plain"
                onClick={() => deleteQuote(q.id)}
              >
                <TrashIcon size={18} />
              </IconButton>
            </div>
          ))}
        </GroupedList>
      )}
    </Section>
  );
}
