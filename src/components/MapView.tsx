"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import Map, {
  NavigationControl,
  GeolocateControl,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useDebouncedCallback } from "use-debounce";
import { useListingsStore } from "@/store/listings";
import PriceMarkers from "./PriceMarkers";
import DrawControl from "./DrawControl";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Hyderabad center — launch city
const INITIAL_VIEW = {
  latitude: 17.385,
  longitude: 78.4867,
  zoom: 12,
};

export default function MapView() {
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const {
    boundary,
    drawActive,
    setBoundary,
    setViewportBounds,
    listings,
    setSelectedListing,
  } = useListingsStore();

  // Fit map to city boundary when selected from search
  useEffect(() => {
    if (boundary?.type === "city" && boundary.bbox && mapRef.current) {
      mapRef.current.fitBounds(
        [
          [boundary.bbox[0], boundary.bbox[1]],
          [boundary.bbox[2], boundary.bbox[3]],
        ],
        { padding: 40, duration: 1000 }
      );
    }
  }, [boundary]);

  // Update viewport bounds on map move (debounced) — used to fetch listings in view
  const handleMoveEnd = useDebouncedCallback(
    (_evt: ViewStateChangeEvent) => {
      const map = mapRef.current;
      if (!map) return;
      const bounds = map.getMap().getBounds();
      if (bounds) {
        setViewportBounds([
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ]);
      }
    },
    300
  );

  const handleLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getMap().getBounds();
    if (bounds) {
      setViewportBounds([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    }
  }, [setViewportBounds]);

  const handleDrawCreate = useCallback(
    (polygon: number[][]) => {
      setBoundary({
        type: "polygon",
        coordinates: polygon,
        label: "Custom Area",
      });
    },
    [setBoundary]
  );

  return (
    <div className="map-container" id="map-container">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={INITIAL_VIEW}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />
        <GeolocateControl
          position="top-right"
          trackUserLocation={false}
          showAccuracyCircle={false}
        />

        {mapLoaded && (
          <PriceMarkers
            listings={listings}
            onSelect={setSelectedListing}
          />
        )}

        {drawActive && (
          <DrawControl onDrawComplete={handleDrawCreate} />
        )}
      </Map>
    </div>
  );
}
