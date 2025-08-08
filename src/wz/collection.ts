export interface WzCollectionEntry {
    name: string;
    value: unknown;
    collection: boolean;
}

export abstract class WzCollection {
    async get(path: string): Promise<unknown> {
        const i = path.indexOf("/");
        const key = i >= 0 ? path.slice(0, i) : path;
        if (!key) {
            return this;
        }
        const rest = i >= 0 ? path.slice(i + 1) : "";
        return this.getInternal(key, rest);
    }

    abstract getInternal(key: string, rest: string): Promise<unknown>;

    abstract collect(): Promise<WzCollectionEntry[]>;
}