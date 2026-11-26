import { createPanoramaSpot } from '@vedraopus/model';
import type { PanoramaObject, PanoramaSpot } from '@vedraopus/model';
import { CommitField } from './PlayerTabs';
import { NumericInput } from './NumericInput';

type Props = PanoramaObject['props'];

/**
 * The Format panel's 360° image section (docs/briefs/P9.10-panoramas.md): free or
 * guided, where the view starts, and the spots in their guided order. Double-
 * clicking the picture on the slide adds a spot there too.
 */
export function PanoramaFormat({
  panorama,
  update,
}: {
  panorama: PanoramaObject;
  /** Save these props as one undo step. */
  update: (changes: Partial<Props>) => void;
}) {
  const { props } = panorama;
  const spots = props.spots;
  const setSpots = (next: PanoramaSpot[]) => update({ spots: next });
  const change = (index: number, patch: Partial<PanoramaSpot>) =>
    setSpots(spots.map((spot, at) => (at === index ? { ...spot, ...patch } : spot)));
  const swap = (index: number, other: number) => {
    const next = [...spots];
    [next[index], next[other]] = [next[other]!, next[index]!];
    setSpots(next);
  };
  const angle = (
    label: string,
    value: number,
    min: number,
    max: number,
    save: (n: number) => void,
  ) => (
    <label className="field">
      <span>{label}</span>
      <NumericInput
        aria-label={label}
        value={String(value)}
        min={min}
        max={max}
        undoLabel={`Change ${label.toLowerCase()}`}
        onValue={(n) => {
          if (n !== null && n >= min && n <= max) save(n);
        }}
      />
    </label>
  );

  return (
    <section data-testid="panorama-format">
      <h3 className="panel-subtitle">360° image</h3>
      <label className="field">
        <span>Exploring</span>
        <select
          aria-label="360° image exploring"
          value={props.mode}
          onChange={(e) => update({ mode: e.target.value as Props['mode'] })}
        >
          <option value="free">Free: look anywhere</option>
          <option value="guided">Guided: Previous and Next go spot by spot</option>
        </select>
      </label>
      <div className="field-row">
        {angle('Start yaw', props.start.yaw, -180, 180, (yaw) =>
          update({ start: { ...props.start, yaw } }),
        )}
        {angle('Start pitch', props.start.pitch, -90, 90, (pitch) =>
          update({ start: { ...props.start, pitch } }),
        )}
        {angle('Start zoom', props.start.fov, 30, 100, (fov) =>
          update({ start: { ...props.start, fov } }),
        )}
      </div>
      <p className="muted">
        Yaw turns round (−180 to 180), pitch looks up or down (−90 to 90), zoom is how wide the view
        sees (30 to 100). Double-click the picture on the slide to add a spot there.
      </p>
      <ol className="panorama-spots" data-testid="panorama-spots">
        {spots.map((spot, index) => (
          <li key={spot.id} data-testid="panorama-spot">
            <CommitField
              label={`Spot ${index + 1} name`}
              value={spot.name}
              maxLength={100}
              required
              onCommit={(name) => change(index, { name })}
            />
            <label className="field">
              <span>Kind</span>
              <select
                aria-label={`Spot ${index + 1} kind`}
                value={spot.kind}
                onChange={(e) => change(index, { kind: e.target.value as PanoramaSpot['kind'] })}
              >
                <option value="marker">Marker: shows a label</option>
                <option value="hotspot">Hotspot: runs triggers only</option>
              </select>
            </label>
            <div className="field-row">
              {angle(`Spot ${index + 1} yaw`, spot.yaw, -180, 180, (yaw) => change(index, { yaw }))}
              {angle(`Spot ${index + 1} pitch`, spot.pitch, -90, 90, (pitch) =>
                change(index, { pitch }),
              )}
            </div>
            {spot.kind === 'marker' && (
              <>
                <CommitField
                  label={`Spot ${index + 1} title`}
                  value={spot.title}
                  maxLength={200}
                  onCommit={(title) => change(index, { title })}
                />
                <CommitField
                  label={`Spot ${index + 1} text`}
                  value={spot.body}
                  maxLength={5000}
                  multiline
                  onCommit={(body) => change(index, { body })}
                />
              </>
            )}
            <div className="button-row">
              <button
                type="button"
                aria-label={`Move spot ${index + 1} up`}
                disabled={index === 0}
                onClick={() => swap(index, index - 1)}
              >
                Up
              </button>
              <button
                type="button"
                aria-label={`Move spot ${index + 1} down`}
                disabled={index === spots.length - 1}
                onClick={() => swap(index, index + 1)}
              >
                Down
              </button>
              <button
                type="button"
                aria-label={`Remove spot ${index + 1}`}
                onClick={() => setSpots(spots.filter((_, at) => at !== index))}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={spots.length >= 50}
        onClick={() =>
          setSpots([
            ...spots,
            createPanoramaSpot(`Spot ${spots.length + 1}`, props.start.yaw, props.start.pitch),
          ])
        }
      >
        Add spot
      </button>
    </section>
  );
}
