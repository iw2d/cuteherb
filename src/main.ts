import { WzPackage, WzSound } from "./wz";

const input = document.querySelector<HTMLInputElement>("#input")!;
const output = document.querySelector<HTMLPreElement>("#output")!;

input.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        output.textContent = "No file selected";
        return;
    }

    try {
        let start = performance.now();
        const p = await WzPackage.from(file, "95");
        console.log(`Async execution took ${(performance.now() - start).toFixed(3)} ms`);
        start = performance.now();
        const sound = await p.get("Bgm19.img/RienVillage") as WzSound;
        console.log(`Async execution took ${(performance.now() - start).toFixed(3)} ms`);

        const url = URL.createObjectURL(sound.data);
        const audio = new Audio(url);
        audio.play();
    } catch (error) {
        console.log(error);
        output.textContent = `Error reading file: ${error}`;
    }
});
