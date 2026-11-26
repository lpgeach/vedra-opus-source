import { byLayout, courseName, tabbableObjects, tabOrder } from '@vedraopus/model';
import type { Slide } from '@vedraopus/model';

/**
 * The Slide panel's Tab order (docs/briefs/P10.1-accessibility.md, part B): the
 * objects a learner reaches with Tab, in the order they come. It follows the
 * layout (top to bottom, then left to right) unless the author sets their own.
 */
export function TabOrder({
  slide,
  set,
}: {
  slide: Slide;
  /** Save the slide's Tab order: the author's list, or null for the layout's. */
  set: (focusOrder: string[] | null) => void;
}) {
  const objects = tabbableObjects(slide);
  if (objects.length === 0) return null;
  const own = slide.properties.focusOrder !== null;
  const order = tabOrder(slide);
  const move = (index: number, by: number) => {
    const ids = order.map((object) => object.id);
    const [moving] = ids.splice(index, 1);
    ids.splice(index + by, 0, moving!);
    set(ids);
  };
  return (
    <fieldset className="tab-order" data-testid="tab-order">
      <legend>Tab order</legend>
      <label className="field">
        <span>Order</span>
        <select
          aria-label="Tab order"
          value={own ? 'own' : 'layout'}
          onChange={(e) =>
            set(e.target.value === 'own' ? byLayout(objects).map((object) => object.id) : null)
          }
        >
          <option value="layout">Follow the layout</option>
          <option value="own">My own order</option>
        </select>
      </label>
      <ol className="tab-order-list">
        {order.map((object, index) => {
          // As the learner hears it: its alt text, its words, or its name (the Phase 10 review).
          const name = courseName(object);
          return (
            <li key={object.id} data-testid="tab-order-item" data-tab-object={object.id}>
              <span>{name}</span>
              {own && (
                <span className="tab-order-moves">
                  <button
                    type="button"
                    aria-label={`Move ${name} earlier`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${name} later`}
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}
