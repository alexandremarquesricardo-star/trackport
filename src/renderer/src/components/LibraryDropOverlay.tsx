import "./LibraryDropOverlay.css";
import { BrandMark } from "./BrandMark";

interface Props {
  visible: boolean;
  /** Whether a library is already set; changes the call-to-action copy. */
  willReplace: boolean;
}

/**
 * Full-window overlay shown while the user is dragging a folder over the
 * app. Communicates the drop target visually and tells the user what's
 * about to happen ("set as library" vs "replace existing library") so a
 * mis-aimed drag doesn't surprise-replace their setup.
 */
export function LibraryDropOverlay({ visible, willReplace }: Props): JSX.Element | null {
  if (!visible) return null;
  return (
    <div className="library-drop" aria-hidden="true">
      <div className="library-drop__panel">
        <BrandMark size={56} />
        <div className="library-drop__title">
          {willReplace ? "Drop to replace your library" : "Drop folder to use as library"}
        </div>
        <div className="library-drop__sub">One folder. We&apos;ll scan it for audio.</div>
      </div>
    </div>
  );
}
