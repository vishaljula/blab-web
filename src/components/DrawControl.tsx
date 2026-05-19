"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-map-gl/mapbox";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

interface DrawControlProps {
  onDrawComplete: (polygon: number[][]) => void;
}

export default function DrawControl({ onDrawComplete }: DrawControlProps) {
  const { current: map } = useMap();
  const drawRef = useRef<MapboxDraw | null>(null);

  useEffect(() => {
    if (!map) return;

    const mapInstance = map.getMap();

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      defaultMode: "draw_polygon",
      styles: [
        // Polygon fill
        {
          id: "gl-draw-polygon-fill",
          type: "fill",
          filter: ["all", ["==", "$type", "Polygon"]],
          paint: {
            "fill-color": "#8B2500",
            "fill-opacity": 0.1,
          },
        },
        // Polygon outline
        {
          id: "gl-draw-polygon-stroke",
          type: "line",
          filter: ["all", ["==", "$type", "Polygon"]],
          paint: {
            "line-color": "#8B2500",
            "line-width": 2,
            "line-dasharray": [2, 2],
          },
        },
        // Vertex points
        {
          id: "gl-draw-point",
          type: "circle",
          filter: ["all", ["==", "$type", "Point"]],
          paint: {
            "circle-radius": 5,
            "circle-color": "#8B2500",
          },
        },
        // Midpoints
        {
          id: "gl-draw-polygon-midpoint",
          type: "circle",
          filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
          paint: {
            "circle-radius": 3,
            "circle-color": "#8B2500",
          },
        },
      ],
    });

    drawRef.current = draw;
    mapInstance.addControl(draw, "top-left");

    const handleCreate = (e: { features: GeoJSON.Feature[] }) => {
      const feature = e.features[0];
      if (feature?.geometry?.type === "Polygon") {
        const coordinates = (feature.geometry as GeoJSON.Polygon).coordinates[0];
        onDrawComplete(coordinates);
        // Remove drawn polygon from draw layer (we'll show it differently)
        draw.deleteAll();
      }
    };

    mapInstance.on("draw.create", handleCreate);

    return () => {
      mapInstance.off("draw.create", handleCreate);
      try {
        mapInstance.removeControl(draw);
      } catch {
        // Control may already be removed
      }
    };
  }, [map, onDrawComplete]);

  return null;
}
