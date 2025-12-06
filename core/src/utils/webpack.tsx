// jeremy \o/

export function setupWebpackHelpers() {
  const global = globalThis as any;
  const webpackChunkwebapp = global.webpackChunkwebapp as any[];
  let __webpack_require__: any;

  webpackChunkwebapp.push([
    [Symbol()],
    {},
    (r: any) => {
      __webpack_require__ = r;
    },
  ]);

  type Filter = (mod: any) => boolean;

  function allExports(): any[] {
    return webpackChunkwebapp
      .flatMap((chunk) => Object.keys(chunk[1]))
      .map((id) => {
        try {
          return __webpack_require__(id);
        } catch {
          return undefined;
        }
      })
      .filter((value): value is any => Boolean(value));
  }

  function wrapFilter(filter: Filter): Filter {
    return (mod: any) => {
      try {
        return filter(mod);
      } catch {
        return false;
      }
    };
  }

  function find(_filter: Filter, tryDefault = true): any | undefined {
    const filter = wrapFilter(_filter);
    for (const m of allExports()) {
      if (tryDefault && m.default && filter(m.default)) return m.default;
      if (filter(m)) return m;
    }
  }

  function findByProps(...props: string[]): any | undefined {
    return find((m) => props.every((x) => m[x] !== undefined));
  }

  function findExport(filter: Filter, all = false): any | any[] | null {
    const exports = allExports();
    const results = new Set<any>();

    for (const exp of exports) {
      try {
        if (filter(exp)) {
          if (!all) return exp;
          results.add(exp);
        }
      } catch {}
      for (const key in exp) {
        if (!Object.prototype.hasOwnProperty.call(exp, key)) continue;
        try {
          const candidate = exp[key];
          if (filter(candidate)) {
            if (!all) return candidate;
            results.add(candidate);
          }
        } catch {}
      }
    }

    return all ? [...results] : null;
  }

  function findComponent(
    name: string,
    all = false,
    filter?: Filter,
  ): any | any[] {
    const found = findExport(
      (exp) =>
        typeof exp === "function" &&
        exp.displayName === name &&
        (!filter || filter(exp)),
      all,
    );

    if (!found) {
      return () => (
        // @ts-ignore
        <div style={{ color: "red", fontWeight: "bold" }}>
          ⚠️ Missing component: {name}
        </div>
      );
    }

    return found;
  }

  global.webpackHelpers = {
    allExports,
    wrapFilter,
    find,
    findByProps,
    findComponent,
  };
}
