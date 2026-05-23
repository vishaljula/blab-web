"use client";

import { useMemo, useCallback } from "react";
import { Marker } from "react-map-gl/mapbox";
import Supercluster from "supercluster";
import { useListingsStore, type Listing } from "@/store/listings";
import { formatPrice } from "@/lib/format";

interface PriceMarkersProps {
  listings: Listing[];
  onSelect: (listing: Listing | null) => void;
}

// Create supercluster index
function createClusterIndex(listings: Listing[]) {
  const index = new Supercluster({
    radius: 10,   // px — minimal: only overlapping markers merge
    maxZoom: 20,
    minZoom: 0,
  });

  const points: Supercluster.PointFeature<{ listing: Listing }>[] =
    listings.map((listing) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [listing.longitude, listing.latitude],
      },
      properties: { listing },
    }));

  index.load(points);
  return index;
}

export default function PriceMarkers({ listings, onSelect }: PriceMarkersProps) {
  const { viewportBounds, selectedListing } = useListingsStore();

  const clusterIndex = useMemo(() => createClusterIndex(listings), [listings]);

  const clusters = useMemo(() => {
    if (!viewportBounds) return [];
    try {
      // Determine zoom from viewport size (approximate)
      const lngDelta = Math.abs(viewportBounds[2] - viewportBounds[0]);
      const zoom = Math.round(Math.log2(360 / lngDelta));
      return clusterIndex.getClusters(
        [viewportBounds[0], viewportBounds[1], viewportBounds[2], viewportBounds[3]],
        Math.min(Math.max(zoom, 0), 16)
      );
    } catch {
      return [];
    }
  }, [clusterIndex, viewportBounds]);

  const handleClusterClick = useCallback(
    (clusterId: number) => {
      // TODO: zoom into cluster via map ref callback
      // const zoom = clusterIndex.getClusterExpansionZoom(clusterId);
      void clusterId;
    },
    [clusterIndex]
  );

  return (
    <>
      {clusters.map((cluster) => {
        const [lng, lat] = cluster.geometry.coordinates;
        if (!isFinite(lng) || !isFinite(lat)) return null;
        const isCluster = cluster.properties.cluster;

        if (isCluster) {
          const clusterId = cluster.properties.cluster_id ?? 0;
          return (
            <Marker
              key={`cluster-${clusterId}`}
              longitude={lng}
              latitude={lat}
              anchor="center"
              onClick={(e: { originalEvent: MouseEvent }) => {
                e.originalEvent.stopPropagation();
                handleClusterClick(clusterId);
              }}
            >
              <div className="cluster-marker" />
            </Marker>
          );
        }

        const listing = cluster.properties.listing as Listing;
        const isActive = selectedListing?.id === listing.id;

        return (
          <Marker
            key={listing.id}
            longitude={lng}
            latitude={lat}
            anchor="bottom"
            onClick={(e: { originalEvent: MouseEvent }) => {
              e.originalEvent.stopPropagation();
              onSelect(listing);
            }}
          >
            <div
              className={`price-marker ${isActive ? "price-marker--active" : ""}`}
            >
              {formatPrice(listing.price)}
            </div>
          </Marker>
        );
      })}
    </>
  );
}
