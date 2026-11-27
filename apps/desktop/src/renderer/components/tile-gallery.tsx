import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

/**
 * A gallery of tiles to choose one from (B27, shared with B28): a picture over each tile's
 * name, the picture playing while the pointer or keyboard focus is on its tile. A radio group:
 * one tab stop, and the arrow keys, Home and End move through it and choose, as radio
 * buttons do.
 */

export interface Tile<K extends string> {
  key: K;
  name: string;
  /** Shown on hover. */
  title: string;
  /** The tile's picture, playing or still. */
  picture: (playing: boolean) => ReactNode;
}

export function TileGallery<K extends string>({
  label,
  tiles,
  chosen,
  onChoose,
  onClickTile,
  className,
  testId,
}: {
  /** The radio group's name. */
  label: string;
  tiles: readonly Tile<K>[];
  chosen: K;
  onChoose: (key: K) => void;
  /** After a tile is clicked (not moved to with the keys): a menu closes, for example. */
  onClickTile?: () => void;
  className?: string;
  testId?: string;
}) {
  const [showing, setShowing] = useState<K | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(
    0,
    tiles.findIndex((tile) => tile.key === chosen),
  );
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    let next: number | null = null;
    if (event.key in step) next = (at + step[event.key]! + tiles.length) % tiles.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tiles.length - 1;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (tiles[next]!.key !== chosen) onChoose(tiles[next]!.key);
    buttons.current[next]?.focus();
  };
  return (
    <div
      className={`tile-gallery${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      data-testid={testId}
    >
      {tiles.map((tile, index) => {
        const checked = tile.key === chosen;
        return (
          <button
            key={tile.key}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="gallery-tile"
            title={tile.title}
            data-key={tile.key}
            onClick={() => {
              if (!checked) onChoose(tile.key);
              onClickTile?.();
            }}
            onPointerEnter={() => setShowing(tile.key)}
            onPointerLeave={() => setShowing(null)}
            onFocus={() => setShowing(tile.key)}
            onBlur={() => setShowing(null)}
          >
            {tile.picture(showing === tile.key)}
            <span>{tile.name}</span>
          </button>
        );
      })}
    </div>
  );
}
