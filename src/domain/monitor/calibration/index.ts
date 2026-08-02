export { MONITOR_CALIBRATION_VERSION } from "./version.ts";
export {
  histogram,
  meanWithCI,
  proportionWithCI,
  type MeanCI,
  type ProportionCI,
} from "./stats.ts";
export {
  computeCalibrationReport,
  type CalibrationReport,
  type DescriptiveOutcome,
  type IntensityByState,
  type StateDurationRow,
  type TransitionRow,
} from "./metrics.ts";
export {
  alignFramesForShadow,
  compareShadowPairs,
  type ShadowCompareReport,
  type ShadowFramePair,
} from "./shadow.ts";
