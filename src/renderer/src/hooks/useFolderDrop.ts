import { useEffect, useState } from "react";

interface Options {
  /**
   * Called when the user drops a single folder onto the document.
   * The handler receives the resolved absolute path. Drops carrying
   * multiple items, files (not folders), or no items are silently
   * ignored — `onReject` is the place to surface that to the user.
   */
  onFolder: (absolutePath: string) => void;
  /**
   * Called when a drop landed but didn't match the "single folder"
   * contract — multi-drop, file-not-folder, empty drop. Receives a
   * short reason string suitable for a toast / inline note.
   */
  onReject?: (reason: string) => void;
}

interface DropState {
  /** True while the user is dragging a candidate over the window. */
  isDragOver: boolean;
}

/**
 * Document-level drag-and-drop listener that accepts a single folder
 * and resolves it to an absolute path via the preload bridge.
 *
 * Why document-level: we want the entire window to act as a drop target,
 * not just one component. This avoids the "drop sometimes works, sometimes
 * doesn't" feel that drop zones bound to a small element have.
 *
 * Drag-leave detection is the gnarly part — `dragleave` fires on every
 * child element traversal during a drag. Browsers don't give us a clean
 * "left the document" event. We use a counter approach: increment on
 * dragenter, decrement on dragleave; show the overlay only when the
 * counter is positive.
 */
export function useFolderDrop({ onFolder, onReject }: Options): DropState {
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    let depth = 0;

    function isFileDrag(e: DragEvent): boolean {
      // Browsers expose dataTransfer.types during a drag. "Files" is the
      // canonical type for filesystem drags from the OS file manager.
      // Filtering on this avoids reacting to in-app text/HTML drags.
      return Array.from(e.dataTransfer?.types ?? []).includes("Files");
    }

    function onDragEnter(e: DragEvent): void {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth += 1;
      if (depth === 1) setIsDragOver(true);
    }

    function onDragOver(e: DragEvent): void {
      if (!isFileDrag(e)) return;
      // Required to permit a drop on this element.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(e: DragEvent): void {
      if (!isFileDrag(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDragOver(false);
    }

    function onDrop(e: DragEvent): void {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth = 0;
      setIsDragOver(false);

      const items = e.dataTransfer?.items;
      const files = e.dataTransfer?.files;
      if (!items || !files || files.length === 0) {
        onReject?.("Couldn't read the dropped item.");
        return;
      }
      if (files.length > 1) {
        onReject?.("Drop a single folder, not multiple items.");
        return;
      }

      const file = files[0];
      // dataTransfer.items[i].webkitGetAsEntry().isDirectory is the
      // browser-standard way to tell folders from files in a drop. File
      // metadata alone (size === 0, type === "") is not reliable.
      const entry = items[0]?.webkitGetAsEntry?.();
      if (!entry || !entry.isDirectory) {
        onReject?.("Drop a folder, not a file.");
        return;
      }

      const path = window.api.files.pathForFile(file);
      if (!path) {
        onReject?.("Couldn't resolve that folder's path.");
        return;
      }
      onFolder(path);
    }

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [onFolder, onReject]);

  return { isDragOver };
}
