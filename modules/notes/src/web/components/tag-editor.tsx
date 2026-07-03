import { Badge, Button, Input, X } from "@halero/ui";
import { type KeyboardEvent, type ReactElement, useRef } from "react";

export interface TagEditorProps {
  readonly tags: readonly string[];
  readonly onChange: (tags: readonly string[]) => void;
}

/**
 * Add/remove chips for a note's tags; duplicates and blanks are ignored.
 * The add field is uncontrolled (read straight off the DOM node, the
 * app's established text-input pattern) and cleared imperatively after a
 * successful add, rather than through a controlled value.
 */
export const TagEditor = ({ tags, onChange }: TagEditorProps): ReactElement => {
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (): void => {
    const field = inputRef.current;
    if (field === null) {
      return;
    }
    const tag = field.value.trim();
    if (tag !== "" && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    field.value = "";
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge key={tag} variant="outline" className="gap-1">
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          aria-label="Add tag"
          placeholder="Add a tag..."
          onKeyDown={onKeyDown}
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag}>
          Add
        </Button>
      </div>
    </div>
  );
};
