export function setupReactPatch() {
  const { findByProps } = (window as any).webpackHelpers;

  const ReactDOMClient = findByProps(
    "createRoot",
    "hydrateRoot",
  ) as typeof import("react-dom/client");

  const React = findByProps(
    "useState",
    "useEffect",
    "createElement",
  ) as typeof import("react");

  if (!React || !React.createElement) {
    console.warn("[ReactPatch] React not found, patch aborted.");
    return;
  }

  (window as any).React = React;

  if (!React || !React.createElement) {
    console.warn("[ReactPatch] React not found, patch aborted.");
    return;
  }

  function getElementName(type: any): string {
    if (typeof type === "string") return type;
    if (type.displayName) return type.displayName;
    if (type.name) return type.name;
    return "Unknown";
  }

  // Keep your original approach - it works!
  function getFiberRoot() {
    const container = document.querySelector(".p-client_container");
    if (!container) return null;

    const rootKey = Object.keys(container).find((k) =>
      k.startsWith("__reactContainer$"),
    );
    if (!rootKey) return null;

    return container[rootKey];
  }

  // Initialize ReactDOMRoot constructor once at setup time
  const tempRoot = ReactDOMClient.createRoot(document.createElement("div"));
  tempRoot.unmount();
  const ReactDOMRoot = tempRoot.constructor as any;

  function getRoot() {
    const fiberRoot = getFiberRoot();
    if (!fiberRoot) {
      console.warn("[ReactPatch] Could not find React fiber root.");
      return null;
    }
    return new ReactDOMRoot(fiberRoot);
  }

  function dirtyMemoizationCache() {
    const fiberRoot = getFiberRoot();
    if (!fiberRoot) {
      console.warn(
        "[ReactPatch] Could not find fiber root, cannot dirty cache.",
      );
      return;
    }

    const poison = (node: any) => {
      if (!node) return;
      if (node.memoizedProps && typeof node.memoizedProps === "object") {
        node.memoizedProps = { ...node.memoizedProps, _poison: 1 };
      }
      poison(node.child);
      poison(node.sibling);
    };
    poison(fiberRoot);
  }

  type ReactElementType = string | React.JSXElementConstructor<any>;
  const elementReplacements = new Map<ReactElementType, ReactElementType>();

  React.createElement = new Proxy(React.createElement, {
    apply(target, thisArg, [type, props, ...children]) {
      const replacement = elementReplacements.get(type);
      const __original = props && props["__original"];
      if (__original) delete props["__original"];

      if (replacement && !__original) {
        console.log(
          `[ReactPatch] React. createElement: Replacing element ${getElementName(type)} with ${getElementName(replacement)}`,
        );
        return Reflect.apply(target, thisArg, [
          replacement,
          props,
          ...children,
        ]);
      }
      return Reflect.apply(target, thisArg, [type, props, ...children]);
    },
  });

  function patchComponent<P = any>(
    original: ReactElementType,
    replacement: ReactElementType | null,
  ): void {
    if (typeof replacement === "function") {
      if (!(replacement as any).displayName) {
        (replacement as any).displayName =
          `Patched(${getElementName(original)})`;
      }
    }

    if (replacement === null || replacement === undefined) {
      elementReplacements.delete(original);
      console.log(
        `[ReactPatch] patchComponent: Unpatched component ${getElementName(original)}`,
        elementReplacements,
      );
    } else {
      elementReplacements.set(original, replacement);
      console.log(
        `[ReactPatch] patchComponent: Patched component ${getElementName(original)} with ${getElementName(replacement)}`,
        elementReplacements,
      );
    }

    dirtyMemoizationCache();
  }

  const reactPatchAPI = {
    replaceComponent: patchComponent,
    removeReplacement: (originalType: ReactElementType) => {
      elementReplacements.delete(originalType);
      dirtyMemoizationCache();
    },
    clearReplacements: () => {
      elementReplacements.clear();
      dirtyMemoizationCache();
    },
    getReplacements: (): Map<ReactElementType, ReactElementType> =>
      new Map(elementReplacements),
    patchComponent,
    getRoot,
  };

  (window as any).reactPatchAPI = reactPatchAPI;
}
