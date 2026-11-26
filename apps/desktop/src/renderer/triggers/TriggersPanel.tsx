import { createId, findSlide } from '@vedraopus/model';
import type { Slide, Trigger } from '@vedraopus/model';
import { useEffect, useRef, useState } from 'react';
import { editor, useEditor } from '../project-store';
import type { CurrentSlide, OpenProject } from '../project-store';
import { describeTrigger, namesFor } from './describe';
import { TriggerWizard } from './TriggerWizard';

/** A copied trigger, kept for Paste on this or another slide. */
let copied: Trigger | null = null;

interface Group {
  key: string;
  title: string;
  triggers: Trigger[];
}

/** Slide triggers first, then each object's, then each layer's, in the slide's list order. */
function groups(slide: Slide, names: ReturnType<typeof namesFor>): Group[] {
  const byOwner = new Map<string, Group>();
  const order = [
    `slide:${slide.id}`,
    ...[slide.baseLayer, ...slide.layers].flatMap((l) => l.objects.map((o) => `object:${o.id}`)),
    ...slide.layers.map((l) => `layer:${l.id}`),
  ];
  for (const trigger of slide.triggers) {
    const key = `${trigger.owner.kind}:${trigger.owner.id}`;
    const title =
      trigger.owner.kind === 'slide'
        ? 'Slide'
        : trigger.owner.kind === 'object'
          ? names.object(trigger.owner.id)
          : names.layer(trigger.owner.id).replace(/^layer /, 'Layer: ');
    if (!byOwner.has(key)) byOwner.set(key, { key, title, triggers: [] });
    byOwner.get(key)!.triggers.push(trigger);
  }
  return [...byOwner.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/** The current slide's triggers, grouped by who owns them, with the tools to change them. */
export function TriggersPanel({
  open,
  current,
}: {
  open: OpenProject;
  current: CurrentSlide | undefined;
}) {
  const { selection, newTriggerAsked } = useEditor();
  const [editing, setEditing] = useState<Trigger | 'new' | null>(null);
  const [, setPasteable] = useState(copied !== null);
  // Insert → Trigger (B17) asks for the wizard from outside the panel.
  const asked = useRef(newTriggerAsked);
  useEffect(() => {
    if (newTriggerAsked === asked.current) return;
    asked.current = newTriggerAsked;
    setEditing('new');
  }, [newTriggerAsked]);
  if (!current || current.isMaster) {
    return <p className="placeholder">Triggers are added on slides, in Slide View.</p>;
  }
  // The slide as stored, not the stand-in the stage uses while a layer is edited.
  const slide = findSlide(open.project, current.slide.id)?.slide ?? current.slide;
  const { history } = open;
  const names = namesFor(open.project, slide);
  const list = groups(slide, names);

  /** Move a trigger past the next one with the same owner, up or down. */
  const move = (trigger: Trigger, step: -1 | 1) => {
    const same = slide.triggers.filter(
      (t) => t.owner.kind === trigger.owner.kind && t.owner.id === trigger.owner.id,
    );
    const neighbour = same[same.indexOf(trigger) + step];
    if (!neighbour) return;
    history.execute('trigger.move', {
      triggerId: trigger.id,
      index: slide.triggers.indexOf(neighbour),
    });
  };
  const paste = () => {
    if (!copied) return;
    try {
      history.execute('trigger.add', {
        slideId: slide.id,
        trigger: { ...structuredClone(copied), id: createId('trigger') },
      });
    } catch {
      editor.showError(
        'That trigger refers to objects or layers that are not on this slide, so it was not pasted.',
      );
    }
  };

  return (
    <div className="triggers-panel" data-testid="triggers-panel">
      <div className="panel-actions">
        <button onClick={() => setEditing('new')}>New trigger</button>
        <button disabled={copied === null} onClick={paste}>
          Paste trigger
        </button>
        <button onClick={() => editor.setVariablesOpen(true)}>
          Variables ({open.project.variables.length})
        </button>
      </div>
      {list.length === 0 && (
        <p className="placeholder">
          No triggers on this slide. Triggers make things happen, such as showing an object when a
          button is clicked.
        </p>
      )}
      {list.map((group) => (
        <section key={group.key} className="trigger-group" aria-label={group.title}>
          <h3 className="panel-subtitle">{group.title}</h3>
          <ol>
            {group.triggers.map((trigger, index) => (
              <li
                key={trigger.id}
                className="trigger-item"
                data-testid="trigger-item"
                data-enabled={trigger.enabled}
              >
                <input
                  type="checkbox"
                  aria-label="Enabled"
                  checked={trigger.enabled}
                  onChange={(e) =>
                    history.execute('trigger.update', {
                      triggerId: trigger.id,
                      changes: { enabled: e.target.checked },
                    })
                  }
                />
                <button className="trigger-text" title="Edit" onClick={() => setEditing(trigger)}>
                  {describeTrigger(trigger, names)}
                </button>
                <span className="trigger-tools">
                  <button
                    aria-label="Move trigger up"
                    disabled={index === 0}
                    onClick={() => move(trigger, -1)}
                  >
                    ▲
                  </button>
                  <button
                    aria-label="Move trigger down"
                    disabled={index === group.triggers.length - 1}
                    onClick={() => move(trigger, 1)}
                  >
                    ▼
                  </button>
                  <button
                    aria-label="Copy trigger"
                    onClick={() => {
                      copied = structuredClone(trigger);
                      setPasteable(true);
                    }}
                  >
                    ⧉
                  </button>
                  <button
                    aria-label="Delete trigger"
                    onClick={() => history.execute('trigger.remove', { triggerId: trigger.id })}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {editing && (
        <TriggerWizard
          open={open}
          slide={slide}
          {...(editing === 'new' ? {} : { existing: editing })}
          {...(editing === 'new' && selection.length === 1 ? { objectId: selection[0]! } : {})}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
