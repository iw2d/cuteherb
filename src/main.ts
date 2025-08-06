import { WzPackage } from "./wz";

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
        const p = WzPackage.from(file);
        await p.init("95");
        console.log(`Async execution took ${(performance.now() - start).toFixed(3)} ms`);
        console.log(p);
        start = performance.now();
        console.log(await p.get("Map/Map1/120020272.img"));
        console.log(`Async execution took ${(performance.now() - start).toFixed(3)} ms`);
    } catch (error) {
        output.textContent = `Error reading file: ${error}`;
    }
});
