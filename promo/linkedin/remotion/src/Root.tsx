import { Composition } from "remotion";
import { EpicDemo, TOTAL_FRAMES } from "./EpicDemo";
import { EpicShort, SHORT_TOTAL_FRAMES } from "./EpicShort";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EpicDemo"
        component={EpicDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="EpicShort"
        component={EpicShort}
        durationInFrames={SHORT_TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
