import { WzArchive } from "../archive";
import { type WzSerialize, deserializeObject } from ".";

export class WzVector {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
    static async deserialize(archive: WzArchive): Promise<WzVector> {
        const x = await archive.read();
        const y = await archive.read();
        return new WzVector(x, y);
    }
}

export class WzConvex {
    items: Map<string, WzSerialize>;

    constructor() {
        this.items = new Map<string, WzSerialize>();
    }
    static async deserialize(archive: WzArchive): Promise<WzConvex> {
        const result = new WzConvex();
        const size = await archive.read();
        for (let i = 0; i < size; i++) {
            result.items.set(i.toString(), await deserializeObject(archive));
        }
        return result;
    }
}
