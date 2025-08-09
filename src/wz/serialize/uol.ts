import { WzArchive } from "../archive";

export class WzUol {
    uol: string;

    constructor(uol: string) {
        this.uol = uol;
    }
    static async deserialize(archive: WzArchive): Promise<WzUol> {
        archive.position += 1;
        return new WzUol(await archive.deserializeString());
    }
}