import { loadFont as loadSyne } from "@remotion/google-fonts/Syne";
import { loadFont as loadBebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadDMSans } from "@remotion/google-fonts/DMSans";

const syne = loadSyne();
const bebas = loadBebas();
const dmSans = loadDMSans();

/** Premium display font for wordmarks / titles */
export const FONT_DISPLAY = syne.fontFamily;
/** Tall condensed impact font for giant kinetic words */
export const FONT_IMPACT = bebas.fontFamily;
/** Clean body font for subtitles / small copy */
export const FONT_BODY = dmSans.fontFamily;
