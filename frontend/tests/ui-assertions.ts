import type { Locator } from "@playwright/test";

// Measure rendered sRGB colors, including CSS color() / color-mix() values.
export async function contrastRatio(locator: Locator, property = "color") {
  return locator.evaluate((element, foregroundProperty) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas color measurement unavailable.");
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const blend = (front: number[], back: number[]) => {
      const alpha = front[3] / 255;
      return front.slice(0, 3).map((value, index) => value * alpha + back[index] * (1 - alpha)).concat(255);
    };
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    let background = [255, 255, 255, 255];
    for (const node of ancestors) background = blend(rgba(getComputedStyle(node).backgroundColor), background);
    const foreground = blend(rgba(getComputedStyle(element).getPropertyValue(foregroundProperty)), background);
    const luminance = (color: number[]) => {
      const linear = color.slice(0, 3).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const first = luminance(foreground), second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }, property);
}
