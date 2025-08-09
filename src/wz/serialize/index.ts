import { WzArchive } from "../archive";
import { WzProperty } from "./property";
import { WzCanvas } from "./canvas";
import { WzVector, WzConvex } from "./shape";
import { WzSound } from "./sound";
import { WzUol } from "./uol";

export { WzProperty, WzCanvas, WzVector, WzConvex, WzSound, WzUol };

export type WzSerialize = WzProperty | WzCanvas | WzVector | WzConvex | WzSound | WzUol;

export async function deserializeObject(archive: WzArchive): Promise<WzSerialize> {
    const type = await archive.deserializeString();
    if (type === "Property") {
        return await WzProperty.deserialize(archive);
    } else if (type === "Canvas") {
        return await WzCanvas.deserialize(archive);
    } else if (type === "Shape2D#Vector2D") {
        return await WzVector.deserialize(archive);
    } else if (type === "Shape2D#Convex2D") {
        return await WzConvex.deserialize(archive);
    } else if (type === "Sound_DX8") {
        return await WzSound.deserialize(archive);
    } else if (type === "UOL") {
        return await WzUol.deserialize(archive);
    } else {
        throw new Error(`Unknown property type : ${type}`);
    }
}