const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
// 3D models (glTF binary) used as live-tracking map markers
if (!config.resolver.assetExts.includes("glb")) config.resolver.assetExts.push("glb");

module.exports = withNativeWind(config, { input: "./global.css" });
